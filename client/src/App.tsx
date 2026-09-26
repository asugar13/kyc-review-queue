import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api';
import { QueuePage } from './pages/QueuePage';
import { CasePage } from './pages/CasePage';

const REVIEWER_STORAGE_KEY = 'kyc.reviewer';

export function App() {
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [reviewer, setReviewer] = useState<string>(() => localStorage.getItem(REVIEWER_STORAGE_KEY) ?? '');

  useEffect(() => {
    let cancelled = false;
    api
      .meta()
      .then((meta) => {
        if (cancelled) return;
        setReviewers(meta.reviewers);
        setReviewer((current) => (current && meta.reviewers.includes(current) ? current : (meta.reviewers[0] ?? '')));
      })
      .catch(() => {
        // header still renders; pages surface their own load errors
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reviewer) localStorage.setItem(REVIEWER_STORAGE_KEY, reviewer);
  }, [reviewer]);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">K</span>
          <span>
            KYC Review Queue <span className="brand-sub">Compliance Ops · synthetic data</span>
          </span>
        </Link>
        <label className="reviewer-picker">
          Acting as
          <select value={reviewer} onChange={(e) => setReviewer(e.target.value)} aria-label="Acting reviewer">
            {reviewers.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<QueuePage />} />
          <Route path="/cases/:id" element={<CasePage reviewer={reviewer} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
