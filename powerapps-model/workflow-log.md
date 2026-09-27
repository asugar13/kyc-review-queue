# Workflow log — KYC Review (model-driven)

## Phase 1 — authoring (unattended prep, no Dataverse writes)

`node --version` → v24.19.0
`pac --version` → Microsoft PowerPlatform CLI 2.12 (>= 2.7.0)
`node scripts/check-auth.js --env https://org64ad231d.crm11.dynamics.com` → ok (service principal, WhoAmI ok)
Existing tables detected via Web API EntityDefinitions: kyc_case, kyc_caseactivity, kyc_verificationcheck → all marked `existing: true`.
Unattended default: personas → none (single admin reviewer demo; app opens for System Administrator).
Unattended default: pages → none (record CRUD only: queue view + case form).
`node scripts/lint-app-spec.js --spec @powerapps-model/app-spec.json --json` → ok, 2 warnings (no personas, no pages).
`node scripts/preview-app.js --spec @powerapps-model/app-spec.json` → rendered; reviewed.
`node scripts/build-model-app.js --env https://org64ad231d.crm11.dynamics.com --spec @powerapps-model/app-spec.json --non-interactive` (dry run) → 30 reuse, 9 create, 8 not probed; no column changes on existing tables.
`node scripts/write-app-spec-doc.js` → model-app-plan.md
Plan presented to user for approval before `--apply`.
