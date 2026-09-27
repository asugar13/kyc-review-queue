// Dataverse schema for the Power Apps version of the KYC review queue.
// Mirrors server/src/db.ts (cases / verification_checks / activity) so both
// versions of the prototype hold the same data model.

export const PUBLISHER = {
  uniqueName: 'kycprototype',
  friendlyName: 'KYC Prototype',
  prefix: 'kyc',
  optionValuePrefix: 10000,
} as const;

export const SOLUTION = {
  uniqueName: 'KYCReviewQueue',
  friendlyName: 'KYC Review Queue',
  version: '1.0.0.0',
} as const;

export const CASE_STATUS_OPTIONS = {
  pending: { value: 100000000, label: 'Pending' },
  info_requested: { value: 100000001, label: 'Info requested' },
  approved: { value: 100000002, label: 'Approved' },
  escalated: { value: 100000003, label: 'Escalated' },
} as const;

export const RISK_LEVEL_OPTIONS = {
  low: { value: 100000000, label: 'Low' },
  medium: { value: 100000001, label: 'Medium' },
  high: { value: 100000002, label: 'High' },
} as const;

export const CHECK_RESULT_OPTIONS = {
  pass: { value: 100000000, label: 'Pass' },
  warn: { value: 100000001, label: 'Review' },
  fail: { value: 100000002, label: 'Fail' },
} as const;

export const ACTIVITY_ACTION_OPTIONS = {
  submitted: { value: 100000000, label: 'Submitted' },
  assigned: { value: 100000001, label: 'Assigned' },
  request_info: { value: 100000002, label: 'Info requested' },
  info_received: { value: 100000003, label: 'Info received' },
  approve: { value: 100000004, label: 'Approved' },
  escalate: { value: 100000005, label: 'Escalated' },
  note: { value: 100000006, label: 'Note' },
  flagged: { value: 100000007, label: 'Flagged' },
} as const;

export type OptionMap = Record<string, { value: number; label: string }>;

export interface ColumnDef {
  schemaName: string;
  displayName: string;
  description?: string;
  type: 'string' | 'memo' | 'dateonly' | 'datetime' | 'picklist' | 'boolean' | 'integer';
  maxLength?: number;
  format?: 'Text' | 'Email';
  options?: OptionMap;
  required?: boolean;
}

export interface TableDef {
  schemaName: string;
  displayName: string;
  pluralName: string;
  description: string;
  primaryName: { schemaName: string; displayName: string; maxLength: number };
  columns: ColumnDef[];
}

export const CASE_TABLE: TableDef = {
  schemaName: 'kyc_case',
  displayName: 'KYC Case',
  pluralName: 'KYC Cases',
  description: 'An applicant onboarding case routed for manual KYC review. Synthetic data only.',
  primaryName: { schemaName: 'kyc_name', displayName: 'Case reference', maxLength: 20 },
  columns: [
    { schemaName: 'kyc_applicantname', displayName: 'Applicant name', type: 'string', maxLength: 200, required: true },
    { schemaName: 'kyc_email', displayName: 'Email', type: 'string', maxLength: 200, format: 'Email' },
    { schemaName: 'kyc_dateofbirth', displayName: 'Date of birth', type: 'dateonly' },
    { schemaName: 'kyc_nationality', displayName: 'Nationality', type: 'string', maxLength: 2 },
    { schemaName: 'kyc_countryofresidence', displayName: 'Country of residence', type: 'string', maxLength: 2 },
    { schemaName: 'kyc_address', displayName: 'Address', type: 'memo', maxLength: 1000 },
    { schemaName: 'kyc_documenttype', displayName: 'Document type', type: 'string', maxLength: 100 },
    { schemaName: 'kyc_documentnumber', displayName: 'Document number', type: 'string', maxLength: 100 },
    { schemaName: 'kyc_product', displayName: 'Product', type: 'string', maxLength: 100 },
    { schemaName: 'kyc_declaredoccupation', displayName: 'Declared occupation', type: 'string', maxLength: 200 },
    { schemaName: 'kyc_expectedmonthlyvolume', displayName: 'Expected monthly volume', type: 'string', maxLength: 100 },
    { schemaName: 'kyc_submittedat', displayName: 'Submitted at', type: 'datetime', required: true },
    { schemaName: 'kyc_status', displayName: 'Case status', type: 'picklist', options: CASE_STATUS_OPTIONS, required: true },
    { schemaName: 'kyc_assignedreviewer', displayName: 'Assigned reviewer', type: 'string', maxLength: 100 },
    { schemaName: 'kyc_reviewreason', displayName: 'Review reason', type: 'memo', maxLength: 2000, description: 'Why the case was routed for manual review.' },
    { schemaName: 'kyc_risklevel', displayName: 'Risk level', type: 'picklist', options: RISK_LEVEL_OPTIONS },
    { schemaName: 'kyc_flagged', displayName: 'Flagged', type: 'boolean' },
    { schemaName: 'kyc_decidedat', displayName: 'Decided at', type: 'datetime', description: 'Set when the case reaches a final state (approved / escalated).' },
  ],
};

export const CHECK_TABLE: TableDef = {
  schemaName: 'kyc_verificationcheck',
  displayName: 'Verification Check',
  pluralName: 'Verification Checks',
  description: 'Simulated automated screening result attached to a KYC case.',
  primaryName: { schemaName: 'kyc_name', displayName: 'Check', maxLength: 100 },
  columns: [
    { schemaName: 'kyc_result', displayName: 'Result', type: 'picklist', options: CHECK_RESULT_OPTIONS, required: true },
    { schemaName: 'kyc_detail', displayName: 'Detail', type: 'memo', maxLength: 2000 },
    { schemaName: 'kyc_order', displayName: 'Order', type: 'integer' },
  ],
};

export const ACTIVITY_TABLE: TableDef = {
  schemaName: 'kyc_caseactivity',
  displayName: 'KYC Case Activity',
  pluralName: 'KYC Case Activities',
  description: 'Append-only audit history entry for a KYC case (decisions, assignments, notes).',
  primaryName: { schemaName: 'kyc_name', displayName: 'Summary', maxLength: 200 },
  columns: [
    { schemaName: 'kyc_action', displayName: 'Action', type: 'picklist', options: ACTIVITY_ACTION_OPTIONS, required: true },
    { schemaName: 'kyc_reason', displayName: 'Reason', type: 'memo', maxLength: 2000, required: true },
    { schemaName: 'kyc_reviewer', displayName: 'Reviewer', type: 'string', maxLength: 100, required: true },
    { schemaName: 'kyc_occurredat', displayName: 'Occurred at', type: 'datetime', required: true },
  ],
};

/** Lookup from the child table back to KYC Case (display name "Case"). */
export const CASE_LOOKUP = { schemaName: 'kyc_Case', displayName: 'Case' } as const;

export const RELATIONSHIPS = [
  { schemaName: 'kyc_case_verificationcheck', referencing: CHECK_TABLE },
  { schemaName: 'kyc_case_caseactivity', referencing: ACTIVITY_TABLE },
] as const;

export const TABLES = [CASE_TABLE, CHECK_TABLE, ACTIVITY_TABLE] as const;
