import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app.ts';
import { CaseRepository, ConflictError, NotFoundError, ValidationError, openDatabase } from '../src/db.ts';
import { seedDatabase } from '../src/seed.ts';
import type { CaseDetail, QueueCase } from '../src/types.ts';

const ORDINARY = 'KYC-1041'; // pending, all checks pass
const FLAGGED = 'KYC-1042'; // pending, flagged
const INFO_REQUESTED = 'KYC-1043';
const APPROVED = 'KYC-1044';
const ESCALATED = 'KYC-1045';

function freshRepo() {
  const db = openDatabase(':memory:');
  seedDatabase(db);
  return { db, repo: new CaseRepository(db) };
}

describe('CaseRepository.applyDecision', () => {
  it('approves a pending case and records a history entry with action, reason, reviewer and timestamp', () => {
    const { repo } = freshRepo();
    const before = repo.getDetail(ORDINARY);
    assert.equal(before.status, 'pending');
    const historyBefore = before.history.length;

    const now = new Date('2026-09-26T12:00:00.000Z');
    const after = repo.applyDecision(
      ORDINARY,
      { action: 'approve', reason: 'All automated checks passed; QA sample.', reviewer: 'Priya Natarajan' },
      now,
    );

    assert.equal(after.status, 'approved');
    assert.equal(after.decidedAt, now.toISOString());
    assert.equal(after.history.length, historyBefore + 1);
    const last = after.history.at(-1)!;
    assert.deepEqual(
      { action: last.action, reason: last.reason, reviewer: last.reviewer, createdAt: last.createdAt },
      {
        action: 'approve',
        reason: 'All automated checks passed; QA sample.',
        reviewer: 'Priya Natarajan',
        createdAt: now.toISOString(),
      },
    );
  });

  it('keeps history in chronological order across multiple decisions', () => {
    const { repo } = freshRepo();
    repo.applyDecision(
      FLAGGED,
      { action: 'request_info', reason: 'Need proof of address for the declared flat.', reviewer: 'Tom Okafor' },
      new Date('2026-09-26T09:00:00.000Z'),
    );
    const detail = repo.applyDecision(
      FLAGGED,
      { action: 'escalate', reason: 'Sanctions fuzzy match not cleared by documents provided.', reviewer: 'Tom Okafor' },
      new Date('2026-09-26T10:30:00.000Z'),
    );
    const times = detail.history.map((h) => h.createdAt);
    assert.deepEqual(times, [...times].sort());
    assert.deepEqual(
      detail.history.slice(-2).map((h) => h.action),
      ['request_info', 'escalate'],
    );
    assert.equal(detail.status, 'escalated');
  });

  it('request_info leaves the case open so a later decision is still allowed', () => {
    const { repo } = freshRepo();
    const detail = repo.applyDecision(INFO_REQUESTED, {
      action: 'approve',
      reason: 'Renewed BRP received and verified.',
      reviewer: 'Priya Natarajan',
    });
    assert.equal(detail.status, 'approved');
  });

  it('rejects a second approve/escalate on a case with a final decision and leaves history untouched', () => {
    const { repo } = freshRepo();
    for (const [id, action] of [
      [APPROVED, 'approve'],
      [APPROVED, 'escalate'],
      [ESCALATED, 'approve'],
      [ESCALATED, 'request_info'],
    ] as const) {
      const before = repo.getDetail(id);
      assert.throws(
        () => repo.applyDecision(id, { action, reason: 'Accidental repeat submission.', reviewer: 'Lena Fischer' }),
        ConflictError,
      );
      const after = repo.getDetail(id);
      assert.equal(after.status, before.status);
      assert.deepEqual(after.history, before.history);
    }
  });

  it('validates input and does not change state or history on invalid decisions', () => {
    const { repo } = freshRepo();
    const before = repo.getDetail(ORDINARY);
    const bad: unknown[] = [
      null,
      {},
      { action: 'approve', reviewer: 'Priya Natarajan' },
      { action: 'approve', reason: '   ', reviewer: 'Priya Natarajan' },
      { action: 'approve', reason: 'too short', reviewer: 'Priya Natarajan' },
      { action: 'reject', reason: 'Not a supported action here.', reviewer: 'Priya Natarajan' },
      { action: 'approve', reason: 'Missing the reviewer field.' },
      { action: 'approve', reason: 'x'.repeat(2001), reviewer: 'Priya Natarajan' },
    ];
    for (const input of bad) {
      assert.throws(() => repo.applyDecision(ORDINARY, input), ValidationError, JSON.stringify(input)?.slice(0, 60));
    }
    const after = repo.getDetail(ORDINARY);
    assert.equal(after.status, 'pending');
    assert.deepEqual(after.history, before.history);
  });

  it('throws NotFoundError for an unknown case', () => {
    const { repo } = freshRepo();
    assert.throws(
      () => repo.applyDecision('KYC-9999', { action: 'approve', reason: 'Does not matter here.', reviewer: 'x' }),
      NotFoundError,
    );
  });
});

describe('CaseRepository.listQueue', () => {
  it('treats LIKE wildcards in the search text literally', () => {
    const { repo } = freshRepo();
    const all = repo.listQueue({ status: 'all' });
    assert.ok(all.length > 0);
    assert.deepEqual(repo.listQueue({ status: 'all', q: '%' }), []);
    assert.deepEqual(repo.listQueue({ status: 'all', q: '_' }), []);
    assert.deepEqual(repo.listQueue({ status: 'all', q: 'KYC-104_' }), []);
    assert.deepEqual(
      repo.listQueue({ status: 'all', q: 'kyc-1041' }).map((c) => c.id),
      [ORDINARY],
    );
  });
});

