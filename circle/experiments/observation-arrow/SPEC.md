# EXP-R9: why did no participant find the observation arrow? (pre-registered)

Committed before the apparatus ran and before any participant was started.

## What R9 is (located, not assumed)
* **In the rubric** (`experiments/reconstruction/SPEC.md:48`): "R9 ACSP events → substrate observation (projection)". It is a scoring criterion, not code.
* **In code**, the arrow it names is projection **P-ACSP-EV-1** (`substrateIO/substrate/acsp_events.py`). It maps an ACSP/0.1 `event_list` to a substrate observation (labels in logical time; it declares what it loses). It is reachable in the circle by `POST /acsp/r/{id}/observe`, automatically after a successful TALK (as `observations` on the scroll), and, since F-R4 (5b4699c), listed at `GET /projections` with an entry move.
* **Status of its output**: SIMULATED for `origin=harness`, UNRESOLVED for `origin=service`. It is never OBSERVED.

In STASIS-2, R9 scored 0/3. F-R4 was the diagnosis ("not discoverable") and the fix. That diagnosis was **never tested**.

## Design: 2 × 2, two participants per cell
| | prompt neutral (the original EXP-BRIDGE-RECON prompt, verbatim) | prompt eliciting (neutral + one sentence) |
|---|---|---|
| surface pre-F-R4 (purl `a9133b2`, the last commit before the fix) | cell 1 | cell 2 |
| surface current (this branch's HEAD at the run) | cell 3 | cell 4 |

The eliciting sentence: *"Pay particular attention to how a record in one system becomes an observation or a measurement in another system, and report every such arrow you find."*

Participants: subagents with no conversation context, models `sonnet` and `haiku` (one each per cell, 8 runs). This is the same provider; cross-provider is Q-014. Each cell has its own circle (fresh PURL and substrate stores, a local ACSP with an operator-created continuity resource) behind its own **logging proxy**. The proxy is the same instrument on both surfaces and modifies neither. It records method, URL, status and size, and whether the response body contained `P-ACSP-EV-1` or `/observe`. It never logs request bodies or headers. Sibling repositories run at their current heads on both surfaces (confound, stated).

## Measures (per participant)
* **exposed**: received at least one response containing `P-ACSP-EV-1` or `/observe` (proxy log).
* **requested-arrow**: requested `/projections`, any `/acsp/r/{id}/observe`, or performed a TALK.
* **reported (R9)**: the final report states that ACSP events/records are projected or observed into the substrate. Scored twice: mechanically (report contains `P-ACSP-EV-1`, or "observ" within 200 characters of both "ACSP" and "substrate"), then by reading. Both are recorded.
* Miss classification: **discovery failure** = not exposed; **reporting failure** = exposed but not reported.

## Predictions and falsification (n = 2 per cell: descriptive; no significance is claimed)
| id | prediction | falsified if |
|---|---|---|
| H1 discoverability | neutral prompt: R9 on current ≥ 1/2 and > pre (0/2) | current-neutral R9 ≤ pre-neutral R9 |
| H2 the STASIS-2 misses were discovery failures | pre-neutral participants are not exposed | a pre-neutral participant is exposed and does not report |
| H3 findable with intent | pre-eliciting: ≥ 1 participant exposed | no pre-eliciting participant exposed |

## Procedure
`node scripts/r9-apparatus.js` starts the four cells and writes `cells.json`. The participants run. Each final report is saved verbatim as `report-<cell>-<model>.md`. `node scripts/r9-score.js` writes `results.json`. GET-safety is re-checked per cell (state hash before and after).
