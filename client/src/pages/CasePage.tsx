import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { CheckBadge, RiskBadge, StatusBadge } from '../components/Badges';
import { formatDate, formatDateTime } from '../format';
import { ACTION_LABELS, FINAL_STATUSES, STATUS_LABELS, type CaseDetail, type DecisionAction } from '../types';

const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 2000;

const ACTIONS: { value: DecisionAction; label: string; hint: string; tone: string }[] = [
  { value: 'approve', label: 'Approve', hint: 'Applicant passes KYC; account can be opened.', tone: 'ok' },
  { value: 'request_info', label: 'Request more information', hint: 'Ask the applicant for further documents.', tone: 'neutral' },
  { value: 'escalate', label: 'Escalate', hint: 'Send to enhanced due diligence / MLRO.', tone: 'danger' },
];

export function CasePage({ reviewer }: { reviewer: string }) {
  const { id = '' } = useParams();
  return <CaseView key={id} id={id} reviewer={reviewer} />;
}

function CaseView({ id, reviewer }: { id: string; reviewer: string }) {
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getCase(id)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load case');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadError) {
    return (
      <section>
        <BackLink />
        <div className="alert error">{loadError}</div>
      </section>
    );
  }
  if (!detail) {
    return (
      <section>
        <BackLink />
        <p className="muted">Loading…</p>
      </section>
    );
  }

  const isFinal = FINAL_STATUSES.includes(detail.status);
  const a = detail.applicant;

  return (
    <section>
      <BackLink />
      <div className="page-head">
        <div>
          <p className="eyebrow mono">{detail.id}</p>
          <h1>
            {detail.flagged && (
              <span className="flag" title="Flagged by automated screening">
                ⚑
              </span>
            )}{' '}
            {detail.applicantName}
          </h1>
          <p className="muted">
            Submitted {formatDateTime(detail.submittedAt)} · Assigned to {detail.assignedReviewer}
          </p>
        </div>
        <div className="head-badges">
          <StatusBadge status={detail.status} />
          <RiskBadge level={detail.riskLevel} />
        </div>
      </div>

      <div className="callout">
        <strong>Reason for manual review:</strong> {detail.reviewReason}
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Submitted details</h2>
          <dl className="details">
            <Field label="Email" value={a.email} />
            <Field label="Date of birth" value={formatDate(a.dateOfBirth)} />
            <Field label="Nationality" value={a.nationality} />
            <Field label="Country of residence" value={a.countryOfResidence} />
            <Field label="Address" value={a.address} />
            <Field label="Document" value={`${a.documentType} ${a.documentNumber}`} />
            <Field label="Product" value={a.product} />
            <Field label="Occupation" value={a.declaredOccupation} />
            <Field label="Expected monthly volume" value={a.expectedMonthlyVolume} />
          </dl>
        </div>

        <div className="card">
          <h2>Verification checks</h2>
          <ul className="checks">
            {detail.checks.map((c) => (
              <li key={c.name} className={`check check-row-${c.result}`}>
                <div className="check-head">
                  <span>{c.name}</span>
                  <CheckBadge result={c.result} />
                </div>
                <p className="muted small">{c.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Decision</h2>
          {notice && (
            <div className="alert success" role="status">
              {notice}
            </div>
          )}
          {isFinal ? (
            <div className="alert info">
              This case was <strong>{STATUS_LABELS[detail.status].toLowerCase()}</strong>
              {detail.decidedAt ? ` on ${formatDateTime(detail.decidedAt)}` : ''}. Final decisions cannot be changed
              from this screen.
            </div>
          ) : (
            <DecisionForm
              caseId={detail.id}
              reviewer={reviewer}
              onSubmitted={(updated, message) => {
                setDetail(updated);
                setNotice(message);
              }}
            />
          )}
        </div>

        <div className="card">
          <h2>Activity history</h2>
          <ol className="timeline">
            {detail.history.map((h) => (
              <li key={h.id} className={`event event-${h.action}`}>
                <div className="event-head">
                  <strong>{ACTION_LABELS[h.action] ?? h.action}</strong>
                  <time dateTime={h.createdAt} className="muted small">
                    {formatDateTime(h.createdAt)}
                  </time>
                </div>
                <p>{h.reason}</p>
                <p className="muted small">by {h.reviewer}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function BackLink() {
  return (
    <Link to="/" className="back">
      ← Back to queue
    </Link>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DecisionForm({
  caseId,
  reviewer,
  onSubmitted,
}: {
  caseId: string;
  reviewer: string;
  onSubmitted: (detail: CaseDetail, message: string) => void;
}) {
  const [action, setAction] = useState<DecisionAction | ''>('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const reasonTooShort = trimmed.length < MIN_REASON_LENGTH;
  const reasonTooLong = trimmed.length > MAX_REASON_LENGTH;
  const canSubmit = action !== '' && !reasonTooShort && !reasonTooLong && reviewer !== '' && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (action === '') {
      setError('Choose a decision.');
      return;
    }
    if (reasonTooShort) {
      setError(`A written reason of at least ${MIN_REASON_LENGTH} characters is required.`);
      return;
    }
    if (reasonTooLong) {
      setError(`Reason must be at most ${MAX_REASON_LENGTH} characters.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.submitDecision(caseId, { action, reason: trimmed, reviewer });
      setAction('');
      setReason('');
      onSubmitted(updated, `Decision recorded: ${ACTION_LABELS[action]}. Status is now ${STATUS_LABELS[updated.status]}.`);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit decision');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="decision" onSubmit={handleSubmit} noValidate>
      <fieldset>
        <legend>Action</legend>
        {ACTIONS.map((opt) => (
          <label key={opt.value} className={`radio tone-${opt.tone} ${action === opt.value ? 'selected' : ''}`}>
            <input
              type="radio"
              name="action"
              value={opt.value}
              checked={action === opt.value}
              onChange={() => setAction(opt.value)}
            />
            <span>
              <strong>{opt.label}</strong>
              <span className="muted small">{opt.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="stack">
        <span>
          Reason{' '}
          <span className="muted small">
            (required, {MIN_REASON_LENGTH}–{MAX_REASON_LENGTH} characters)
          </span>
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Explain the basis for this decision. This is recorded in the case history."
          aria-invalid={reason.length > 0 && (reasonTooShort || reasonTooLong)}
        />
        {reasonTooLong && (
          <span className="muted small">
            {trimmed.length}/{MAX_REASON_LENGTH} characters
          </span>
        )}
      </label>

      <div className="form-foot">
        <span className="muted small">Recorded as {reviewer || '—'}</span>
        <button type="submit" className="primary" disabled={!canSubmit}>
          {submitting ? 'Submitting…' : 'Submit decision'}
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
