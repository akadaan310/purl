# Current state of the bridge: STASIS-3 (closed 2026-10-01)

Machine-readable: `current-state.json`, `bridge-manifest.json` (generated),
`stases.json`. The STASIS-2 version of this page is in git history (`a241999`)
and summarised in `stases.json`. Labels follow BRIDGE-NOMENCLATURE.md §0.

## Start here (a fresh session)
1. `git fetch origin` in **every** repository.
2. Read `BUILD-PLAN-STASIS-3.md`, then this page, then `OPEN-PROBLEMS.md`.
3. Run `SUBSTRATE_DIR=../substrateIO ACSP_DIR=../NetGovComEduGovOrgEduGovComNet npm run circle`, then `GET /`. It greets you; follow it to `/sdk`, `/ide`, `/code`, `/self`.
4. Rebuild from GitHub: `SOURCE=origin node scripts/bridge-cold-reconstruct.js` (34 checks).

## Identity
| | |
|---|---|
| commits | purl `f092e04` (code), closing record "bridge: close STASIS-3"; substrateIO `1657120`; ACSP `e8d989a`; seurl `620ff95`; golden-surface `b113718`; MUSA `d797135` |
| constitution | v1 `sha256:319402d8…8cb4` (unchanged since STASIS-1); enforcement.json grew |
| checkpoint | `r_D4RSRCHB3G` `sha256:15f339af…6cec`, snapshot `checkpoints/stasis-3/`, replay test in `test/circle.test.js` |
| conformance | `r_AJFZ5299CM`: 14 TESTED, 1 EXTERNAL, 3 HUMAN_REVIEWED, 1 CONFLICTING (K-18), 0 FAILED |
| tests | purl 98, substrateIO 78 (+ validate 0 violations), ACSP vitest 24 |
| reproduced | cold report-5 (warm) and report-6 (caches cleared): 34/34 from GitHub |

## Deliverables (each with its label)
| deliverable | file | status |
|---|---|---|
| build plan | BUILD-PLAN-STASIS-3.md | written before implementation |
| contract / constitution / nomenclature | BRIDGE-CONTRACT.md, BRIDGE-CONSTITUTION.md, BRIDGE-NOMENCLATURE.md (§0 labels, §9 conflicts, §10 schema fit) | DERIVED / declared |
| manifest | bridge-manifest.json v3 + components.json | GENERATED (provenance per field) |
| SDK spec / constitution | SDK-SPEC.md §6 (v0.3), SDK-CONSTITUTION.md | IMPLEMENTED, TESTED |
| transition model / projection matrix | TRANSITION-MODEL.md, PROJECTION-MATRIX.json | DERIVED (exhaustive) + OBSERVED (committed records) |
| constitution/enforcement model | CONSTITUTION-ENFORCEMENT-MODEL.md | OBSERVED (axes record-2) |
| program model | PROGRAM-MODEL.md | OBSERVED (EXP-PROGRAM-MODEL-1) |
| dogfood | DOGFOOD-REPORT.md (STASIS-3 section) | OBSERVED (EXP-DOGFOOD-3) |
| program closure | PROGRAM-CLOSURE.md | OBSERVED; P2 DISPROVEN |
| observation arrow | OBSERVATION-ARROW.md | OBSERVED (n small); F-R4 diagnosis not supported |
| cold reconstruction | COLD-RECONSTRUCTION.md | REPRODUCED |
| security findings | SECURITY-FINDINGS.md | SF-1 reproduced; SF-7, SF-8 fixed |
| open problems / research queue | OPEN-PROBLEMS.md; substrateIO Q-016…Q-018 | UNRESOLVED items |

## Statuses (there is no single "complete")
| item | status |
|---|---|
| conformance and authority as independent axes; evidence currency as a third | OBSERVED (all four quadrants); data staleness detection NOT IMPLEMENTED |
| program ↔ record | π∘σ = id on dom(σ) OBSERVED; σ is partial (FSM + typing) |
| what survives a boundary | every lossless crossing is lossless by reference (INFERRED from 12 measured boundaries) |
| constitution-aware program generation | sound but incomplete; the catalog cannot express derivation preconditions or value-dependent bounds (DISPROVEN that the declared catalog suffices) |
| development loop | OBSERVABLE (dev iterations with computed evidence currency); the circle never performs development |
| observation arrow R9 | seen by every participant, reported by 3/8; F-R4 diagnosis not supported |
| end-to-end test | INTERMITTENT under load (OP-S3-17), root cause open |
| Golden Surface | FakePhone only; real device NOT TESTED; relay NOT MAPPABLE |
| Android client | NOT IMPLEMENTED (boundary defined, not faked) |
| MUSA | specification; ramz seal forgeable (SF-1) |
| K-18 / A-001…A-004 | UNRESOLVED: a human decision (K-13) |
| cross-provider (Q-014/Q-018) | READY, waiting on a human and a deployment decision |

## Next (STASIS-4)
OP-S3-17 root cause; Q-016 catalog constraint classes; an R9 presentation test
on a larger n; Q-017 data fingerprints; and human decisions on K-18 and
A-001, plus a human-run Q-014.
