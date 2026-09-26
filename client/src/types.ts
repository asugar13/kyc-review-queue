export type CaseStatus = 'pending' | 'info_requested' | 'approved' | 'escalated';
export type DecisionAction = 'approve' | 'request_info' | 'escalate';
export type CheckResult = 'pass' | 'warn' | 'fail';
export type RiskLevel = 'low' | 'medium' | 'high';

export const STATUS_LABELS: Record<CaseStatus, string> = {
  pending: 'Pending',
  info_requested: 'Info requested',
  approved: 'Approved',
  escalated: 'Escalated',
};

export const ACTION_LABELS: Record<string, string> = {
  approve: 'Approved',
  request_info: 'Requested more information',
  escalate: 'Escalated',
  submitted: 'Application submitted',
  assigned: 'Assigned for review',
  flagged: 'Flagged by screening',
};

export const FINAL_STATUSES: readonly CaseStatus[] = ['approved', 'escalated'];

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

export interface Meta {
  statuses: CaseStatus[];
  actions: DecisionAction[];
  reviewers: string[];
}
