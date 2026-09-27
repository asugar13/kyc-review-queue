# KYC Review (model-driven) — design

Model-driven version of the KYC review queue: work pending cases, review applicant details and verification checks, record Approve / Request information / Escalate decisions with a written reason, and read the case history.

Generated from `app-spec.json` by `scripts/write-app-spec-doc.js`. **Regenerate rather than
hand-edit** — `app-spec.json` is the source of truth, so a manual edit here is lost on the next
run and silently disagrees with what actually builds.

## Environment

| Setting | Value |
|---|---|
| Solution | KYCReviewModelDriven |
| Publisher prefix | kyc |

## Jobs to be done

> ⚠ No `personas[]` were captured, so this app has no recorded jobs-to-be-done and no security
> roles — it will open only for system administrators. Capture who uses the app and what each
> of them needs to get done, then regenerate this document.

## Data model

### KYC Case `kyc_case` _(existing table — reused, not created)_

One applicant onboarding case moving through the KYC review workflow.

| Column | Type | Notes |
|---|---|---|
| Case reference | Text | primary name |
| Applicant name | Text | — |
| Email | Text | — |
| Date of birth | DateTime | — |
| Nationality | Text | — |
| Country of residence | Text | — |
| Address | Memo | — |
| Document type | Text | — |
| Document number | Text | — |
| Declared occupation | Text | — |
| Product | Text | — |
| Expected monthly volume | Text | — |
| Status | Choice | choices: Pending, Info requested, Approved, Escalated |
| Risk level | Choice | choices: Low, Medium, High |
| Flagged | Boolean | — |
| Assigned reviewer | Text | — |
| Submitted at | DateTime | — |
| Decided at | DateTime | — |
| Review reason | Memo | — |

### KYC Case Activity `kyc_caseactivity` _(existing table — reused, not created)_

Chronological history entry for a case (submission, assignment, decisions, notes).

| Column | Type | Notes |
|---|---|---|
| Summary | Text | primary name |
| Action | Choice | choices: Submitted, Assigned, Info requested, Info received, Approved, Escalated, Note, Flagged |
| Reviewer | Text | — |
| Occurred at | DateTime | — |
| Reason | Memo | — |

### Verification Check `kyc_verificationcheck` _(existing table — reused, not created)_

Result of one synthetic identity/AML check performed on a case.

| Column | Type | Notes |
|---|---|---|
| Check | Text | primary name |
| Result | Choice | choices: Pass, Review, Fail |
| Detail | Memo | — |
| Order | Integer | — |

### Relationships

| Kind | From | To | Lookup |
|---|---|---|---|
| 1:N | kyc_case | kyc_caseactivity | kyc_Case |
| 1:N | kyc_case | kyc_verificationcheck | kyc_Case |

## Surfaces

### Generative pages

> ⚠ No generative pages. Per the genpage-first policy, any non-record surface — an overview or
> landing page, a dashboard, an analytics view, a guided/wizard flow — should be a generative
> page rather than a classic dashboard. If this app genuinely has only record CRUD, that's
> fine; otherwise a surface is missing.

### Forms

| Form | Table | Type | Layout | Sub-grids |
|---|---|---|---|---|
| KYC Case review | kyc_case | Main | explicit (1 tab) | kyc_verificationcheck, kyc_caseactivity |
| KYC Case Activity | kyc_caseactivity | Main | auto | — |
| Verification Check | kyc_verificationcheck | Main | auto | — |

Form scripts:

- **KYC Case review** — `onload` → `KycCase.onLoad` (`kyc_casecommands.js`)
- **KYC Case review** — `onchange` on `kyc_status` → `KycCase.onLoad` (`kyc_casecommands.js`)

### Views

| View | Table | Columns | Filters | Sort |
|---|---|---|---|---|
| Review queue | kyc_case | kyc_name, kyc_applicantname, kyc_status, kyc_risklevel, kyc_flagged, kyc_assignedreviewer, kyc_submittedat | kyc_status in Pending/Info requested | kyc_submittedat asc |
| Flagged cases | kyc_case | kyc_name, kyc_applicantname, kyc_status, kyc_risklevel, kyc_assignedreviewer, kyc_submittedat | kyc_flagged eq 1 | kyc_submittedat asc |
| All cases | kyc_case | kyc_name, kyc_applicantname, kyc_status, kyc_risklevel, kyc_flagged, kyc_assignedreviewer, kyc_submittedat, kyc_decidedat | — | kyc_submittedat desc |
| Case history | kyc_caseactivity | kyc_occurredat, kyc_action, kyc_name, kyc_reviewer, kyc_reason | — | kyc_occurredat asc |
| Checks | kyc_verificationcheck | kyc_order, kyc_name, kyc_result, kyc_detail | — | kyc_order asc |

### Command-bar buttons

| Button | Table | Kind | Runs |
|---|---|---|---|
| Approve | kyc_case | Button | `KycCase.approve` (`kyc_casecommands.js`) |
| Request information | kyc_case | Button | `KycCase.requestInfo` (`kyc_casecommands.js`) |
| Escalate | kyc_case | Button | `KycCase.escalate` (`kyc_casecommands.js`) |

## Navigation

- **KYC Review**
  - Review
    - Cases → table `kyc_case` — icon: the table's own
    - Verification checks → table `kyc_verificationcheck` — icon: the table's own
    - History → table `kyc_caseactivity` — icon: the table's own
