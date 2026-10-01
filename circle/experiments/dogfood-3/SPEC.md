# EXP-DOGFOOD-3: the development loop as observable transitions (pre-registered)

Committed before the script ran. DOGFOOD-REPORT F-D1 (STASIS-2) found that the
environment hosts the computational loop but not the development loop. This
experiment tests whether the development loop of STASIS-3 can now be observed
through the circle's own interface (`POST /dev/iterations`, `GET /self`).

## Procedure (`node scripts/dogfood-dev.js`)
1. For every first-parent purl commit in `53f21e4..HEAD` (53f21e4 = STASIS-2's purl commit): check the commit out in a git worktree next to the other repositories, run `npm test` there, and keep the summary, the failing test names and the SHA-256 of the full log.
2. Start an isolated circle on HEAD's code (temporary PURL store, local substrate). Run one conformance run (`POST /conformance/runs`).
3. `POST /dev/iterations` once per commit, attaching step 1's result as reported evidence. Then `POST` one iteration for a commit id that does not exist.
4. Hash the PURL/substrate state, `GET /dev/iterations`, `/dev/iterations/{id}` for each, and `/self`, then hash again.
5. Write `record-N.json` (the export plus all of the above). Two runs.

## Predictions and falsification
| id | prediction | falsified if |
|---|---|---|
| D1 | every commit is recorded with a complete addressed transition (source_ref, operation, target_ref, actor, content_id non-null; git has no clock position by design) | any commit refused, or a non-null field missing |
| D2 | evidence currency is `current` exactly for commits whose `implementation_id` equals HEAD's (the only implementation with a conformance run) and `none` for all others | any other assignment |
| D3 | a commit id that does not exist is refused (404) and nothing is recorded | 2xx, or the iteration count changes |
| D4 | every commit passes its own unit suite (`npm test` at that commit, sibling repositories at their current heads) | any commit with failures. Recorded as found: failure is an observation about history, not something to fix in history |
| D5 | the GETs of step 4 change nothing | state hash differs |

## Known confound
The suite at commit *k* runs against the sibling repositories at their **current** heads, not at their heads when *k* was made. A failure in D4 must be diagnosed before it is attributed to *k*.
