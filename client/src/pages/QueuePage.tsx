import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { RiskBadge, StatusBadge } from '../components/Badges';
import { formatDate } from '../format';
import { STATUS_LABELS, type CaseStatus, type QueueCase } from '../types';

const STATUS_FILTERS: { value: 'all' | CaseStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: STATUS_LABELS.pending },
  { value: 'info_requested', label: STATUS_LABELS.info_requested },
  { value: 'approved', label: STATUS_LABELS.approved },
  { value: 'escalated', label: STATUS_LABELS.escalated },
];

export function QueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const status = searchParams.get('status') ?? 'pending';
  const q = searchParams.get('q') ?? '';

  const [cases, setCases] = useState<QueueCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .listCases({ status, q })
        .then((rows) => {
          if (cancelled) return;
          setCases(rows);
          setError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : 'Failed to load queue');
        });
    }, q ? 200 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, q]);

  function update(next: { status?: string; q?: string }) {
    const params = new URLSearchParams(searchParams);
    const nextStatus = next.status ?? status;
    const nextQ = next.q ?? q;
    if (nextStatus === 'pending') params.delete('status');
    else params.set('status', nextStatus);
    if (nextQ) params.set('q', nextQ);
    else params.delete('q');
    setSearchParams(params, { replace: true });
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Review queue</h1>
          <p className="muted">Applications routed for manual KYC review.</p>
        </div>
      </div>

      <div className="toolbar">
        <div className="segmented" role="tablist" aria-label="Filter by status">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              role="tab"
              type="button"
              aria-selected={status === f.value}
              className={status === f.value ? 'active' : ''}
              onClick={() => update({ status: f.value })}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="search"
          placeholder="Search applicant or case ID…"
          value={q}
          onChange={(e) => update({ q: e.target.value })}
          aria-label="Search by applicant"
        />
      </div>

      {error && <div className="alert error">{error}</div>}

      {cases === null && !error ? (
        <p className="muted">Loading…</p>
      ) : cases && cases.length === 0 ? (
        <div className="empty">No cases match the current filter.</div>
      ) : (
        cases && (
          <table className="queue">
            <thead>
              <tr>
                <th>Case</th>
                <th>Applicant</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Reviewer</th>
                <th>Reason for manual review</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr
                  key={c.id}
                  className="row-link"
                  tabIndex={0}
                  onClick={() => navigate(`/cases/${c.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/cases/${c.id}`);
                    }
                  }}
                >
                  <td className="mono">{c.id}</td>
                  <td>
                    <div className="applicant">
                      {c.flagged && (
                        <span className="flag" title="Flagged by automated screening" aria-label="Flagged">
                          ⚑
                        </span>
                      )}
                      <strong>{c.applicantName}</strong>
                    </div>
                    <RiskBadge level={c.riskLevel} />
                  </td>
                  <td>{formatDate(c.submittedAt)}</td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td>{c.assignedReviewer}</td>
                  <td className="reason">{c.reviewReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
      {cases && cases.length > 0 && (
        <p className="muted small">
          {cases.length} case{cases.length === 1 ? '' : 's'}
        </p>
      )}
    </section>
  );
}
