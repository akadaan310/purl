# Independent memory/catalog and CGIT review

Spec: **FAIL**. Quality: **CHANGES_REQUIRED**.

Reviewed task03/task04 briefs and reports, binding consumer-launch design and relevant consumer inputs, the frozen `/workspace/consumer-review/memory-cgit.patch`, and the six production modules plus their tests. All ten files in the frozen patch match the workspace byte for byte. No implementation files were edited, no covered test suites were rerun, no network requests or external mutations were made, and no helpers were used. The findings below were confirmed by targeted in-memory probes against the actual modules and `MemoryLaunchStore`.

## Findings

### P2 — Shared memory pointer namespaces exhaust globally after 4096 shares

Locations: `service/launch/memory.js:4`, `:5`, `:103`–`:104`, `:108`; shared-store limit confirmed in `service/launch/store.js:95`.

Every user's passport pointer is written into the single `memory:capabilities` scope; publications similarly share `memory:publications`. The store permits only 4096 keys per scope, including tombstones. Revocation updates only the owner's aggregate and leaves the pointer forever. Consequently approximately 41 users consuming the documented 100-passport allowance exhaust passport creation for every other tenant. Revoking those passports does not recover capacity. This is a fixed global lifetime limit behind a per-owner product allowance, so ordinary tenants interfere with a fresh tenant's first share. Publication pointers have the same storage defect independently of the separately documented 200-result public listing bound.

Probe: populate the actual store's capability scope with 4096 `{owner}` pointer rows in 32-record batches, then create a fact and its first passport for `new-tenant`. Observed `413 metadata_quota: Tenant exceeds 4096 records including tombstones`. The new tenant's aggregate already contained one passport, while the capability pointer was never published. No quota was consumed in that new tenant before this attempt except its one fact. These fixture pointer records have the same keys/values and quota effect as successfully created passports.

Change the global lookup arrangement so pointers do not accumulate in one tenant-limited scope, and ensure failed pointer publication cannot consume the owner's finite share allowance indefinitely. Add a cross-tenant capacity/revocation regression using the actual store.

### P2 — Working catalog entries reject valid results at ordinary permitted sizes

Locations: `service/launch/catalog.js:7`, `:54`; `service/launch/catalog-operations.js:5`, `:61`.

Output fields reuse the input text schema's 20,000-character maximum even when an operation combines multiple accepted values. Six legal 4,000-character memory facts occupy only about 25 KiB of the allowed 250,000-byte aggregate. Running `POST /api/catalog/never-start-over/run` with its valid empty input nevertheless fails `400 INPUT_TYPE: output.context must be bounded text`; the experience cannot rebuild this small, fully supported owner memory. The same defect affects Canonical JSON Fingerprint: `{value:{one:'a'.repeat(15000),two:'b'.repeat(15000)}}` satisfies its input schema and the 64-KiB request bound but fails `400 INPUT_TYPE: output.canonical must be bounded text`.

These are execution failures after accepted input, unrelated to root HTTP body limits. Give combined outputs appropriate documented bounds or bounded/chunked result contracts, and test their actual permitted sizes. The 40 working entries and differentiated graphs exist, but their sample-only success does not establish correct operation across the declared contracts.

### P2 — Supported TypeScript import-equals dependencies silently disappear

Location: `service/launch/structural-index.js:25`–`:26`.

The import collector handles ES import/export nodes and JavaScript `CallExpression` require/import forms, but not Babel's `TSImportEqualsDeclaration` / `TSExternalModuleReference`. With `src/main.ts` containing `import util = require("./util"); export const value = util.value;` and a present `src/util.ts`, both files are marked `indexed`, yet the dependencies query for `src/main.ts` returns `imports:[]` and `dependencies:[]`. This is a valid, common TypeScript module form with a real local dependency. The result silently presents an incomplete dependency graph without a limitation or truncation marker.

Collect this TypeScript import form and preserve its local alias, or explicitly mark unsupported syntax and incomplete dependency results rather than returning an apparently complete indexed file. Add a dependency query regression for this actual AST shape.

## Areas that passed this review

- Private facts and repository objects are loaded using the authenticated actor ID. Caller-selected memory ownership and dangerous JSON keys are rejected. No cross-tenant read/write bypass was found in the reviewed routes.
- Passports use unpredictable capabilities, select owner facts, re-read live state, reflect edits/deletion, and check revocation/expiry. Public cognition reads only explicit publication pointers, rechecks owner publication state, omits private correction history and limits edges to selected endpoints. There is no default private-memory pool. Passport reads intentionally include correction histories, as their existing test explicitly asserts; this review does not relabel that established behavior as an unproven defect.
- CGIT requires separate product consent plus read/write scopes. Typed conversation commits require explicit consent. Commits/blobs are content-addressed and head updates use an atomic store transaction; release replacement is rejected. Import verifies wrapper/object digests, ownership, references, dates, safe paths and acyclic parents before publication, with stable private staging for interruption recovery. Deletion marks the repo unavailable before cleanup.
- GitHub URLs and refs cannot select arbitrary origins. Fetches use fixed HTTPS hosts, manual redirect denial, pinned returned commit SHAs, streamed size limits, deadlines and rate quotas. Imported code is parsed, never executed. No SSRF or arbitrary-code route was found.
- Actual parsing is JS/JSX/TS/TSX, including the supported `.mjs`, `.cjs`, `.mts`, `.cts` extensions. Other languages are inventory-only. AST traversal, file counts and source bytes are bounded. The import-equals finding above qualifies dependency completeness within TypeScript.
- Catalog has 40 working and 11 limited entries and 40 unique working graph hashes. Working dispatches call actual registered operations/owner-memory workflows; model-dependent entries fail honestly with their dependency limitation. No fabricated inference was found. The closed operator graph format states its execution contract explicitly.
- Installed Babel version is 7.29.9; the lock pins its npm tarball and SHA-512 integrity and records MIT licensing. The index reports that exact parser version and carries upstream attribution/license and content/Git-blob hash distinctions. No copied CGT/GiN implementation was found in these modules.

## Evidence and limits

Targeted commands used `node --input-type=module` to instantiate the real services/store and exercise the three cases above. Exact outputs:

```text
fresh-tenant-passport-failed 413 metadata_quota Tenant exceeds 4096 records including tombstones
owner-share-records-without-published-capability 1
memory-error 400 INPUT_TYPE output.context must be bounded text
json-error 400 INPUT_TYPE output.canonical must be bounded text
ts-import-query {"kind":"dependencies","name":"src/main.ts","matches":[{"path":"src/main.ts","dependencies":[],"imports":[]}],"deterministic":true}
frozen-diff-mismatches []
catalog-counts {"working":40,"limited":11,"uniqueWorkingGraphHashes":40}
babel-installed-version 7.29.9
```

Existing reports record 11 memory/catalog and 21 CGIT/lens tests passing. Their tests and retained evidence were inspected; those covered suites were not rerun. This review found gaps beyond those cases rather than treating the reports as fresh verification.

**Cannot verify from this module patch:** production auth/CSRF/rate enforcement, HTTP integration, deployed persistence/retention, public/native wrappers, browser behavior, live hosted inference, deployment and real-world task-success claims. Root owns these integrations. Root's stated 8-MiB import and 3-MiB commit HTTP limits were accepted as review context; no obsolete 256-KiB root-body-limit finding is raised. The report's one-repository, three-task read-only GitHub result is appropriately narrow and does not establish general compression or semantic capability.
