# Source reconstruction — 2026-10-18

This report reconstructs the four supplied repositories from Git objects and actual code. All original checkouts under `/workspace/repos/` remain clean and unchanged. Tests ran from exported copies under `/workspace/recon-evidence/`; Git-dependent circle tests additionally used a copied `.git` directory. No capability was requested and no external POST or database write was made. Runtime: Node v24.19.0, npm 11.9.0, Python 3.12.14.

## Branch and compatibility matrix

| Repository / branch | Exact commit | Implemented surface | Compatibility consequence |
|---|---|---|---|
| purl `claude/purl-protocol-research-bxevq5` (original HEAD) | `3df4452a3624b3f5492bf23c2dacc49d8d2b33c7` | PURL/0.1 event-sourced resources, grants, fork/merge, manifests, client replay, binary-sequence research | Stable original reference; no composition or circle modules |
| purl `origin/claude/acsp-purl-composition-adsbn6` | `18c85bf2960685ce8903937598e3ac0506409673` | `src/compute/{algebra,composer,ports,commitments}.js`; six bit-string operators; version/hash-pinned computation DAG; `src/bridge/{acsp,agent}.js` | Additive descendant of original; PURL/0.1 HTTP/Store ports; bridge sends ACSP/0.1 envelopes |
| purl `origin/ccr-d0887a23-30wf63` | `83d6bcaf8b811e9d2744fb15a6d42ae5d899de1c` | `src/circle/`: seven-verb SEURL FSM, HTTP adapters, scroll/build/checkpoint bridge, SDK/conformance/IDE, identity decomposition | Independent descendant of original. Does **not** contain composition `src/compute` or `src/bridge`; choosing newest branch silently drops the other implementation |
| ACSP `claude/agent-continuity-protocol-doi4bn` (original HEAD) | `9fcf2e1da3ce01a4e66eb5be5e2249b1f211878b` | ACSP/0.1, Next route mounting Fetch handler, Postgres/PGlite, capability authority, TOKs/proposals/checkpoints | Original deployment-compatible continuity layer; no `/transitions` or operational extension |
| ACSP `origin/ccr-d0887a23-30wf63` | `e8d989afee2025e2315605b4349ccfa833db13bf` | Original protocol/code plus `scripts/serve-local.ts` and migration/snapshot documentation | Descends from original HEAD; HTTP circle development target. Historical migration prose incorrectly says Program 001 source is unavailable in this supplied clone |
| ACSP `origin/claude/acsp-program-001-k616hw` | `417da6c740de22aaa497e10a09251c4c2af7b948` | ACSP/0.1 + agent identities, embodiments, immutable versioned Scrolls, aliases, calculator/rational substrate, discovery trials, transition-history export | Source really exists; `/r/{id}/transitions` produces the format read by original substrateIO `substrate/acsp.py` |
| ACSP `origin/claude/acsp-purl-composition-adsbn6` | `edd1963750d1fc839cc350797b6a9bc9da8f6a20` | ACSP/0.2 first-class operation records, result/continuation schemas, extension registry | Accepts both ACSP/0.1 and 0.2 envelopes (`SUPPORTED_PROTOCOLS`). Semantic merge with Program 001 is untested |
| seurl `master` (HEAD and only remote branch) | `620ff955b87857c3eb7a7700a81b6a4d0217400a` | 36-line static halt HTML, seven displayed verbs; NAI-CI research text | No JS, parser, protocol handler, execution engine or verified sealing. Actual executable seven-verb FSM is in purl circle |
| substrateIO `claude/research-substrate-bootstrap-bfd02a` (original HEAD) | `7ace119a544fc736f0d4ec1d72cded9dad0a83e3` | Python stdlib typed computational addresses, ECA/graphs/traces/projections, append-only local execution store, ACSP transition-history reader | Program branch `5073595f1c7197392d77b7fb612479084ad5a268` is already included in HEAD; original supports Program 001 export |
| substrateIO `origin/ccr-d0887a23-30wf63` | `165712038643f306f3ec882d9c50da84477de534` | Adds parse-only `/term`, value/address/derivation/environment identities, `/observations`, `/projections`, P-ACSP-EV-1 plain-events projection | Required by purl circle. Original substrateIO lacks these additive endpoints |

