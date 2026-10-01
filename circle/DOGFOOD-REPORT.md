# Dogfood report (STASIS-2)

The question: can the builder use the environment it is building, through the
environment, for its own development loop
(read → discover → write → execute → observe → test → record → commit → reconstruct → continue)?

Epistemic ledger: everything below is **observed** in this repository's runs
(session ids `claude-dogfood`, `operator-final`, `sdk-test`, `conformance-runner`).
All values are **simulated** (model executions). Interpretations are marked.

## 1. Which steps of the loop went through the environment

| Step | Through the environment? | Evidence |
|---|---|---|
| read the bridge, discover | yes: `/`, `/sdk`, `/sdk/constitution` | 46 routes listed; `sdk_describes_itself` |
| write a program | yes: SEURL `…/PERTURB/0/WRITE/damage/16` | scroll `r_2VC97GG1DN` (dogfood store) |
| execute | yes: BUILD → 4 substrate execution records | build `BUILT` |
| observe | yes: perturbation record (pre/post value_id, environment, damage observation) | `/scrolls/r_2VC97GG1DN` → `perturbations` |
| transform a program | yes: `retarget` → `r_98ZWP0MPXW` (rule 150), BUILT; `extend/next` on a damage refused at typing (correct) | `/programs/transform` |
| test | yes: `/programs/closure`, `POST /conformance/runs` | closure table below; runs on `/tests` |
| record | yes: PURL scrolls, substrate records, ACSP proposals | event logs |
| **commit (code)** | **no**: the environment can *project* a git commit (`/git/{repo}/{sha}`) but cannot make one, and code is edited outside it | finding F-D1 |
| reconstruct | yes: `/resume`, and `bridge-cold-reconstruct.js` restarts the environment from committed refs | cold report-1, report-2 |
| continue | yes for records (resume, rebuild = `reproduced`); **no for code** | — |

**Finding F-D1 (observed).** The environment hosts the *computational* loop end
to end. It does not host the *development* loop: the source of the bridge was
written in files and committed with git outside it. The environment observes and
tests that development, but cannot perform it. The only route by which it could
(a route that writes code or commits) would breach K-13/SDK forbidden
transitions. This is a boundary, not a gap to close silently.

## 2. Closure of programs under transformers (C-053, measured)

Transformers: `extend(next)`, `extend(orbit)`, `perturb(0)`, `iterate(2)`, `truncate()`.
Closure = fraction of distinct results that are FSM-legal and well-typed (depth 2).

| Source program | distinct results | well-typed | closure | failure stage |
|---|---|---|---|---|
| `START/map/eca/90/8/state/5` | 12 | 9 | 0.75 | type ×3 |
| `START/map/eca/90/8/state/5/WRITE/next` | 18 | 14 | 0.78 | type ×4 |
| `START/map/eca/30/8` (a map) | 3 | 0 | 0.00 | type ×3 |
| `r_2VC97GG1DN` (…/PERTURB/0/WRITE/damage/16) | 9 | 5 | 0.56 | type ×4 |

Observed: the program language is **not closed** under these transformers.
Every failure is at the typing stage, never the FSM. Closure depends on the
kind the program ends in (a damage or a map admits no state transformer).
Interpretation (INFERRED): transformers should be typed by the kinds they apply
to, as substrate operations already are. That would make closure 1.0 by
construction, and the measure would then become one of coverage. Not done.

## 3. Defects found by dogfooding (each kept; fixes are new commits)

| Id | Defect | Found by | Fixed in |
|---|---|---|---|
| D-1 | STASIS-1 reconstruction never fetched all branches, so it reported existing work (program-001, 417da6c, composition bridge, golden engine) as missing | this phase's reconstruction | `25292e4` (recorded; history not edited) |
| D-2 | `/transitions/coverage` sampled the latest scroll even when unbuilt, which dropped execution records from the matrix | a new integration test | `41ce482` |
| D-3 | my identity check used `START…/COMMIT` (BOUND→COMMIT is illegal); the FSM correctly refused it | the conformance run | `41ce482` |
| D-4 | my test assumed closure < 1; at depth 1 the source was fully closed | the test | `41ce482` |
| D-5 | commit `41ce482`'s message says "purl 74 tests"; the suite reports 72 | re-reading the record | not rewritten; recorded here and in the manifest |
| D-6 | `bridge-cold-reconstruct.js` ran `node --test test/`, which runs no tests | cold report-1 | `c6bd0bd` |
| D-7 | `experiments/golden/record-1.json` (STASIS-1) stored responses but not request parameters, so its golden actions lose tab refs in the transition projection | coverage matrix | not fixed in the old record (history); `test/golden.test.js` records parameters |
| D-8 | the MUSA test parser missed chained transition lines | its own failure | `ec6389e` |
| D-9 | `test_locked.py` invoked as a script with a URL; it is a unittest module | my run | invocation corrected (no repo change) |
| D-10 | `serve-local.ts` duplicates `harness/serve.ts` on the composition branch | reconstruction | recorded; not merged |

## 4. What the environment could not support (environment-limited)

* A real phone. No device is attached and `40.64.120.87:8490` is unreachable,
  so Golden Surface is tested with its FakePhone only.
* Other providers' sessions: not automated (§20). Q-014 needs a human.
* The live ACSP was never written to (only read), because a TALK would add a
  real pending proposal to the field-trial resource.
