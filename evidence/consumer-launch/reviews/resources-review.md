# ResourceService independent review

Verdict: **CHANGES_REQUIRED** for both specification compliance and quality/security. The proposal/owner-decision implementation is substantially sound, but private read authorization and durable execution boundary failures block acceptance. Discovery and replay completeness also need correction.

Reviewed the frozen `service/launch/resources.js`, `test/launch/resources.test.js`, `docs/consumer-launch/tasks/07-resources-report.md`, and `docs/superpowers/specs/2026-10-18-consumer-launch-design.md`; read the existing compiler, identity, HTTP and store contracts only as needed. The implementer's final 20/20 resource suite is reported evidence, not a suite rerun by this reviewer. No implementation, deployment, network activity, or commits were performed.

Independent uncovered probes: `/workspace/consumer-review/resources-probes.mjs`; output: `/workspace/consumer-review/resources-probes.log`. Command `node /workspace/consumer-review/resources-probes.mjs` exited 0. Each expected defect is asserted. The history-boundary probe uses actual transitions and a valid event chain. The pagination probe seeds 200 unrelated job rows directly to isolate the bounded-list contract, after completing one actual compiler execution.

## Findings

### R1 — P1: private reads authorize owner identity without resource scope

Locations: `service/launch/resources.js:58`–64 and `:164` (all private GET resource/manifest/source/continuity/history/replay/child paths inherit the former).

`locate` checks ownership/visibility but calls `requireActor` only for writes. The collection GET directly lists an actor's scope without any read authorization. A live principal carrying only `cgit:read,cgit:write` can therefore enumerate and read its private PURL resource source/state through the shared backend. This is a real cross-product scope boundary: identity uses the same human principal ID across products, and the CGIT launch server still routes ResourceService with its CGIT actor. The HTTP authentication layer validates the credential but does not add `resources:read` checks. Distinct agent IDs mean this finding does **not** assume an agent automatically inherits its human owner's ID.

Probe result: private list status 200; private continuity status 200; private state disclosed with only CGIT scopes. Direct service reads also omit active-expiry validation, although normal HTTP authentication handles expired browser/bearer credentials.

Required correction: enforce an active resource read or write scope before returning private owner content and the authenticated resource collection, while retaining anonymous public reads and non-enumeration for foreign private IDs. Add coverage using a valid same-ID actor from the other product, not just a different owner.

### R2 — P1: accepted jobs cannot finish once history reaches 200

Locations: `service/launch/resources.js:100`, `:221`–226, `:275`.

Enqueue consumes one resource version; completion requires another through `transition`. At version 199, `/run` succeeds with 202 and advances the resource to 200. Every completion then throws `history_limit` before saving the terminal job or artifact. After lease expiry, another worker reexecutes and encounters the identical permanent failure. Other owner mutations can also consume remaining history while a job is queued. A simple enqueue check for version 199 alone would not fix those races.

Probe result: accepted version 200; first and replacement workers both throw `history_limit`; persisted job remains `running`, attempts 2, without a terminal result.

Required correction: make terminal recording possible for every admitted job at quota boundaries, using reserved capacity or a bounded failure path that does not require unavailable history capacity. Account for concurrent owner commands and multiple pending jobs. Recovery must record a clear terminal failure or complete the result instead of endlessly reexecuting.

### R3 — P1: output byte validation differs from storage sizing and permanent commit errors never terminalize

Locations: `service/launch/resources.js:16`, `:263`–275.

Resource output checks use `JSON.stringify` byte length, while the reviewed store intentionally sizes finite exponent numbers in PostgreSQL's expanded decimal representation. A native pure program with source `{language:'purl/1',input:'json',steps:[{op:'constant',args:{value:Array(500).fill(1e-308)}}]}` is admitted, built, and queued. Its source is 3,583 bytes of JSON. The artifact duplicates that numeric array in its output and constant-operator trace, so its storage representation exceeds the 256-KiB row bound even though all ResourceService output/artifact checks pass.

