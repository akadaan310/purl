# Current state of the circle (2026-10-01)

Machine-readable twin: `current-state.json`. Arrows: `bridge-manifest.json`.
Start a new session here, then `RECONSTRUCTION.md` (what existed before),
then substrateIO `research/state/HANDOFF.md` (the research discipline).

## Quick start
```bash
cd purl && npm test                                   # 70 tests (12 circle; integration needs ../substrateIO and ../NetGovComEduGovOrgEduGovComNet with node_modules)
SUBSTRATE_DIR=../substrateIO ACSP_DIR=../NetGovComEduGovOrgEduGovComNet npm run circle   # entry: http://127.0.0.1:8484/
npm run circle:e2e            # EXP-CIRCLE-E2E, appends circle/experiments/e2e/record-N.json
npm run circle:conformance    # regenerates CONSTITUTION-CONFORMANCE.md from a live run
cd ../substrateIO && python3 -m unittest discover -s tests -t . && python3 -m tools.validate   # 74 OK, 0 violations
cd ../NetGovComEduGovOrgEduGovComNet && npx vitest run && npm run serve:local                 # 24 pass
```

## Commits at the final checkpoint
| Repo | Commit | Change |
|---|---|---|
| purl | this branch | `src/circle/`, `scripts/circle*.js`, `test/circle.test.js`, `circle/` (all artifacts) |
| substrateIO | `60ce712` | typed terms, identity decomposition (F-010), P-ACSP-EV-1, C-041…C-046, Q-014/Q-015 |
| ACSP | `29b4911` | `scripts/serve-local.ts`, `MIGRATION-FROM-RELAY.md`, `migration/relay-gen1/` |
| seurl, golden-surface, MUSA, luna-foundry | unchanged | read and cited only |

Final checkpoint: PURL resource `r_HMGMD46GSD`, content id
`sha256:ef5ed564…d2e`, snapshot in `checkpoints/final/`. It verifies from the
snapshot alone (test "final checkpoint is recoverable"). Active scroll:
`r_G2TE3WEDSM`, the reusable damage probe built by fresh participant B.
Constitution v1 `sha256:319402d8…cb4`. Last conformance run `r_PT7JH5RK4C`: TESTED 14 ·
EXTERNAL 1 · HUMAN_REVIEWED 3 · CONFLICTING 1. Before it, run `r_NGF9DGARER`
FAILED K-12, and stays recorded (see below).

## Established
* Nothing new is established by this work. The existing guarantees it relies on
  (the ACSP invariants, GET safety, PURL hash chains) are cited from their
  systems' own tests.
* C-041 (intension vs extension of an address) and C-044 (alias candidates as
  pattern mining) are recorded as ESTABLISHED *because they are known
  concepts*, not because this work established them.

## Observed (in this repository's runs)
* All arrows A0–A8 execute against real processes (`bridge-manifest.json`).
* EXP-CIRCLE-E2E reproduced: records 2 and 3 share deterministic hash `1aad20b2…`.
  A rebuild after resume reports `reproduced` for every step.
* EXP-CIRCLE-FRESH: condition B scored 13/14 discoverables and built a reusable
  scroll. Condition C (GET only) handed off a valid program and a valid ACSP
  intent, and the build performed from it matched C's predicted value_id.
  Condition A inspected without acting, and used non-HTTP means.
* Fresh participant B found four defects that the conformance suite had passed
  (F-C1…F-C4). The new checks fail on the old code and pass on the fixed code.

## Implemented
SEURL FSM; typed-term stage; identity decomposition; Scrolls as PURL/0.1
resources with forks as versions; builds; TALK to ACSP (prepared → submitted);
P-ACSP-EV-1; checkpoints and resume; alias measurement; NAI-CI
surface/read/legal/trace over circle URLs; a clause-structured constitution with
derived conformance; amendments as proposals only; adapters with explicit
`unavailable_here`; a Golden Surface relay adapter.

## Simulated
Every value (model executions). All actors: scripts and same-family subagents.
The local ACSP. Golden Surface's phone (FakePhone).

## Hypothesized
* H-FRESH and H-BROWSER: tested once each, not falsified (`FRESH-AGENT-EXPERIMENT.md`).
* C-045 Constitution-Oriented Programming: HYPOTHESIS. Every component so far maps
  to an established practice. One instructive observation: implementer-written
  checks passed defects an outside participant found.
* C-042 Scroll, C-043 SEURL path: PROVISIONAL working terms.

## Failures preserved
| Id | What | Where |
|---|---|---|
| F-010 | address/value hash conflation | substrateIO failures.json |
| E2E record-1 | restarted circle could not continue a resumed scroll; 401 hidden as 502 | `experiments/e2e/record-1.json` |
| F-C1…F-C4 | fork-inherited records, non-public forks, skipped ACSP checks, unadvertised routes | `FRESH-AGENT-EXPERIMENT.md` |
| conformance `r_NGF9DGARER` | K-12 FAILED on legacy forks; repaired forward (grant events), not rewritten | experiment PURL store (`checkpoints/final/purl-store`) |
| launcher | npx grandchildren leaked; fixed with process-group kill | commit c561e38 |
| SEURL grammar | ACSP ids that spell words parsed as verbs; fixed by TALK arity | commit 079c96e |
| Golden Surface tests | `test_sync_loud`, `test_watchers` fail here (no watcher process; no Python Playwright): environmental | RECONSTRUCTION.md |

## Unresolved
1. **K-18 conflict.** MUSA constitution art. I vs owner-resolved publication. Needs the operator.
2. **A-001.** Move clause→check mappings out of the constitution. Needs a human adoption commit.
3. **Q-014.** A cross-provider participant (a human opens the URL in another provider's session).
4. **Q-015 / OP-010.** The epistemic status of live-service records.
5. **Live ACSP TALK** (`acsp-one.vercel.app`, resource `8N2RXG1MW79S`). Never done. It would add a real pending proposal; do it only on request.
6. **Real Android WebView**: Golden Surface with the APK opening a circle URL.
7. **`seurl://` scheme**: the mapping to `/seurl/…` is proposed, not implemented in any browser.
8. **program-001** source (ACSP agent identities, `/transitions`): referenced, absent.
9. **Code as a first-class value** for TS/Python/shell sources: only operation implementation refs (digests) exist.
10. **Constitutional recursion** (C-046): untested. Nothing yet lets a produced artifact extend the operation set.
11. **External compiler adapters** (LLVM, MLIR, Tree-sitter, Wasmtime): not built, because no operation needs them.

## Next state
Decide K-18 and A-001 (human). Then Q-014 (requires a reachable deployment of
the circle). Then let a produced Scroll become a *registered operation* through a
proposal, which is the first test of C-046.