describe('seedDatabase', () => {
  it('does not wipe existing data when a reset reseed fails', () => {
    const { db, repo } = freshRepo();
    repo.applyDecision(ORDINARY, { action: 'approve', reason: 'Keep me if the reseed fails.', reviewer: 'Tom Okafor' });
    const before = repo.getDetail(ORDINARY);

    db.exec('CREATE TRIGGER fail_seed BEFORE INSERT ON cases BEGIN SELECT RAISE(ABORT, "seed failure"); END;');
    assert.throws(() => seedDatabase(db, { reset: true }), /seed failure/);
    db.exec('DROP TRIGGER fail_seed');

    assert.equal(repo.count(), 8);
    assert.deepEqual(repo.getDetail(ORDINARY), before);
  });

  it('replaces existing data when a reset reseed succeeds', () => {
    const { db, repo } = freshRepo();
    repo.applyDecision(ORDINARY, { action: 'approve', reason: 'Will be discarded by reset.', reviewer: 'Tom Okafor' });
    assert.equal(seedDatabase(db, { reset: true }), 8);
    assert.equal(repo.getDetail(ORDINARY).status, 'pending');
  });
});

describe('persistence across restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kyc-test-'));
  const path = join(dir, 'kyc.sqlite');
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps decisions and history after closing and reopening the database', () => {
    let db = openDatabase(path);
    seedDatabase(db);
    new CaseRepository(db).applyDecision(ORDINARY, {
      action: 'escalate',
      reason: 'Persist me across a restart please.',
      reviewer: 'Marcus Reid',
    });
    db.close();

    db = openDatabase(path);
    assert.equal(seedDatabase(db), 0, 'must not reseed a populated database');
    const detail = new CaseRepository(db).getDetail(ORDINARY);
    db.close();

    assert.equal(detail.status, 'escalated');
    const last = detail.history.at(-1)!;
    assert.equal(last.action, 'escalate');
    assert.equal(last.reason, 'Persist me across a restart please.');
    assert.equal(last.reviewer, 'Marcus Reid');
  });
});

describe('HTTP API', () => {
  let server: Server;
  let base: string;

  before(async () => {
    const { db } = freshRepo();
    server = createApp({ db }).listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  const post = (id: string, body: unknown) =>
    fetch(`${base}/api/cases/${id}/decisions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  it('lists the queue with status filter and applicant search', async () => {
    const all = (await (await fetch(`${base}/api/cases?status=all`)).json()) as QueueCase[];
    assert.equal(all.length, 8);
    const pending = (await (await fetch(`${base}/api/cases?status=pending`)).json()) as QueueCase[];
    assert.ok(pending.length > 0 && pending.every((c) => c.status === 'pending'));
    const search = (await (await fetch(`${base}/api/cases?status=all&q=sokolov`)).json()) as QueueCase[];
    assert.deepEqual(
      search.map((c) => c.id),
      [FLAGGED],
    );
    assert.equal(search[0]!.flagged, true);
    const badStatus = await fetch(`${base}/api/cases?status=bogus`);
    assert.equal(badStatus.status, 400);
  });

  it('returns case detail with checks and history, 404 for unknown', async () => {
    const detail = (await (await fetch(`${base}/api/cases/${FLAGGED}`)).json()) as CaseDetail;
    assert.equal(detail.applicantName, 'Viktor Sokolov');
    assert.ok(detail.checks.some((c) => c.result === 'fail' || c.result === 'warn'));
    assert.ok(detail.history.length >= 2);
    assert.equal((await fetch(`${base}/api/cases/KYC-0000`)).status, 404);
  });

  it('returns 400 for invalid decisions and 201 with the updated case for valid ones', async () => {
    const invalid = await post(ORDINARY, { action: 'approve', reason: 'short', reviewer: 'Priya Natarajan' });
    assert.equal(invalid.status, 400);
    assert.equal(((await invalid.json()) as { field: string }).field, 'reason');

    const malformed = await post(ORDINARY, '{not json');
    assert.equal(malformed.status, 400);

    const ok = await post(ORDINARY, {
      action: 'approve',
      reason: 'All checks green, approving QA sample.',
      reviewer: 'Priya Natarajan',
    });
    assert.equal(ok.status, 201);
    const detail = (await ok.json()) as CaseDetail;
    assert.equal(detail.status, 'approved');
    assert.equal(detail.history.at(-1)?.action, 'approve');

    const queue = (await (await fetch(`${base}/api/cases?status=approved`)).json()) as QueueCase[];
    assert.ok(queue.some((c) => c.id === ORDINARY));
  });

  it('returns 409 when a final case receives another decision', async () => {
    const res = await post(APPROVED, { action: 'escalate', reason: 'Oops, clicked twice.', reviewer: 'Lena Fischer' });
    assert.equal(res.status, 409);
    const detail = (await (await fetch(`${base}/api/cases/${APPROVED}`)).json()) as CaseDetail;
    assert.equal(detail.status, 'approved');
    assert.equal(detail.history.filter((h) => h.action === 'escalate').length, 0);
  });
});