The permanent `row_limit` comes from the result transaction, outside the execution validation catch. The job stays `running` and every replacement worker repeats the computation and fails again. The same missing permanent-error path applies to completion-time tenant/metadata quota rejection. This is an integration error in ResourceService, not a defect in the store's stricter JSONB accounting.

Probe result: create/build succeeded; run returned 202; both workers threw `row_limit`; persisted job remained `running`, attempts 2.

Required correction: validate the exact final persisted shapes using storage-compatible sizing, and handle permanent storage refusal with a bounded terminal record that can itself be persisted. Keep artifact/result transactions atomic. Add this finite-small-exponent case, since unsafe huge integers are rejected by the existing compiler and do not exercise the defect.

### R4 — P2: owner-wide first-page filtering silently loses children and skips replay verification

Locations: `service/launch/resources.js:186` and `:288`.

Child list and replay queries ask the store for an owner-wide `resource-job/` (or artifact/build/release) prefix. The store returns at most 200 rows; ResourceService filters by resource ID only afterward. An owner can have more than 200 children across multiple resources well within the 4096-record/10-MiB bounds. Children sorting after that first page become invisible in their own resource's list. Replay silently skips them and can claim `valid:true` without verifying any of that resource's completed executions.

Probe result: direct execution lookup returned `succeeded`, but its execution list was empty and replay returned `executions:[]`, `valid:true` after 200 unrelated owner jobs sorted ahead of it.

Required correction: query/index children by resource before applying the limit, or implement bounded pagination with explicit completeness. Replay must never silently treat an incomplete execution selection as a complete check. Preserve access to existing persisted child addresses if changing key layout.

### R5 — P2: discovery does not describe the required checkpoint input

Locations: `service/launch/resources.js:70`–80 versus `:234`–237.

The checkpoint manifest declares only `expected_version` and makes that the only required field. The endpoint requires a nonempty `summary` and accepts `next` and `evidence`, none of which are disclosed in the schema. A fresh consumer following the advertised contract submits a schema-valid request and gets `summary_required`. `publish.visibility` and `fork.title/visibility` are also absent from their operation schemas. Proposal/commit schemas were added correctly, but the report's discovery improvements do not complete the broader self-describing continuation contract.

Probe result: checkpoint schema properties contain only `expected_version`; submitting that declared required input returns `summary_required`.

Required correction: describe actual required and optional fields, limits, defaults, and accepted types for all advertised operations. Add a discovery-driven checkpoint case. Anonymous authority rights also currently include `fork` while its operation is unavailable; clarify the distinction between currently granted rights and potentially available operations.

## Positive findings and scope limits

- Proposal reads enforce live read/write scope and owner-or-proposer visibility. Proposal namespace/IDs are server-derived; foreign proposals and owner commits do not gain authority from public resource visibility. Owner authorization precedes decision receipt replay.
- Proposal/meta/receipt and owner decision/resource/version/event/receipt are atomically CAS-committed. Base-version checks prevent stale acceptance. Compact immutable decision receipts avoid the previously observed oversized full-response duplication.
- Source changes invalidate active builds. Execution uses the existing closed compiler/interpreter, rejects effects, and exposes no arbitrary authored-code execution. Finite plain JSON, dangerous keys, source/state/input sizes, and proposal counts have explicit bounds.
- Worker authority is revalidated at claim and publication; lease token plus row CAS prevents a replaced worker publishing duplicate artifacts. The frozen tests cover interrupted result transactions, expired-lease replacement, live revocation, and concurrent duplicate proposal/decision commands. R2/R3 concern uncovered permanent admission/publication boundaries, not those already-tested happy-path recovery cases.
- Checkpoints correctly label evidence as author assertions; replay hashes are not presented as external authenticity. No actual fresh model-context continuation, provider login, production storage, or deployment validation was performed by this review. The mission seed is about 37 KiB on disk, below the new 64-KiB state bound in this checkout.

The work is reviewable and narrowly scoped. Fix R1–R5, retain focused regressions, and re-review the changed branches before treating ResourceService or the complete URL-only continuation requirement as accepted.
