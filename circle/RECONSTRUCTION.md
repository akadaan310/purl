# Reconstruction of the computational circle (before any implementation)

Session date: 2026-10-01. Reconstructed from repository artifacts, test runs and
the live ACSP deployment. Summaries in prompts were checked against the code;
where they disagree the code wins and the discrepancy is listed in §3.
Machine-readable twin: `reconstruction.json`.

Status vocabulary (from the directive): **EXISTS** (implemented and tested
here), **PARTIAL**, **MISSING**, **CONFLICTING** (two sources disagree),
**UNRESOLVED** (cannot be decided from the evidence available).

## 1. Repositories at reconstruction time

| Repo | HEAD | Language | Tests run here | Result |
|---|---|---|---|---|
| substrateIO | `7ace119` | Python 3.11 stdlib | `unittest` 58, `tools.validate` | 58 OK, 0 violations |
| purl | `3df4452` | Node ≥20, zero deps | `node --test` 58 | 58 pass |
| NetGovComEduGovOrgEduGovComNet (ACSP) | `9fcf2e1` | TS / Next 16 / Postgres or PGlite | `vitest` 24, `tsc` | 24 pass, typecheck clean |
| seurl | `620ff95` | one static HTML page | none exist | — |
| golden-surface | `b113718` | Expo RN app, Python relay (aiohttp), SQLite | store, relay (FakePhone), sync_loud, watchers | store OK, relay **PHASE 2 OK**; sync_loud **FAIL** (needs the convergence watcher process); watchers **FAIL** (relay 500: `playwright` Python module absent) |
| MUSA | `d797135` | Markdown + small Python tools | none exist | — |
| luna-foundry (in scope though not listed by the directive) | `6a260ef` | Node, zero deps | `node --test` 9 | 9 pass |

All branches other than the session branch are at the same commit (no
unmerged work hidden on side branches). The golden-surface repository **was
accessible**; the directive's warning that it might be unavailable did not
apply in this environment.

Live ACSP (`https://acsp-one.vercel.app`), fetched 2026-10-01: resource
`8N2RXG1MW79S` at version 12; 3 TOKs, 7 proposals (P-001…P-007, all
`pending`), 2 checkpoints (0 genesis @v1, 1 @v5). Events v6–v12 are all
`propose` by six declared sessions (muse-a, koda, claude-code, chatgpt).
Raw snapshot: `circle/fixtures/acsp-live-8N2RXG1MW79S-2026-10-01/`.

## 2. Component status

