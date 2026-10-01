# EXP-PROGRAM-MODEL-1: SEURL program ↔ circle Scroll record (pre-registered)

Written and committed **before** the script ran. Status of every prediction:
HYPOTHESIS until a record exists.

## Objects
* **program**: a SEURL move word with the mutating verbs removed (`/seurl/START/…`), with `content_id = H(text)`.
* **record**: a circle Scroll, i.e. a PURL resource holding `seurl`, `content_id`, `author`, `parent`, `derived_from`, builds and talks.
* **σ** (RECORD, COMMIT): program → record. **π** (PROJECT): record → program (`state.seurl`).
* **τ** (PUBLISH, TALK): record → ACSP TOK (declared boundary D1 in TRANSITION-MODEL.md).

## Predictions and falsification
| id | prediction | falsified if |
|---|---|---|
| M1 | π∘σ = id on programs: for every program of the declared space (3 bound states × words of length ≤ 3 over 4 moves = 255), the committed record's `seurl` equals the canonical program and `content_id = H(seurl)` | any mismatch |
| M2 | σ is not a function: committing the same program twice yields two records with different ids and the same `content_id` | equal ids, or different content_ids |
| M3 | the verb label survives σ: for every pair with the same value address that differs only by `PERTURB/b` vs `WRITE/flip/b`, the records have different `content_id` and the same `derivation_id` | any pair with equal content_id or different derivation_id |
| M4 | lineage is reconstructible from records alone: for transformed programs, recomputing the transformer (at the recorded `transformer_version`) over `derived_from.source.text` with the recorded params gives the record's `seurl`, and H(build) gives its `build_id` | any mismatch, or a transformer_version that no longer matches the code |
| M5 | τ keeps the program and loses the record: the program is recoverable from the TOK text (line `SEURL:`); author, parent and derived_from are not present in it | program not recoverable, or a provenance field present |

Loss is measured by substrateIO (`scripts/projection_matrix_measure.py`) over the (output, source) pairs of M1 and M5.

## Procedure
`node scripts/program-model.js` on an isolated circle (temporary PURL store, local substrate, local ACSP with a fresh resource).
Two runs (`record-1.json`, `record-2.json`). Failures are kept.

## Not tested here
Whether the "minimal loss boundary" generalises to other record systems, and whether TOKs published to the live ACSP behave the same way (no live writes: authority boundary).

## Run log (appended after the runs; the predictions above are unchanged)

| record | code | status | what happened |
|---|---|---|---|
| (none) | 716edfa | crashed, no record | the script indexed rows that did not exist (fewer commits than assumed) and wrote nothing. Fix: the script now writes its record even when it crashes |
| 1 | 716edfa | **confounded** | PURL's write limit (token bucket 120, 4/s) refused 6 COMMITs, all of M2 and all of M5; the circle reported it as `502 purl_refused` |
| 2, 3 | + 429 fix | partly valid | M1–M4 valid. In record-3 one TALK was reported `prepared` without a proposal: cause not recorded |
| 4 | + talk detail | partly valid | cause recorded: ACSP `422 limit_exceeded`, "100 pending proposals". The script's retry-on-429 had resent multi-step POSTs whose earlier steps had already happened, duplicating proposals |
| 5, 6 | + partial-effect reporting, no resend | M5 not measured | each M5 POST failed part-way on the PURL limit. The error now listed the performed steps, and the script correctly did not resend |
| 7, 8 | + refill pacing | valid | all predictions held (M1 on σ's domain) |
| 9, 10 | + TOK version fix | **valid, final** | as 7–8; the TOK now cites the version holding the build (v4, was v3) |

## Post-hoc checks (not pre-registered; labelled as such)
* **PH-1** TOK version citation: does the version the TOK cites hold the build it describes? Records 2–8: no (it cited the COMMIT version). Fixed. Differential test in `test/talk-refused.test.js`.
