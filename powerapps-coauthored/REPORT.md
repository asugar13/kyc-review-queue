# canvas-authoring MCP vs pac canvas pack

Comparison against the hand-authored `.pa.yaml` + `pac canvas pack` attempt
(PR #4, now closed — Studio could not open the resulting `.msapp`). This app —
**"KYC Review Queue coauthored"** (app id `6344a16e-0ddd-4083-b5eb-518f13f4116d`)
— was authored through Microsoft's blessed path: the
`Microsoft.PowerApps.CanvasAuthoring.McpServer` MCP tools running against a live
Power Apps Studio **coauthoring session** in the VM's browser.

## Result: the blessed path produces a working app

- **Opens in Studio.** The Studio canvas renders both screens with live
  Dataverse data — the failure mode of the hand-packed `.msapp` does not occur.
- **Published and plays in the Power Apps player.** After several retries
  against transient service errors (see below), the app published and plays at
  `https://apps.powerapps.com/play/e/b76846b4-0c24-e4d8-952c-46ffa09ad6a8/a/6344a16e-0ddd-4083-b5eb-518f13f4116d`.
  Verified end-to-end in the player: queue loads, row click navigates to the
  detail screen, verification checks and activity history render, the reason
  field gates the action buttons, **Approve** on KYC-1041 set `kyc_status =
  Approved`, wrote a `KYC Case Activities` row, cleared the reason field, and
  locked all three action buttons.

## What the app contains

- **Screen1 (queue):** search box (applicant name / case ref) + status filter
  dropdown (All / Pending / Info requested / Approved / Escalated) over the
  `KYC Cases` Dataverse table; gallery rows show applicant, ref, submitted
  date, product, risk badge, status badge, and a "Flagged" marker; row button
  sets `varSelectedCase` and navigates to the detail screen.
- **CaseDetail:** back navigation, status/risk badges, applicant field card,
  `Verification Checks` gallery (Pass/Review/Fail), `KYC Case Activities`
  gallery sorted newest-first, required reason input, and
  Approve / Request info / Escalate buttons that Patch the case status,
  `kyc_decidedat`, `kyc_reviewreason`, and append an activity row with
  `User().FullName` as reviewer. Approved/Escalated cases are locked.

## What worked vs didn't

### Worked

- `.NET 10 + dnx` hosts the MCP server fine on a plain Linux VM; `connect`
  (browser auth flow) succeeded against the developer environment.
- `list_data_sources` / `get_data_source_schema` correctly enumerated the four
  `KYC*` Dataverse tables created by the other session's solution import —
  the packed app failing in Studio did **not** corrupt the schema; tables are
  fully usable.
- `compile_canvas` is an effective validator: it caught a bad property
  (`AccessibleLabel` on `Classic/Button`) with a clear message before anything
  reached Studio. Round-trip compile → Studio refresh pushes edits reliably.
- `sync_canvas` pulls the server's normalized `.pa.yaml` back to disk
  (`synced-src/`), giving real commit-able source — unlike `pac canvas pack`,
  the source of truth stays round-trippable.
- All requirements ran correctly in both Studio preview and the published
  player, including the writes (status patch + activity append) and the
  reason-required / final-state lock gating.

### Didn't / friction

- **Transient service instability was the dominant cost.** The environment
  repeatedly returned "The request was not sent or there was no response from
  the server" for Patch writes in preview and, more importantly, for
  **Publish** — three consecutive publish attempts failed identically before
  one went through. Writes that "failed" in preview sometimes landed later.
  Appears to be service-side flakiness, not an app defect, but it made
  verification noisy.
- **Studio UX traps:** Ctrl+S inside preview opens the browser save dialog, not
  Studio save; closing preview triggers a "Saving to Power Apps" state that
  hung until a full reload.
- The MCP workflow's documented agent topology (planner/screen-builder
  subagents) assumes a host with a Task tool; here the `.pa.yaml` had to be
  hand-authored to the same contract — workable because `compile_canvas`
  converges quickly, but it's prompt-engineering overhead the blessed path
  doesn't eliminate.
- Minor schema quirks cost compile cycles: `Classic/Button` lacks
  `AccessibleLabel` (use `Tooltip`), and modern controls need
  `Variant`-correct properties (documented in the canvas-apps plugin refs).

## Verdict vs the packed-.msapp approach (PR #4)

The MCP coauthoring path is strictly better for agentic authoring: the app it
produces **opens, publishes, and plays**. The pack/import path produced an app
that imports cleanly but cannot open in Studio at all. If a local artifact is
required, author via MCP and keep `sync_canvas` output (`synced-src/`) as the
committed source rather than hand-packing an `.msapp`.

## Files

- `app-src/` — hand-authored `.pa.yaml` pushed to the service via
  `compile_canvas`.
- `synced-src/` — server-normalized `.pa.yaml` pulled via `sync_canvas`
  (canonical post-round-trip source).