| Component | Status | Evidence |
|---|---|---|
| ACSP continuity (resources, TOKs, events, checkpoints, capabilities, delegation, handoff, proposals) | EXISTS | ACSP `src/continuity/*`, 24 tests, live deployment |
| ACSP invariants as executable checks | EXISTS | `tests/unit.test.ts`, harness `authority` scenario |
| ACSP operation intents (GET prepares, POST mutates) | EXISTS | `src/transport/intents.ts`; PROTOCOL §7 |
| ACSP local runnable server without Next | MISSING | only `createHandler` + harness in-process; no CLI server |
| ACSP `program-001` extension (agent identities, `/r/{id}/transitions`, `acsp-transition-history/1`) | CONFLICTING | substrateIO reads it (`substrate/acsp.py`, fixture `p001-exp-a-kill-recover`) and Q-012 cites it; **absent from ACSP source on every branch and 404 on the live deployment** |
| ACSP commit "417da6c" (blank-prepare-link fix) cited in NEWDIRECTIVE | MISSING | no such object in any of the 7 repos |
| PURL/0.1 resource protocol (event-sourced resources, grants, fork/merge/supersede, manifests, replay) | EXISTS | purl `src/continuity`, `src/transport`, 58 tests |
| Value addresses (derivation paths over substrate objects) | EXISTS | substrateIO `substrate/purl.py`, `tools/purl_server.py`, 14 tests |
| Parse → typed term → evaluate | MISSING (fused) | `purl.resolve` tokenises, selects operations, type-checks params and evaluates in one loop |
| Identity decomposition (address/derivation/value/environment/execution ids) | PARTIAL / DEFECT | only `address` + `value_sha256`; `deterministic_sha256 = H(purl, kind, value)` mixes address with value, so two addresses denoting one value can never share it |
| SEURL vocabulary (START SWITCH WRITE COMMIT BUILD TALK PERTURB) | PARTIAL | named in seurl `index.html`; transition system specified in MUSA `protocols/url-machine.md`; **no implementation anywhere** |
| SEURL ↔ PURL relation | MISSING | seurl README: `seurl://` minted there, `purl://` "belongs to Abed's substrate work"; no code relates them |
| NAI-CI primitives surface/read/legal/trace | PARTIAL | spec in seurl and MUSA; MUSA reports a tested "browser-hand" on :8474 but **its source is not in any repo**; luna-foundry `/lens` implements structure reading (affordances/blocks, natures) and is tested |
| Golden Surface browser (tabs, ownership, read/shot/tap/type, telemetry, sync twin) | EXISTS (needs phone) | relay tests pass against FakePhone; real page loading needs the Android app |
| Golden Surface scheme seam for non-web URLs | EXISTS, deliberately empty | `app/src/routing.ts`, `schemes.ts`: "Nothing is built behind that seam yet" (owner's spec) |
| Golden Surface → computational URL | MISSING | `read` returns `{url,title,text}`, not NAI-CI structures; no scheme handler |
| SubstrateIO projection from ACSP | PARTIAL | reader for `acsp-transition-history/1` only (a format no deployed ACSP serves); no reader for the real `/r/{id}/events` document |
| Constitution as clauses (ids, enforcement, tests) | MISSING | `CONSTITUTIONANDDIRECTIVE.md` is a directive (no clause ids); MUSA `genesis/CONSTITUTION.md` v1 has 8 articles but no enforcement |
| Constitutional conformance artifact | MISSING | — |
| Scroll | CONFLICTING | NEWDIRECTIVE: versioned computational artifact; luna-foundry NOMENCLATURE: "a window onto a long text with a cursor"; MUSA: sealed memory "golden scroll" |
| Aliases from measured recurrence | PARTIAL | substrateIO extensional-equivalence observation (C-040) and Q-013 (ready, not run) |
| Fresh-agent entry URL for the whole circle | MISSING | each system has its own entry (ACSP `/.well-known/acsp`, PURL `/.well-known/purl`, substrate `/`), none spans them |
| IDE/Scroll observability surface | MISSING | — |
| Checkpoint spanning the circle | MISSING | — |
| External tool adapters (LLVM, MLIR, Tree-sitter, Wasmtime) | MISSING, and not yet needed | the `requires` + `unavailable_here` mechanism exists in substrate `purl.py` |

## 3. Discrepancies (recorded before deciding anything)

1. **Two constitutions.** MUSA `genesis/CONSTITUTION.md` v1 art. I: "Nothing …
   waits for approval … to publish within the universe"; art. VII: "Outward
   acts … wait on the operator". The COP directive and this directive require
   explicit authority paths and that GET never mutates. They agree on
   amendment procedure (MUSA art. VIII = COP §5). They are not reconciled
   anywhere. Neither has clause-level enforcement.
2. **GET-mutation conflict.** luna-foundry `/i/{ident}?name=…` changes stored
   ident state on GET ("Moves. Idempotent"). ACSP PROTOCOL §3 and PURL/0.1
   §3.2 forbid it; this directive §26 forbids it.
3. **Authority-sharing conflict.** golden-surface SPEC "Sessions are shared by
   design … His Gmail in the Surface is ours" and AMENDMENTS 1 "fingers are a
   capability, never a gate" versus ACSP "no ambient authority" and directive
   §27 "Do not make a browser automatically acquire authority merely because it
   can see a resource". Golden Surface tokens are per *seat*, not per resource.
4. **Third-party automation.** MUSA commit `c968325` "programmable URL merges
   AI session with live browser session, verified vs google.com" and NAI-CI
   "Google did not block headless Chromium. No special stealth was needed."
   Directive §28 restricts this; the bridge will not automate third-party AI
   providers.
5. **Hash defect.** `deterministic_sha256` mixes address and value (confirmed in
   `substrate/purl.py` `envelope`). Named in NEWDIRECTIVE §5.
6. **Phantom artifacts.** `program-001` source, `417da6c`, MUSA browser-hand
   source: referenced, not present.
7. **Committed build output.** golden-surface tracks ~120 Android Gradle
   intermediates under `app/modules/golden-cookies/android/build/`.
8. **"PURL" names two things.** PURL/0.1 (purl repo) addresses *resources*
   (stateful, authority-bearing); substrate PURL addresses *values* (pure,
   extensional). substrateIO's instrument report already recorded this split as
   an interpretation (INFERRED).

## 4. Decisions taken from this reconstruction

* The bridge is a **new layer in the purl repo** (`src/circle/`), because PURL
  owns addressing, operations and discovery. It reaches every other system
  only over HTTP through named adapters, so no system imports another's
  internals and every arrow is a testable boundary.
* Scrolls are **PURL/0.1 resources of type `scroll`**, which reuses the
  existing event log, versioning, fork, supersede and replay verification
  rather than inventing a store.
* substrateIO changes are confined to the instrument: a typed-term stage
  (justified by `derivation_id`, which must be computable *before*
  evaluation), the identity decomposition (fixes discrepancy 5), and a reader
  for the real ACSP events document. No registry status changes without
  evidence.
* ACSP gains only a local server script (no protocol change) and a migration
  artifact. The live deployment is not mutated by tests; one documented
  `propose` (which needs no capability and is pending until the owner
  resolves it) is the most the bridge may do to it, and only on explicit
  request.
* Golden Surface, seurl, MUSA, luna-foundry: **no code changes.** Golden
  Surface's scheme seam is the owner's explicit "build nothing yet"; the bridge
  specifies an adapter contract and tests the relay transport with its own
  FakePhone.
