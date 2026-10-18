# Post-upgrade public arithmetic check

**PASS** for one narrow private native PURL lifecycle after root reported Supabase migration `20261018152346` applied at `2026-10-18T15:23:46Z`. The JavaScript deployment was unchanged according to root.

- Program: `program_86b16e4b30d9121e9f30d9c5` (private).
- Build: `build_323dfa5f5e9be122a824b034`; **3/3 build tests passed**.
- Execution: `execution_5ccf7ab979e35929250fc697`; **input 4 → output 18**, **attempt 1**, actual worker `v22.14.0`.
- Queue-to-completion time: **23.558 seconds**.
- Strict replay: HTTP 200, valid program and execution, replayable, no problems.
- Receipt checks: execution, build and value IDs match; receipt content and artifact content IDs present.

All **12 HTTP calls succeeded**, with **zero retained errors**. Exactly five POSTs created the new principal/program, compiled, built and queued the run. No publish, checkpoint or extra artifact read occurred. Existing frozen programs and reports were untouched.

| Operation | HTTP | Seconds |
|---|---|---|
| new-principal | 201 | 6.201 |
| create-private-arithmetic | 201 | 5.108 |
| compile-current-version | 200 | 1.536 |
| compile | 200 | 7.284 |
| build-current-version | 200 | 2.263 |
| build | 200 | 11.291 |
| run-current-version | 200 | 2.155 |
| run | 202 | 9.921 |
| execution-poll-1 | 200 | 8.436 |
| execution-poll-2 | 200 | 7.378 |
| execution-poll-3 | 200 | 1.571 |
| strict-replay | 200 | 2.358 |

Raw redacted exchanges, timings, build tests, receipt and replay are in the numbered JSON files and `report.json`. The issued bearer was compared against all evidence files, then cleared from memory.

This single successful run does not establish general database reliability or elimination of all statement timeouts. Root owns the separate SQL and unchanged-row-version proof.