ACSP composition and Program 001 share ancestor `14b314712c0819ea7e0cfc1d7675a5f6475c125b`; neither includes the other. All `ccr` branches descend from the corresponding original HEAD. The source SHA/branch inventory is in `evidence/reconstruction/repositories.json`.

## Integration interfaces to preserve

1. **Original PURL:** `src/client/client.js` discovers manifests; `/r/{id}/ops/{name}` requires a bearer principal and `expected_version`. `src/compute/ports.js` on the composition branch talks only through this interface. Computation nodes are `compute-literal` and `compute-application`, state protocol `purl.compute/0.1`, with operands pinned as `{resource,version,state_hash}`. The six operations are `NOT`, `AND`, `OR`, `XOR`, `CONCAT`, `HASH`; values are nonempty binary strings of at most 4096 characters. `HASH` hashes ASCII bits and returns 256 bits, not a hexadecimal string. Preserve the pin/version/hash checks when importing a DAG; its recorded value alone is an unverified claim.
2. **Circle SEURL:** `src/circle/seurl.js` is a pure URL parser/FSM. START binds; SWITCH rebinds; WRITE appends operations; PERTURB appends `flip/{bit}`; COMMIT/BUILD/TALK return prepared actions. GET never executes those actions. TALK has fixed arity two (`acsp`, resource id), so uppercase resource ids are arguments. Current state and `would_reach` must remain separate. `seurl://` browser resolution remains unresolved; normal `/seurl/...` HTTP paths work.
3. **substrateIO registry:** `substrate/purl.py` has 21 contracts over `space,state,map,trace,graph,cycle,projection,damage,spectrum`; type transition and operation-version digests are published at `/operations`. `/term/<address>` parses without evaluation. GET resolution may compute but does not record; POST the same address explicitly appends an execution. Materialization refusal means KNOWN/not_materialized, not nonexistent. `value_id=null` is valid for an unmaterialized map. `numpy.map.spectrum` is optional; it must not be presented as guaranteed available.
4. **ACSP continuity:** `/r/{id}/operations` consumes `{protocol,operation,actor,expected_version?,idempotency_key,payload}`. Read-only `?action=prepare_propose` returns a candidate envelope and validation. POST propose stores a pending proposal; the owner alone resolves it into committed knowledge. Circle carries no ACSP capability and must never report submission as commitment. Program 001 adds immutable Scrolls and transition exports; ACSP/0.2 separately makes mutation requests addressable operation records.
5. **Research provenance:** Original substrate transition-history adapter (`substrate/acsp.py`) and circle plain-events adapter (`substrate/acsp_events.py`) accept different documents. Do not silently interchange them. In P-ACSP-EV-1, operator-declared `origin=harness` maps to SIMULATED and `origin=service` maps to UNRESOLVED; model names remain assertions, not identity or physical observations.

## Migration collisions and deployment hazards

ACSP has two divergent migration files: `0003_program_001.sql` and `0003_operation_records.sql`. Their numeric prefix collides, but `src/db/migrate.ts` tracks the **full filename** and sorts lexically, so neither is automatically skipped. Program 001 adds resource kind, embodiment, scroll and execution tables; composition adds operation records, event/proposal operation links and enabled extensions. Both alter the resource/event semantics and overlapping `engine`, `handlers`, `state`, `records`, `representation`, protocol constants/operations, routing and intents. Applying the SQL files is not proof that the merged code works. Allocate a new migration and test fresh + upgrade databases before a production change; keep the two source histories as lineage.

`vercel.json` on the original ACSP selects Next and region `yul1`; `vercel-build` runs migrations before `next build` with optional missing-DB behavior. Production runtime refuses silent ephemeral storage when `DATABASE_URL`/`POSTGRES_URL` is absent. Supabase is used as Postgres directly, not through browser API keys; migration `0002` enables RLS with no policies and revokes hosted API roles. Both branch-specific `0003` files add RLS/revocation to new tables. Do not expose these tables through a permissive browser client.

