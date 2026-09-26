import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  DECISION_ACTIONS,
  DECISION_RESULT_STATUS,
  FINAL_STATUSES,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  type ActivityEntry,
  type CaseDetail,
  type CaseStatus,
  type CheckResult,
  type DecisionAction,
  type DecisionInput,
  type QueueCase,
  type RiskLevel,
  type VerificationCheck,
} from './types.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  applicant_name TEXT NOT NULL,
  email TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  nationality TEXT NOT NULL,
  country_of_residence TEXT NOT NULL,
  address TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_number TEXT NOT NULL,
  product TEXT NOT NULL,
  declared_occupation TEXT NOT NULL,
  expected_monthly_volume TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','info_requested','approved','escalated')),
  assigned_reviewer TEXT NOT NULL,
  review_reason TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low','medium','high')),
  flagged INTEGER NOT NULL DEFAULT 0,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS verification_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass','warn','fail')),
  detail TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_case ON activity(case_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
`;

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

interface CaseRow {
  id: string;
  applicant_name: string;
  email: string;
  date_of_birth: string;
  nationality: string;
  country_of_residence: string;
  address: string;
  document_type: string;
  document_number: string;
  product: string;
  declared_occupation: string;
  expected_monthly_volume: string;
  submitted_at: string;
  status: CaseStatus;
  assigned_reviewer: string;
  review_reason: string;
  risk_level: RiskLevel;
  flagged: number;
  decided_at: string | null;
}

interface CheckRow {
  name: string;
  result: CheckResult;
  detail: string;
}

interface ActivityRow {
  id: number;
  action: string;
  reason: string;
  reviewer: string;
  created_at: string;
}

function toQueueCase(row: CaseRow): QueueCase {
  return {
    id: row.id,
    applicantName: row.applicant_name,
    submittedAt: row.submitted_at,
    status: row.status,
    assignedReviewer: row.assigned_reviewer,
    reviewReason: row.review_reason,
    riskLevel: row.risk_level,
    flagged: row.flagged === 1,
  };
}

export class ValidationError extends Error {
  readonly status = 400;
  readonly field: string | undefined;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
}

export class ConflictError extends Error {
  readonly status = 409;
}

export interface QueueFilter {
  status?: string;
  q?: string;
}

export class CaseRepository {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM cases').get() as { n: number };
    return row.n;
  }

  listQueue(filter: QueueFilter = {}): QueueCase[] {
    const where: string[] = [];
    const params: string[] = [];
    if (filter.status && filter.status !== 'all') {
      where.push('status = ?');
      params.push(filter.status);
    }
    if (filter.q && filter.q.trim()) {
      where.push(
        "(applicant_name LIKE ? ESCAPE '\\' COLLATE NOCASE OR id LIKE ? ESCAPE '\\' COLLATE NOCASE)",
      );
      const like = `%${filter.q.trim().replace(/[\\%_]/g, '\\$&')}%`;
      params.push(like, like);
    }
    const sql = `SELECT * FROM cases ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY submitted_at ASC, id ASC`;
    const rows = this.db.prepare(sql).all(...params) as unknown as CaseRow[];
    return rows.map(toQueueCase);
  }

  getDetail(id: string): CaseDetail {
    const row = this.db.prepare('SELECT * FROM cases WHERE id = ?').get(id) as CaseRow | undefined;
    if (!row) throw new NotFoundError(`Case ${id} not found`);
    const checks = this.db
      .prepare('SELECT name, result, detail FROM verification_checks WHERE case_id = ? ORDER BY id')
      .all(id) as unknown as CheckRow[];
    return {
      ...toQueueCase(row),
      applicant: {
        email: row.email,
        dateOfBirth: row.date_of_birth,
        nationality: row.nationality,
        countryOfResidence: row.country_of_residence,
        address: row.address,
        documentType: row.document_type,
        documentNumber: row.document_number,
        product: row.product,
        declaredOccupation: row.declared_occupation,
        expectedMonthlyVolume: row.expected_monthly_volume,
      },
      decidedAt: row.decided_at,
      checks: checks.map((c): VerificationCheck => ({ name: c.name, result: c.result, detail: c.detail })),
      history: this.getHistory(id),
    };
  }

  getHistory(id: string): ActivityEntry[] {
    const rows = this.db
      .prepare('SELECT id, action, reason, reviewer, created_at FROM activity WHERE case_id = ? ORDER BY created_at ASC, id ASC')
      .all(id) as unknown as ActivityRow[];
    return rows.map((r) => ({ id: r.id, action: r.action, reason: r.reason, reviewer: r.reviewer, createdAt: r.created_at }));
  }

  /**
   * Apply a reviewer decision to an open case. Validates input, refuses to
   * touch cases that already carry a final decision, and records the decision
   * in the activity history inside the same transaction as the status change.
   */
  applyDecision(id: string, input: unknown, now: Date = new Date()): CaseDetail {
    const decision = validateDecision(input);
    const nowIso = now.toISOString();

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT id, status FROM cases WHERE id = ?').get(id) as
        | Pick<CaseRow, 'id' | 'status'>
        | undefined;
      if (!row) throw new NotFoundError(`Case ${id} not found`);
      if (FINAL_STATUSES.includes(row.status)) {
        throw new ConflictError(`Case ${id} already has a final decision (${row.status}) and cannot be changed`);
      }

      const nextStatus = DECISION_RESULT_STATUS[decision.action];
      const isFinal = FINAL_STATUSES.includes(nextStatus);
      this.db
        .prepare('UPDATE cases SET status = ?, decided_at = ? WHERE id = ?')
        .run(nextStatus, isFinal ? nowIso : null, id);
      this.db
        .prepare('INSERT INTO activity (case_id, action, reason, reviewer, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, decision.action, decision.reason, decision.reviewer, nowIso);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return this.getDetail(id);
  }
}

export function validateDecision(input: unknown): DecisionInput {
  if (typeof input !== 'object' || input === null) {
    throw new ValidationError('Request body must be a JSON object');
  }
  const body = input as Record<string, unknown>;

  const action = body.action;
  if (typeof action !== 'string' || !(DECISION_ACTIONS as readonly string[]).includes(action)) {
    throw new ValidationError(`action must be one of: ${DECISION_ACTIONS.join(', ')}`, 'action');
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < MIN_REASON_LENGTH) {
    throw new ValidationError(`A written reason of at least ${MIN_REASON_LENGTH} characters is required`, 'reason');
  }
  if (reason.length > MAX_REASON_LENGTH) {
    throw new ValidationError(`reason must be at most ${MAX_REASON_LENGTH} characters`, 'reason');
  }

  const reviewer = typeof body.reviewer === 'string' ? body.reviewer.trim() : '';
  if (!reviewer) {
    throw new ValidationError('reviewer is required', 'reviewer');
  }

  return { action: action as DecisionAction, reason, reviewer };
}
