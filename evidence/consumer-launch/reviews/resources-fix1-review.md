# ResourceService fix 1 independent re-review

Verdict: **CHANGES_REQUIRED**, limited to one remaining R3 quota boundary. R1, R2, R4 and R5 are resolved. R3's original numeric artifact case and completion-time quota cases are corrected, but an admitted job still cannot terminalize when its owner fills the tenant before the worker's initial claim.

Scope: reviewed only the prior five findings and their corrections in `service/launch/resources.js`, the six added regressions in `test/launch/resources.test.js`, and the updated `docs/consumer-launch/tasks/07-resources-report.md`. Read retained `evidence/consumer-launch/resources/15-green-all-review-fixes.txt`: 26 passed, zero failed. That covered suite was **not rerun**. No source edits, network calls, deployments or commits.

## Remaining finding

**R3 residual — P1: full tenant before lease claim permanently strands accepted work.**

Location: `service/launch/resources.js:293`–294; related pre-claim cancellation path at `:290`–291.

The worker must grow the queued row with `started_at`, a lease, a claim log and updated attempts before it reaches the new permanent-completion-error handler. If other owner work consumes the remaining tenant bytes after `/run` returns 202 but before this commit, the store returns `tenant_quota`. This catch handles only `version_conflict` and rethrows the quota error. `terminalFailure` is never reached. Every subsequent worker encounters the same queued job, tries the same growth, and throws again. The job has no lease to expire and remains `queued` with attempts 0. A job encountered early in the scan also prevents that invocation from reaching subsequent candidates.

Independent narrow reproduction: `/workspace/consumer-review/resources-fix1-edge-probe.mjs`; output `/workspace/consumer-review/resources-fix1-edge-probe.log`. It creates/builds a real native resource, enqueues with status 202, fills the actual MemoryLaunchStore tenant to exactly 10 MiB through normal store commits, then invokes `workOnce({workerId:'w'})` twice. Both calls throw `tenant_quota`; the stored job is still queued with zero attempts. Probe command exited 0 with assertions confirming this defect. No mocks of quota errors and no rerun of the existing completion-after-claim saturation tests.

Required correction: cover permanent refusal during initial claim and pre-claim cancellation, using a terminal update fenced by the observed row version or capacity reserved at admission. The failure row must fit within the existing **queued** row's allocation, which is smaller than the already-running row used by the current regression. Preserve lease/token fences for jobs that are already claimed, and do not convert transient store outages into permanent failures. Add one focused regression for saturation between admission and first claim.

## Resolved findings and evidence

- **R1 resolved:** private lookup now enforces `requireActor(...,{write:false})` after ownership concealment; authenticated collection GET applies the same check. Valid read/write resource scopes pass, CGIT-only scopes and expired credentials fail; anonymous public reads remain available. The added regression covers all relevant private read routes.
- **R2 resolved:** history-limit refusal at publication reaches the bounded existing-row terminal update without appending an impossible version/event. The update checks the live lease token/expiry and commits with row CAS. Multiple admitted jobs interleaved with owner commands at version 200 are covered. Their existing run events still identify them for child enumeration and replay status counts.
- **R3 partially resolved:** storage byte accounting matches the store's exponent-to-decimal formula, and the final artifact/transition rows are checked before commit. Artifact validation failures clear the candidate artifact. The 500-element `1e-308` case now persists failure, and completion-time history/row/tenant/metadata refusals use the compact terminal record. The retained tests saturate actual 10-MiB and 4096-record bounds after claim with a one-character worker ID. The residual above is specifically before claim.
- **R4 resolved:** resource-specific immutable event references select the existing child addresses before reading jobs/builds/releases; artifacts derive from referenced jobs. The bounded 200-event history fits the existing history contract. Missing/foreign child references or incomplete history produce explicit incompleteness, and replay includes those problems before computing `valid`. Legacy child key layout remains intact. Original pagination omission and missing referenced job are covered by the retained regression.
- **R5 resolved:** checkpoint discovery now declares required summary, its bound, next/evidence arrays and defaults; the endpoint enforces array types. Fork/publish options are disclosed, and anonymous current rights are read-only. A discovered checkpoint payload succeeds in the retained regression.

The report accurately describes the completion-time fallback and physical cross-shard erasure limitation. Its statement that admitted jobs can always record bounded terminal failure needs the pre-claim correction above. Full hosted persistence, HTTP integration and URL-only model-context continuation remain root validation responsibilities, outside this re-review.