PURL defaults to localhost:8080 and in-memory storage unless `PURL_DATA_DIR` is set. Circle launcher also binds localhost and optionally starts local ACSP/substrate processes; it is not an internet deployment configuration. substrateIO binds localhost:8765 and writes only `.purl-store` on explicit POST. seurl can be served statically but no concrete hosted URL is present in its source. No deployment URL was verified for purl, substrateIO or seurl.

## Security findings grounded in source

| Finding | Evidence | Required integration boundary |
|---|---|---|
| Circle participants are asserted, while all scroll writes use one server-held PURL principal | `src/circle/server.js:48` creates common PurlClient; `:81` invokes under it; `:195` only validates a session string; `/scrolls/{id}/build` accepts that string | Keep local or enforce authenticated per-program ownership before shared/public exposure. Session attribution is not authorization |
| Circle buffers complete request bodies and does not enforce body size/content type | circle `server.js:659` HTTP wrapper | Bounded body parser/authenticated gateway before external use |
| substrate HTTP has no authentication or body cap; computational limits are separate | `tools/purl_server.py:96` handler; `substrate/purl.py:LIMITS` | Keep localhost/private; broker explicit bounded operations through an authenticated service |
| Multi-system COMMIT/BUILD/TALK is not atomic | circle `server.js:203` reports `partial`, performed steps and step effects | Persist durable per-step identity/idempotency; never retry the entire workflow blindly |
| Circle scroll program immutability is detected by conformance, not prevented by PURL owner authority | circle `SECURITY-FINDINGS.md` SF-2 and writable PURL update | Product source versions/build artifacts must be immutable or guarded at mutation boundary |
| Anonymous ACSP proposals can exhaust 100 pending slots | original resource limit + circle SF-4 (historically observed locally) | Preserve limits, avoid automatic repeated TALK and do not write live proposals during discovery |
| Unsigned hash chains prove internal consistency only | original PURL `SECURITY.md`, replay implementation | Do not present self-consistent hashes as verified identity or external truth |
| Static seurl says messages are folded/sealed but implements no seal | seurl `index.html:29`, no script | Do not infer security from prose; MUSA public-constant seal issue is historical external evidence, not newly tested here |

## Live deployment check (GET only)

Measured at 2026-10-18 13:41 UTC; JSON response bodies and headers are preserved under `evidence/reconstruction/live/`.

| URL | Result |
|---|---|
| https://acsp-one.vercel.app/ | 200, discovery ACSP/0.1 |
| https://acsp-one.vercel.app/.well-known/acsp | 200, ACSP/0.1 |
| https://acsp-one.vercel.app/protocol | 200, ACSP/0.1 specification |
| https://acsp-one.vercel.app/r/8N2RXG1MW79S?format=json | 500 `internal_error`; current resource version unavailable |
| https://acsp-one.vercel.app/r/8N2RXG1MW79S/events?format=json | 500 `internal_error`; current event list unavailable |
| https://acsp-one.vercel.app/r/8N2RXG1MW79S/transitions?format=json | 404 |

The historical 2026-10-01 snapshot reports v12, seven pending proposals and two checkpoints. Those are historical observations only; the current failed reads do not establish that state. Database readiness and error cause were not inspected. No live mutation was attempted.

## Exact verification results

