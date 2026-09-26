export const CASE_STATUSES = ['pending', 'info_requested', 'approved', 'escalated'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const FINAL_STATUSES: readonly CaseStatus[] = ['approved', 'escalated'];

export const DECISION_ACTIONS = ['approve', 'request_info', 'escalate'] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

export const DECISION_RESULT_STATUS: Record<DecisionAction, CaseStatus> = {
  approve: 'approved',
  request_info: 'info_requested',
  escalate: 'escalated',
};

export const REVIEWERS = ['Priya Natarajan', 'Tom Okafor', 'Lena Fischer', 'Marcus Reid'] as const;

export const MIN_REASON_LENGTH = 10;
export const MAX_REASON_LENGTH = 2000;

export type CheckResult = 'pass' | 'warn' | 'fail';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface QueueCase {
  id: string;
  applicantName: string;
  submittedAt: string;
  status: CaseStatus;
  assignedReviewer: string;
  reviewReason: string;
  riskLevel: RiskLevel;
  flagged: boolean;
}

export interface VerificationCheck {
  name: string;
  result: CheckResult;
  detail: string;
}

export interface ActivityEntry {
  id: number;
  action: string;
  reason: string;
  reviewer: string;
  createdAt: string;
}

export interface CaseDetail extends QueueCase {
  applicant: {
    email: string;
    dateOfBirth: string;
    nationality: string;
    countryOfResidence: string;
    address: string;
    documentType: string;
    documentNumber: string;
    product: string;
    declaredOccupation: string;
    expectedMonthlyVolume: string;
  };
  decidedAt: string | null;
  checks: VerificationCheck[];
  history: ActivityEntry[];
}

export interface DecisionInput {
  action: DecisionAction;
  reason: string;
  reviewer: string;
}
