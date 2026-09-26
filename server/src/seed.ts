import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase } from './db.ts';
import { DB_PATH } from './config.ts';
import type { CaseStatus, CheckResult, RiskLevel } from './types.ts';

interface SeedCase {
  id: string;
  applicantName: string;
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
  submittedAt: string;
  status: CaseStatus;
  assignedReviewer: string;
  reviewReason: string;
  riskLevel: RiskLevel;
  flagged: boolean;
  checks: { name: string; result: CheckResult; detail: string }[];
  history: { action: string; reason: string; reviewer: string; at: string }[];
}

// All names, documents and addresses below are invented. None refer to real people.
export const SEED_CASES: SeedCase[] = [
  {
    id: 'KYC-1041',
    applicantName: 'Amelia Hartley',
    email: 'amelia.hartley@example.test',
    dateOfBirth: '1991-04-12',
    nationality: 'GB',
    countryOfResidence: 'GB',
    address: '14 Willow Crescent, Leeds, LS6 2AB',
    documentType: 'Passport',
    documentNumber: '•••• •••• 4471',
    product: 'Personal current account',
    declaredOccupation: 'Secondary school teacher',
    expectedMonthlyVolume: '£1,000 – £2,500',
    submittedAt: '2026-09-22T09:14:00.000Z',
    status: 'pending',
    assignedReviewer: 'Priya Natarajan',
    reviewReason: 'Random sample for manual quality assurance',
    riskLevel: 'low',
    flagged: false,
    checks: [
      { name: 'Document authenticity', result: 'pass', detail: 'MRZ checksum valid; security features detected.' },
      { name: 'Liveness / selfie match', result: 'pass', detail: 'Face match score 0.97 (threshold 0.85).' },
      { name: 'Address verification', result: 'pass', detail: 'Matches electoral roll and credit bureau record.' },
      { name: 'Sanctions & PEP screening', result: 'pass', detail: 'No matches across 14 lists.' },
      { name: 'Adverse media', result: 'pass', detail: 'No relevant articles found.' },
    ],
    history: [
      { action: 'submitted', reason: 'Application received via mobile onboarding', reviewer: 'system', at: '2026-09-22T09:14:00.000Z' },
      { action: 'assigned', reason: 'Selected for random QA sample; assigned to Priya Natarajan', reviewer: 'system', at: '2026-09-22T09:15:02.000Z' },
    ],
  },
  {
    id: 'KYC-1042',
    applicantName: 'Viktor Sokolov',
    email: 'v.sokolov@example.test',
    dateOfBirth: '1978-11-03',
    nationality: 'CY',
    countryOfResidence: 'GB',
    address: 'Flat 9, 22 Harbour Point, London, E14 9GE',
    documentType: 'National ID card',
    documentNumber: '•••• •••• 8830',
    product: 'Business account (sole trader)',
    declaredOccupation: 'Import/export consultant',
    expectedMonthlyVolume: '£50,000+',
    submittedAt: '2026-09-22T11:47:00.000Z',
    status: 'pending',
    assignedReviewer: 'Tom Okafor',
    reviewReason: 'Possible sanctions-list name match; address does not match document',
    riskLevel: 'high',
    flagged: true,
    checks: [
      { name: 'Document authenticity', result: 'pass', detail: 'Document template recognised; no tampering detected.' },
      { name: 'Liveness / selfie match', result: 'warn', detail: 'Face match score 0.86 (threshold 0.85). Low lighting.' },
      { name: 'Address verification', result: 'fail', detail: 'Declared address not found in any reference source.' },
      { name: 'Sanctions & PEP screening', result: 'warn', detail: 'Fuzzy name match (87%) against EU consolidated list entry. DOB differs by 2 years.' },
      { name: 'Adverse media', result: 'warn', detail: '2 articles mentioning a similarly named individual in a 2019 customs case.' },
    ],
    history: [
      { action: 'submitted', reason: 'Application received via web onboarding', reviewer: 'system', at: '2026-09-22T11:47:00.000Z' },
      { action: 'flagged', reason: 'Automated screening raised sanctions and address alerts', reviewer: 'system', at: '2026-09-22T11:47:41.000Z' },
      { action: 'assigned', reason: 'Routed to enhanced due diligence queue; assigned to Tom Okafor', reviewer: 'system', at: '2026-09-22T11:48:10.000Z' },
    ],
  },
  {
    id: 'KYC-1043',
    applicantName: 'Chidera Nwosu',
    email: 'chidera.n@example.test',
    dateOfBirth: '1999-07-29',
    nationality: 'NG',
    countryOfResidence: 'GB',
    address: '3 Mill Lane, Manchester, M4 5JW',
    documentType: 'Biometric residence permit',
    documentNumber: '•••• •••• 2205',
    product: 'Personal current account',
    declaredOccupation: 'Postgraduate student',
    expectedMonthlyVolume: '£500 – £1,000',
    submittedAt: '2026-09-23T08:02:00.000Z',
    status: 'info_requested',
    assignedReviewer: 'Priya Natarajan',
    reviewReason: 'Identity document expires within 30 days',
    riskLevel: 'medium',
    flagged: false,
    checks: [
      { name: 'Document authenticity', result: 'pass', detail: 'Valid BRP; chip data read successfully.' },
      { name: 'Document validity period', result: 'warn', detail: 'Expires 2026-10-15 (22 days).' },
      { name: 'Liveness / selfie match', result: 'pass', detail: 'Face match score 0.94.' },
      { name: 'Address verification', result: 'pass', detail: 'Matches university accommodation records.' },
      { name: 'Sanctions & PEP screening', result: 'pass', detail: 'No matches.' },
    ],
    history: [
      { action: 'submitted', reason: 'Application received via mobile onboarding', reviewer: 'system', at: '2026-09-23T08:02:00.000Z' },
      { action: 'assigned', reason: 'Document expiry rule triggered; assigned to Priya Natarajan', reviewer: 'system', at: '2026-09-23T08:02:30.000Z' },
      { action: 'request_info', reason: 'BRP expires in 22 days. Requested proof of visa extension application or a renewed document.', reviewer: 'Priya Natarajan', at: '2026-09-23T10:20:15.000Z' },
    ],
  },
  {
    id: 'KYC-1044',
    applicantName: 'Marta Kowalczyk',
    email: 'marta.kowalczyk@example.test',
    dateOfBirth: '1985-02-17',
    nationality: 'PL',
    countryOfResidence: 'GB',
    address: '81 Station Road, Reading, RG1 1LG',
    documentType: 'Passport',
    documentNumber: '•••• •••• 1198',
    product: 'Joint current account',
    declaredOccupation: 'Pharmacist',
    expectedMonthlyVolume: '£2,500 – £5,000',
    submittedAt: '2026-09-23T14:31:00.000Z',
    status: 'approved',
    assignedReviewer: 'Lena Fischer',
    reviewReason: 'Selfie match below auto-approve threshold',
    riskLevel: 'low',
    flagged: false,
    checks: [
      { name: 'Document authenticity', result: 'pass', detail: 'MRZ checksum valid.' },
      { name: 'Liveness / selfie match', result: 'warn', detail: 'Face match score 0.83 (threshold 0.85). Glasses detected.' },
      { name: 'Address verification', result: 'pass', detail: 'Matches credit bureau record.' },
      { name: 'Sanctions & PEP screening', result: 'pass', detail: 'No matches.' },
    ],
    history: [
      { action: 'submitted', reason: 'Application received via web onboarding', reviewer: 'system', at: '2026-09-23T14:31:00.000Z' },
      { action: 'assigned', reason: 'Selfie score below threshold; assigned to Lena Fischer', reviewer: 'system', at: '2026-09-23T14:31:20.000Z' },
      { action: 'approve', reason: 'Manual comparison of selfie and passport photo is a clear match; low score explained by glasses.', reviewer: 'Lena Fischer', at: '2026-09-24T09:05:44.000Z' },
    ],
  },
  {
    id: 'KYC-1045',
    applicantName: 'Daniel Okonkwo-Reyes',
    email: 'd.okonkwo.reyes@example.test',
    dateOfBirth: '1969-09-30',
    nationality: 'ES',
    countryOfResidence: 'ES',
    address: 'Calle de Alcalá 210, 28028 Madrid',
    documentType: 'Passport',
    documentNumber: '•••• •••• 6612',
    product: 'Business account (limited company)',
    declaredOccupation: 'Company director',
    expectedMonthlyVolume: '£25,000 – £50,000',
    submittedAt: '2026-09-24T07:55:00.000Z',
    status: 'escalated',
    assignedReviewer: 'Tom Okafor',
    reviewReason: 'Applicant declared as politically exposed person',
    riskLevel: 'high',
    flagged: true,
    checks: [
      { name: 'Document authenticity', result: 'pass', detail: 'MRZ checksum valid.' },
      { name: 'Liveness / selfie match', result: 'pass', detail: 'Face match score 0.95.' },
      { name: 'Address verification', result: 'pass', detail: 'Matches utility bill upload.' },
      { name: 'Sanctions & PEP screening', result: 'fail', detail: 'Confirmed PEP: regional government advisory board member (2021–present).' },
      { name: 'Adverse media', result: 'pass', detail: 'No relevant articles found.' },
    ],
    history: [
      { action: 'submitted', reason: 'Application received via web onboarding', reviewer: 'system', at: '2026-09-24T07:55:00.000Z' },
      { action: 'flagged', reason: 'PEP declaration confirmed by screening provider', reviewer: 'system', at: '2026-09-24T07:55:33.000Z' },
      { action: 'assigned', reason: 'Routed to enhanced due diligence queue; assigned to Tom Okafor', reviewer: 'system', at: '2026-09-24T07:56:00.000Z' },
      { action: 'escalate', reason: 'Confirmed PEP with high expected volumes. Requires MLRO sign-off and source-of-wealth review.', reviewer: 'Tom Okafor', at: '2026-09-24T13:12:09.000Z' },
    ],
  },
  {
    id: 'KYC-1046',
    applicantName: 'Sofia Andersson',
    email: 'sofia.andersson@example.test',
    dateOfBirth: '2003-12-05',
    nationality: 'SE',
    countryOfResidence: 'GB',
    address: '27 Queen Street, Edinburgh, EH2 1JX',
    documentType: 'Driving licence',
    documentNumber: '•••• •••• 3350',
    product: 'Personal current account',
    declaredOccupation: 'Barista',
    expectedMonthlyVolume: '£1,000 – £2,500',
    submittedAt: '2026-09-25T10:20:00.000Z',
    status: 'pending',
    assignedReviewer: 'Marcus Reid',
    reviewReason: 'Third onboarding attempt in 30 days',
    riskLevel: 'medium',
    flagged: false,
    checks: [
      { name: 'Document authenticity', result: 'pass', detail: 'Licence hologram and font checks passed.' },
      { name: 'Liveness / selfie match', result: 'pass', detail: 'Face match score 0.91.' },
      { name: 'Address verification', result: 'warn', detail: 'Address matches, but tenancy started 3 weeks ago.' },
      { name: 'Velocity check', result: 'warn', detail: 'Two prior applications abandoned at document step (2026-09-02, 2026-09-14).' },
      { name: 'Sanctions & PEP screening', result: 'pass', detail: 'No matches.' },
    ],
    history: [
      { action: 'submitted', reason: 'Application received via mobile onboarding', reviewer: 'system', at: '2026-09-25T10:20:00.000Z' },
      { action: 'assigned', reason: 'Velocity rule triggered; assigned to Marcus Reid', reviewer: 'system', at: '2026-09-25T10:20:18.000Z' },
    ],
  },
  {
    id: 'KYC-1047',
    applicantName: 'Rahul Mehta',
    email: 'rahul.mehta@example.test',
    dateOfBirth: '1994-06-21',
    nationality: 'IN',
    countryOfResidence: 'GB',
    address: '5 Orchard Way, Bristol, BS8 4PT',
    documentType: 'Passport',
    documentNumber: '•••• •••• 7724',
    product: 'Personal current account',
    declaredOccupation: 'Software engineer',
    expectedMonthlyVolume: '£5,000 – £10,000',
    submittedAt: '2026-09-25T16:05:00.000Z',
    status: 'pending',
    assignedReviewer: 'Lena Fischer',
    reviewReason: 'Declared income inconsistent with stated occupation band',
    riskLevel: 'medium',
    flagged: false,
    checks: [
      { name: 'Document authenticity', result: 'pass', detail: 'MRZ checksum valid.' },
      { name: 'Liveness / selfie match', result: 'pass', detail: 'Face match score 0.96.' },
      { name: 'Address verification', result: 'pass', detail: 'Matches credit bureau record.' },
      { name: 'Income plausibility', result: 'warn', detail: 'Declared monthly volume is above the 95th percentile for the occupation.' },
      { name: 'Sanctions & PEP screening', result: 'pass', detail: 'No matches.' },
    ],
    history: [
      { action: 'submitted', reason: 'Application received via mobile onboarding', reviewer: 'system', at: '2026-09-25T16:05:00.000Z' },
      { action: 'assigned', reason: 'Income plausibility rule triggered; assigned to Lena Fischer', reviewer: 'system', at: '2026-09-25T16:05:12.000Z' },
    ],
  },
  {
    id: 'KYC-1048',
    applicantName: 'Grace O\'Sullivan',
    email: 'grace.osullivan@example.test',
    dateOfBirth: '1958-01-08',
    nationality: 'IE',
    countryOfResidence: 'GB',
    address: '12 Chapel Street, Liverpool, L3 9AG',
    documentType: 'Passport',
    documentNumber: '•••• •••• 0917',
    product: 'Savings account',
    declaredOccupation: 'Retired',
    expectedMonthlyVolume: '£10,000 – £25,000',
    submittedAt: '2026-09-26T08:40:00.000Z',
    status: 'pending',
    assignedReviewer: 'Marcus Reid',
    reviewReason: 'Large initial deposit declared; source of funds required',
    riskLevel: 'medium',
    flagged: false,
    checks: [
      { name: 'Document authenticity', result: 'pass', detail: 'MRZ checksum valid.' },
      { name: 'Liveness / selfie match', result: 'pass', detail: 'Face match score 0.93.' },
      { name: 'Address verification', result: 'pass', detail: 'Matches electoral roll.' },
      { name: 'Source of funds', result: 'warn', detail: 'Declared £180,000 property sale proceeds; no supporting document uploaded yet.' },
      { name: 'Sanctions & PEP screening', result: 'pass', detail: 'No matches.' },
    ],
    history: [
      { action: 'submitted', reason: 'Application received via branch-assisted onboarding', reviewer: 'system', at: '2026-09-26T08:40:00.000Z' },
      { action: 'assigned', reason: 'Large deposit rule triggered; assigned to Marcus Reid', reviewer: 'system', at: '2026-09-26T08:40:25.000Z' },
    ],
  },
];