| Source / command | Result | Evidence |
|---|---|---|
| Original purl 3df4452, `npm test` | 58 tests, 58 pass, 0 fail, 0 skipped; exit 0; 381.893167 ms | `purl-head-test.log` |
| Composition purl 18c85bf, `npm test` | 77 tests, 76 pass, 0 fail, 1 skip (ACSP dependencies absent); exit 0; 912.987702 ms | `purl-composition-test.log` |
| Circle purl 83d6bca, `npm test`, copied Git metadata | 83 tests, 80 pass, 0 fail, 3 skipped individual substrate sibling tests; optional circle/MUSA/Golden suites also skipped; exit 0; 650.461179 ms | `purl-circle-git-test.log` |
| Original substrateIO 7ace119, `python3 -m unittest discover -s tests -t .` | 58 tests, OK; exit 0; 19.366 s | `substrate-head-test.log` |
| Original substrateIO, `python3 -m tools.validate` | 0 violations; exit 0 | `substrate-head-validate.log` |
| Circle substrateIO 1657120, same unittest command | 78 tests, OK; exit 0; 25.861 s | `substrate-circle-test.log` |
| Circle substrateIO, `python3 -m tools.validate` | 0 violations; exit 0 | `substrate-circle-validate.log` |

Both substrate suites emit an existing ResourceWarning for an unclosed local socket. Circle tests initially failed in a Git archive because `dev.test.js` shells out to `git`; copied metadata with the correct branch index resolved that harness issue. These failures are retained in `purl-circle-test.log`; do not misreport them as product bugs. ACSP tests/build/typecheck were not run in this reconstruction: no dependencies were installed, and no remote DB was used. seurl contains no test harness. Evidence directory names `*-head`, `*-composition`, `*-circle` contain source exports used for these runs; the deliverable copies only result logs, statuses, source inventory and registry snapshots.

## Implemented compatibility adapters

`service/adapters.js` provides only pure local compatibility interfaces:

| Export | Behavior |
|---|---|
| `compatibilitySources()` | Pinned source SHA/branch/role inventory |
| `parseSeurl(path)` | Uses byte-preserved actual circle FSM in `service/compat/seurl.js`; returns current state, `would_reach`, prepared mutations and `effects:none` |
| `substrateOperations()` | Copies actual 21-contract snapshot; removes the source machine's `executable_here` observation |
| `mapSubstrateTerm(path)` | Registry-backed type parser matching original Python operation/version derivation IDs; no evaluation, no value-id claim |
| `importComposition(records,rootId,{version})` | Validates ≤512 full exported PURL snapshots (depth ≤64, ≤100,000 JSON nodes, ≤2 MiB), resolves exact version/hash pins, independently evaluates all six bounded bit operators, rejects false claims, and returns compiler source plus explicit provenance |

The mathematical mapping deliberately bounds numeric parameters to JavaScript safe integers; original Python accepts arbitrary nonnegative integers syntactically. Cross-parameter constraints, optional dependency availability and materialization remain actual substrate evaluation concerns. The imported compiler source reproduces the root operation over verified materialized operand values. Snapshot references preserve the original DAG lineage; it does not claim the new compiler derivation is identical. Event-chain verification, identity and authority are explicitly not imported.

The vendored FSM SHA-256 is `e83ed72ee1218124a7cc4e4679843ff59015324fba477b07b3d7f672796f3493`, matching purl circle commit `83d6bca` byte for byte. Independent fixture files contain actual Python `parse(...).doc()` outputs and original composition `evaluate()` outputs. Tests verify these interfaces, illegal transitions, uppercase TALK arguments, encoded credential refusal, pinned-version/hash tampering, false values, width errors, unknown operators and all six algebra operations. No HTTP adapters, mutation routes, server binding or external calls were imported.

Independent review identified full-query credential parsing and complete-snapshot size/depth accounting issues. Regression tests first reproduced them; complete-query parsing and iterative plain-JSON validation now refuse them. Sparse arrays, cycles, hidden properties and accessors are rejected before canonical hashing.

Verification after adding compatibility adapters: original 58 PURL tests plus 8 adapter tests all pass (66 total, zero failures/skips, 386.787647 ms). This includes executing imported sources through the safe compiler and matching all six original composition values. Command and output: `node --test test/adapters.test.js test/architecture.test.js test/authority.test.js test/continuity.test.js test/demo.test.js test/experiment.test.js test/http.test.js test/research.test.js test/structure.test.js`, `evidence/reconstruction/original-plus-adapters-test.log`, exit 0. Full product integration tests are owned by the main implementation; this result covers the unchanged reference behavior and these new adapters only.
