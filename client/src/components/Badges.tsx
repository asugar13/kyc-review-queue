import { STATUS_LABELS, type CaseStatus, type CheckResult, type RiskLevel } from '../types';

export function StatusBadge({ status }: { status: CaseStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className={`badge risk-${level}`}>{level} risk</span>;
}

export function CheckBadge({ result }: { result: CheckResult }) {
  const label = result === 'pass' ? 'Pass' : result === 'warn' ? 'Review' : 'Fail';
  return <span className={`badge check-${result}`}>{label}</span>;
}
