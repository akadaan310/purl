# EXP-BRIDGE-RECON — results

Pre-registration: `experiments/reconstruction/SPEC.md` (commit `ddbd066`, before
any run). Apparatus: circle at purl `ddbd066`, substrate `07e15d0`, local ACSP
(serve-local, in-memory) with continuity resource `EWHFG2ST3J8E` created by the
operator as owner. Participants ran **sequentially**: each started from the
state left by the previous one. No participant was rescued or messaged.
Reports are kept verbatim in `experiments/reconstruction/report-*.md`.

Epistemic ledger: **observed** (reports checked against server state); measures
**discoverability and reconstructability** only. **Not** a measure of truth or of
model quality. Models are of one provider: different models, not independent providers.

## 1. Scores (rubric R1–R14 from the SPEC; 1 = stated correctly AND, for actions, visible on the server)

| Item | P1 `sonnet` | P2 `haiku` | P3 default |
|---|---|---|---|
| R1 SEURL = seven-verb move notation | 1 | 0 ("SEURL grammar", verbs never named) | 1 |
| R2 substrate = values/executions, computational | 1 | 1 | 1 |
| R3 PURL = record store | 1 | 1 | 1 |
| R4 ACSP = continuity, propose-only from here | 1 | 1 | 1 |
| R5 Golden Surface identified + state | 1 | 1 | 1 |
| R6 program → value address / typed term | 0 | 0 | 1 (checked `/v/…` by hand against the scroll) |
| R7 Scroll = PURL record holding a program | 1 | 1 | 1 |
| R8 TALK stops at a pending proposal | 1 | 1 | 1 |
| R9 ACSP events → substrate observation | **0** | **0** | **0** |
| R10 constitution + derived conformance | 1 | 0 (constitution only) | 1 |
| R11 history: stases | 1 | 0 | 1 |
| R12 checkpoint and resume | 1 | 0 (missed P1's circle checkpoint; read ACSP's genesis checkpoint) | 1 (resumed P1's checkpoint; drift reported) |
| R13 GET prepares / POST performs; session asserted | 1 | 1 | 1 |
| R14 continued and left a record (server-verified) | 1: conformance run `r_JZST1M8CBZ`, checkpoint `r_W4P3KM7Z0C` | 1: ACSP proposals P-002, P-003 (posted **directly to ACSP**, bypassing the circle) | 1: built `r_722WQGQRKB` (X-000020..22), checkpoint `r_W4DQ08HVD7` |
| **Total** | **12/14** | **8/14** | **13/14** |
| H-RECON (≥ 9 and R14) | met | **falsified** | met |

**Overall: 2 of 3 meet H-RECON, so the experiment's hypothesis is not
falsified.** For P2 it is falsified individually.

GET-safety after all runs: state hash `67734c5672d3344d` before and after a crawl
of 120 GET URLs (`experiments/reconstruction/get-safety.json`).

## 2. Hand-off between participants (the last link of the circle)

| From → to | Picked up | Missed |
|---|---|---|
| P1 → P2 | P1's ACSP proposal (P-001) and its scroll | P1's circle checkpoint `r_W4P3KM7Z0C` |
| P1, P2 → P3 | P1's checkpoint (resumed; drift reported), P1's conformance run, P2's proposals, the never-built scrolls | — (but P3 could not leave its note: F-R1) |

Two different continuity channels were used: the circle checkpoint (P1, P3) and
direct ACSP proposals (P2). P3 noticed that nothing links P2's proposals back to a
circle record. When a participant bypasses the circle, the circle's provenance
and epistemic projection do not apply. P2's TOK content was nevertheless labelled
"computational (not observed)" on its own.

## 3. What no participant found

**R9 (ACSP → substrate observation) was missed by all three.** The projection is
visible only (a) after a TALK, as `observations` on a scroll, or (b) as the move
`project` on `/acsp/r/{id}`, which no participant opened. It is the least
discoverable arrow of the bridge. Recorded as discoverability defect **F-R4**
(fixed below by listing `/projections` in the entry document and the SDK answers).

## 4. Defects the participants reported, verified

| Id | Reported by | Claim | Verified | Fix |
|---|---|---|---|---|
| F-R1 | P3 | a checkpoint's `next` note sent in the JSON body was silently dropped | **yes**: only `?next=` was read | the body is read; unknown body fields are refused, not ignored |
| F-R2 | P3 | checkpoints record ACSP as empty although configured | **yes**: only `?acsp_resource=` was read | defaults to the configured continuity resource |
| F-R3 | P3 | commits disagree (checkpoint `ddbd066` vs observatory `94026f2`) | **yes, an ambiguity**: one is the code the process runs, the other the repository HEAD; neither said which | the observatory reports both, and `running_differs_from_head` |
| F-R4 | (all, by omission) | the ACSP→substrate projection is not discoverable | yes (R9 = 0 ×3) | `/projections` route + entry move |
| — | P3 | `/transitions/coverage` returns 404 | **not reproduced** (200 before and after) | none |
| — | P3 | `/stases/{n}` returns 404 | the literal template was requested; `/stases/1` → 200 | none (template marked `template: true`) |

Differential evidence for F-R1…F-R4 (old `ddbd066` FAILS, new PASSES):
`differential/results.json` (second run).

## 5. Misunderstandings recorded
* P2: "Checkpoints: 1 at genesis": conflated ACSP's checkpoints with the circle's.
* P2: "Scroll r_PSWDQMZRAS demonstrates SEURL→Build workflow": correct, but the
  scroll was built by P1's conformance run, not by P2.
* P1: none beyond omissions.
* P3: "/transitions/coverage 404": not reproducible.