export function seedDatabase(db: DatabaseSync, options: { reset?: boolean } = {}): number {
  const insertCase = db.prepare(`
    INSERT INTO cases (
      id, applicant_name, email, date_of_birth, nationality, country_of_residence, address,
      document_type, document_number, product, declared_occupation, expected_monthly_volume,
      submitted_at, status, assigned_reviewer, review_reason, risk_level, flagged, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertCheck = db.prepare(
    'INSERT INTO verification_checks (case_id, name, result, detail) VALUES (?, ?, ?, ?)',
  );
  const insertActivity = db.prepare(
    'INSERT INTO activity (case_id, action, reason, reviewer, created_at) VALUES (?, ?, ?, ?, ?)',
  );

  db.exec('BEGIN IMMEDIATE');
  try {
    if (options.reset) {
      db.exec('DELETE FROM activity; DELETE FROM verification_checks; DELETE FROM cases;');
    }
    const existing = (db.prepare('SELECT COUNT(*) AS n FROM cases').get() as { n: number }).n;
    if (existing > 0) {
      db.exec('COMMIT');
      return 0;
    }
    for (const c of SEED_CASES) {
      const finalEntry = c.history.find((h) => h.action === 'approve' || h.action === 'escalate');
      insertCase.run(
        c.id, c.applicantName, c.email, c.dateOfBirth, c.nationality, c.countryOfResidence, c.address,
        c.documentType, c.documentNumber, c.product, c.declaredOccupation, c.expectedMonthlyVolume,
        c.submittedAt, c.status, c.assignedReviewer, c.reviewReason, c.riskLevel, c.flagged ? 1 : 0,
        finalEntry ? finalEntry.at : null,
      );
      for (const check of c.checks) insertCheck.run(c.id, check.name, check.result, check.detail);
      for (const h of c.history) insertActivity.run(c.id, h.action, h.reason, h.reviewer, h.at);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return SEED_CASES.length;
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const reset = process.argv.includes('--reset');
  const db = openDatabase(DB_PATH);
  const inserted = seedDatabase(db, { reset });
  db.close();
  console.log(
    inserted > 0
      ? `Seeded ${inserted} cases into ${DB_PATH}`
      : `Database at ${DB_PATH} already has data; nothing seeded (use --reset to reseed)`,
  );
}
