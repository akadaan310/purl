# The observation arrow (R9): what it is, and why participants missed it

Experiment EXP-R9 (`experiments/observation-arrow/`). The SPEC was pre-registered
in a48f7cd, the per-participant clarification in e68f144 (before any run), and
the scorer was written before any report. Eight reports are saved verbatim from
the participants' final messages. Also kept: proxy logs, `manual.json` (scores
with reasons), `results.json` and `get-safety.json`.

## 1. What R9 is
* In the rubric, R9 is a scoring item: "ACSP events → substrate observation (projection)".
* In code, it is **P-ACSP-EV-1** (`substrateIO/substrate/acsp_events.py`): an ACSP/0.1 `event_list` becomes a labelled transition sequence in logical time, with a declared loss (payload, agent kind, capability ids, wall clock).
* In the circle it is reached three ways:
  * `POST /acsp/r/{id}/observe`;
  * automatically after a successful TALK (`observations` on the scroll);
  * listed at `GET /projections` (since F-R4).
* Its output is SIMULATED (harness origin) or UNRESOLVED (live service). It is never OBSERVED.

## 2. Results (n = 1 per model per cell: descriptive only)
| cell | sonnet | haiku | R9 (manual) |
|---|---|---|---|
| pre-F-R4, neutral | 0 | 0 | 0/2 |
| pre-F-R4, eliciting | **1** | 0 | 1/2 |
| current, neutral | **1** | 0 | 1/2 |
| current, eliciting | **1** | 0 | 1/2 |

**Exposure.** All 8 participants were exposed by the SPEC's definition
(`P-ACSP-EV-1` or `/observe` in a response they received). By a stricter,
post-hoc measure (`P-ACSP-EV-1` alone), 7 of 8 were. On the pre surface the
name sits in `/sdk`'s route table, and the three pre-surface participants
exposed through the proxy first received it from `GET /sdk`. The SPEC's `/observe` marker turned out to be weak: it
matches the route *path* in the route list.

| prediction | verdict |
|---|---|
| H1 discoverability: current-neutral > pre-neutral | **held**, 1/2 vs 0/2: the weakest possible margin |
| H2 the STASIS-2 misses were discovery failures | **FALSIFIED**: both pre-neutral participants were exposed and did not report. One of them (sonnet) even *performed* a TALK that recorded the observation and named its id, but never said what it observed |
| H3 findable with intent | **held**: the pre-surface eliciting sonnet reported the arrow precisely |

GET-safety: replaying all 162 GETs the participants made left every
instance's state unchanged (`get-safety.json`).

## 3. Why the arrow was missed (INFERRED from the table, the logs and the reports)
1. **Not (only) discoverability.** The STASIS-2 diagnosis F-R4 ("not discoverable") is **not supported** as the explanation. The arrow's name was on the surface the STASIS-2 participants used: `src/circle` is identical between ddbd066 and a9133b2. Every participant here encountered it.
2. **It is presented as a route or a side effect, not as an arrow.** On the pre surface, P-ACSP-EV-1 appears as one route description in the `/sdk` route table, and as an `observations` entry after TALK. A participant that does not already look for cross-system arrows reads it as bookkeeping: "recorded observation O-000001". Both the eliciting sentence (pre surface) and the current surface's explicit `/projections` document made one participant (sonnet) articulate it.
3. **Model capability dominates in this sample:** sonnet 3/4, haiku 0/4. Two haiku reports misdescribed the observation:
   * as "publishing findings to ACSP" (wrong direction);
   * as "an observation record documenting the reconstruction".
   This is a comprehension failure after exposure, which a surface change cannot fix by visibility alone.

## 4. Confounds and limits (stated, not corrected after the fact)
* n = 1 per model per cell; one provider (Q-014 stays human-mediated).
* Scoring is not blind (the condition is in the file name). The mechanical criterion disagreed with manual scoring 3 times, each time over-scoring (proximity of words without the arrow).
* Participants could, and did, bypass the proxy by calling backend ports listed in the circle's documents (instance 4 made only 6 proxied requests). Exposure is therefore a lower bound.
* Sibling repositories ran at their current heads on both surfaces.

## 5. What participants found that was real (each checked)
* **F-R9-1: epistemic status followed the caller's claim.** The same ACSP event list was SIMULATED via TALK (`origin=harness`, configured by the operator) and UNRESOLVED via `POST …/observe?origin=service` (declared by a participant). **Fixed**: the origin is the operator's configuration; a mismatching `origin` is refused with `422 origin_mismatch`. Differential test `test/observe-origin.test.js` (old 503, new 422).
* **F-R9-2: no circle route lists observations.** `GET /observations/{id}` is served only by the substrate's own port. OPEN (OPEN-PROBLEMS OP-S3-18).
* "The scroll is at version 5 after one POST": explained by the record model (create, content update, build, talk, observation appends). Not a defect. PROGRAM-MODEL.md documents the versions.
