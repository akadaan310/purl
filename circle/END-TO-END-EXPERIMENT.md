# EXP-CIRCLE-E2E — SEURL → PURL → ACSP → SubstrateIO → checkpoint → resume

Script: `npm run circle:e2e` (`scripts/circle-e2e.js`). Records:
`experiments/e2e/record-{1,2,3}.json`. Every transition is HTTP and every
response is recorded. Deterministic content is hashed; generated ids and
wall-clock times are kept but excluded from the hash.

## Epistemic ledger
* **Observed (this repository's runs):** the transcript below.
* **Simulated:** all values (model executions). Actors are the script. ACSP is a local in-memory instance.
* **Reproduced:** records 2 and 3 share deterministic hash `sha256:1aad20b2…`.
* **Failure preserved:** record 1.

## The single entry
```
/seurl/START/map/eca/90/8/state/5/WRITE/next/PERTURB/0/WRITE/damage/16/COMMIT/BUILD/TALK/acsp/{resource}
```

## Transcript (record-2)

| # | Arrow | Method | Status |
|---|---|---|---|
| 1 | enter (`/`) | GET | 200 |
| 2 | discover constitution | GET | 200 |
| 3 | legal operations (`/naici/legal`) | GET | 200 |
| 4 | construct: SEURL → typed term → value | GET | 200 |
| 5 | prepare COMMIT/BUILD/TALK (changes nothing) | GET | 200 |
| 6 | perform: Scroll (PURL), 4 execution records (substrate), proposal (ACSP), observation (substrate) | POST | 201 |
| 7 | observe the Scroll | GET | 200 |
| 8 | checkpoint | POST | 201 |
| 9 | resume in a **new circle process**, no transcript | GET | 200 (`intact: true`, constitution unchanged) |
| 10 | rebuild from the resumed state | POST | 201 (all 4 steps `reproduced`) |

ACSP version delta across the run: exactly +1 (one pending proposal).

## Record 1: the failure, preserved
Step 10 failed (`401` from PURL, reported by the circle as `502`). A restarted
circle had no PURL principal, and a new one would not own the Scroll. Two
defects followed. The circle hid an authority refusal behind a 502, and the
circle's identity on PURL did not survive a restart. Fixed (`09d13b6`):
refusals are forwarded as `403 not_authorized`, and the principal token is kept
beside the persistent PURL store (0600, never in a record). The directive's
"a later session can resume from that checkpoint" held for *reading* before the
fix. It holds for *continuing work* only after it.

## What the run demonstrates (§35 of the directive)
| Contract item | Evidence in record-2 |
|---|---|
| enter through a URL; discover environment, constitution, legal operations | steps 1–3 |
| construct a small program; it has an address | step 4 (`derivation_id`) |
| the address resolves/executes; the execution has provenance | step 6 (records with derivation_id, value_id, environment_id) |
| the transition is represented in ACSP | step 6 (pending proposal; +1 version) |
| projected into SubstrateIO | step 6 (P-ACSP-EV-1 observation, SIMULATED) |
| the constitution can be checked | `CONSTITUTION-CONFORMANCE.md` (run at `c561e38`) |
| checkpointed; a later session resumes | steps 8–10 |
| no transcript needed | step 9 runs in a new process given only the checkpoint id |
| the browser can surface the state | `experiments/golden/record-1.json` (FakePhone: a circle URL opened in an owned tab) |
