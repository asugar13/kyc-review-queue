// Loads the same synthetic cases used by the web prototype (server/src/seed.ts) into the
// Dataverse tables created by provision.ts. Cases that already exist (by case reference)
// are left alone unless --reset is passed, in which case they are deleted and recreated
// together with their checks and history.
//
//   PP_ENV_URL=... PP_TENANT_ID=... PP_CLIENT_ID=... PP_CLIENT_SECRET=... npm run seed -w powerapps -- [--reset]

import { SEED_CASES } from '../../server/src/seed.ts';
import { DataverseClient, configFromEnv } from './dataverse.ts';
import {
  ACTIVITY_ACTION_OPTIONS,
  ACTIVITY_TABLE,
  CASE_STATUS_OPTIONS,
  CASE_TABLE,
  CHECK_RESULT_OPTIONS,
  CHECK_TABLE,
  RISK_LEVEL_OPTIONS,
} from './schema.ts';

const dv = new DataverseClient(configFromEnv());
const reset = process.argv.includes('--reset');

const CASES = `${CASE_TABLE.schemaName}s`;
const CHECKS = `${CHECK_TABLE.schemaName}s`;
const ACTIVITIES = `${ACTIVITY_TABLE.schemaName.replace(/y$/, 'ie')}s`;
const CASE_ID = `${CASE_TABLE.schemaName}id`;

function actionOption(action: string): number {
  const option = ACTIVITY_ACTION_OPTIONS[action as keyof typeof ACTIVITY_ACTION_OPTIONS];
  return (option ?? ACTIVITY_ACTION_OPTIONS.note).value;
}

function summary(action: string, reviewer: string): string {
  const option = ACTIVITY_ACTION_OPTIONS[action as keyof typeof ACTIVITY_ACTION_OPTIONS] ?? ACTIVITY_ACTION_OPTIONS.note;
  return reviewer === 'system' ? option.label : `${option.label} by ${reviewer}`;
}

async function main(): Promise<void> {
  let created = 0;
  let skipped = 0;
  for (const c of SEED_CASES) {
    const existing = await dv.getAll<Record<string, string>>(
      `${CASES}?$select=${CASE_ID}&$filter=kyc_name eq '${c.id}'`,
    );
    const existingId = existing[0]?.[CASE_ID];
    if (existingId) {
      if (!reset) {
        skipped += 1;
        continue;
      }
      await dv.delete(`${CASES}(${existingId})`);
    }

    const finalEntry = c.history.find((h) => h.action === 'approve' || h.action === 'escalate');
    const caseId = await dv.create(CASES, {
      kyc_name: c.id,
      kyc_applicantname: c.applicantName,
      kyc_email: c.email,
      kyc_dateofbirth: c.dateOfBirth,
      kyc_nationality: c.nationality,
      kyc_countryofresidence: c.countryOfResidence,
      kyc_address: c.address,
      kyc_documenttype: c.documentType,
      kyc_documentnumber: c.documentNumber,
      kyc_product: c.product,
      kyc_declaredoccupation: c.declaredOccupation,
      kyc_expectedmonthlyvolume: c.expectedMonthlyVolume,
      kyc_submittedat: c.submittedAt,
      kyc_status: CASE_STATUS_OPTIONS[c.status].value,
      kyc_assignedreviewer: c.assignedReviewer,
      kyc_reviewreason: c.reviewReason,
      kyc_risklevel: RISK_LEVEL_OPTIONS[c.riskLevel].value,
      kyc_flagged: c.flagged,
      kyc_decidedat: finalEntry ? finalEntry.at : null,
    });
    const caseRef = `/${CASES}(${caseId})`;

    for (const [index, check] of c.checks.entries()) {
      await dv.create(CHECKS, {
        kyc_name: check.name,
        kyc_result: CHECK_RESULT_OPTIONS[check.result].value,
        kyc_detail: check.detail,
        kyc_order: index + 1,
        'kyc_Case@odata.bind': caseRef,
      });
    }
    for (const h of c.history) {
      await dv.create(ACTIVITIES, {
        kyc_name: summary(h.action, h.reviewer),
        kyc_action: actionOption(h.action),
        kyc_reason: h.reason,
        kyc_reviewer: h.reviewer,
        kyc_occurredat: h.at,
        'kyc_Case@odata.bind': caseRef,
      });
    }
    created += 1;
    console.log(`Seeded ${c.id} (${c.applicantName})${c.flagged ? ' [flagged]' : ''}`);
  }
  console.log(`Done: ${created} created, ${skipped} already present${skipped ? ' (use --reset to recreate)' : ''}.`);
}

await main();
