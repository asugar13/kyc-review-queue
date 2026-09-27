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

## Phase 2 — build (`--apply --publish --verify`, after PR #8 merged)

`build-model-app.js --apply --publish --verify --non-interactive` → first run halted at `business-rules`: `CreateProcessWithWfomJson` returned HTTP 400 "An unexpected error occurred" for every rule, including a one-condition / one-action probe, so the environment cannot host business rules from this principal.
Decision: dropped `businessRules[]`; the same logic (reason required on any decision, Approved / Escalated lock the decision fields) moved into `KycCase.onLoad` in `kyc_casecommands.js`, wired as `onload` + `onchange(kyc_status)` form events.
`kyc_action` choice gained `Flagged` (added by PR #8) — spec updated to match.
Second full run → build complete (14 created, 32 reused, 0 failed), publish ok, `verify PASS (61/61 present)`. App `KYC Review (model-driven)` = `79defb02-eb8a-47ae-bdbf-e4a466dc89ff`.
Post-build fixes applied directly via Web API: the reused web resource kept its first-run content (no `onLoad`) → PATCHed `webresourceset` content + PublishXml; the form's `<events>` referenced the library without a `<formLibraries>` entry → PATCHed `systemforms.formxml` to add it + PublishXml(kyc_case).
Read-back: appmodule active, form has 2 handlers + 2 sub-grids (checks, history), Review queue view filters status ∈ {Pending, Info requested}, web resource content contains `onLoad`.
