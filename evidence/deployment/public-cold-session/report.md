# Public PURL cold-session evidence

PASS for the bounded public lifecycle and replay checks. The broader mission remains NOT_RUN; requirement truth was not verified.

Started with only https://purl-api-production.up.railway.app/p/godseed-mission . All protocol, SDK, program and runtime evidence came from HTTP on that public origin. No local source, database, environment variables or other reports were inspected. A new self-declared AI principal performed authorized operations on public isolated programs. Tokens stayed in process memory and are redacted in evidence.

PURL/0.2 discovery led to the SDK, operation manifests, current authority, runtime and continuity. Original authenticated rights were read/run/propose; forking required authenticated read. Both created programs are public and owner-controlled. Each lifecycle mutation used a freshly read expected_version and a payload-specific idempotency key.

| Record | Mission fork | Native arithmetic |
|---|---|---|
| Program | [program_c8298dd282f72d1420cd15f8](https://purl-api-production.up.railway.app/p/program_c8298dd282f72d1420cd15f8) (v6) | [program_5aa690946a1dc4638cc8a40a](https://purl-api-production.up.railway.app/p/program_5aa690946a1dc4638cc8a40a) (v6) |
| Build object ID | build_75aa11c4e210039585edf861 | build_fead495ba2ddd82405405ced |
| Build SHA-256 | sha256:74354d7e0c2bf507e0dfa5c0927f00847fd2460c55f7008dc648d15350bf69ea | sha256:86cf044c3a239f2bfd618a8c6920e5450a02911789fa899ed97050aefcbd0c24 |
| Execution | [execution_a4be0b1eef262766b8ae553c](https://purl-api-production.up.railway.app/api/executions/execution_a4be0b1eef262766b8ae553c) | [execution_62a3543a5f2130b4b42cc24f](https://purl-api-production.up.railway.app/api/executions/execution_62a3543a5f2130b4b42cc24f) |
| Artifact | [artifact_08ef5bf69b8395d483c975e8](https://purl-api-production.up.railway.app/api/artifacts/artifact_08ef5bf69b8395d483c975e8) | [artifact_15bd735d0ff3d1b34080e413](https://purl-api-production.up.railway.app/api/artifacts/artifact_15bd735d0ff3d1b34080e413) |
| Immutable release | [release_c9474f31ad7f07b0d02c733b](https://purl-api-production.up.railway.app/api/releases/release_c9474f31ad7f07b0d02c733b) | [release_8ccbb23641acc20c22476791](https://purl-api-production.up.railway.app/api/releases/release_8ccbb23641acc20c22476791) |
| Checkpoint in continuity | [checkpoint_988343e55cef6b762fe719b6](https://purl-api-production.up.railway.app/api/programs/program_c8298dd282f72d1420cd15f8/continuity) | [checkpoint_c02e5593180f8f136d7e43f5](https://purl-api-production.up.railway.app/api/programs/program_5aa690946a1dc4638cc8a40a/continuity) |
| Strict replay | [valid, replayable](https://purl-api-production.up.railway.app/api/programs/program_c8298dd282f72d1420cd15f8/replay) | [valid, replayable](https://purl-api-production.up.railway.app/api/programs/program_5aa690946a1dc4638cc8a40a/replay) |
| Actual worker runtime | v22.14.0 | v22.14.0 |

The mission fork compiled/built `input json | mission.inspect` and executed the fork state. Independent counting found **52 nodes, 65 edges**, all **NOT_RUN**, with **zero evidence entries**. Explicit dependencies produce the frontier **`["mission"]`**, and the native inspector agreed. Its output remains `completion: "NOT_RUN"` and `verified: false`. Mission builds inherit zero embedded tests; independent client assertions verify the inspector output, with a second read-only agent checking the graph separately.

Arithmetic source is `input number | math.add 2 | math.multiply 3`. Its immutable build passed **3/3 tests**: `4 → 18`, `0 → 6`, and `-2 → 0`. The queued worker execution succeeded with `4 → 18`; its actual runtime environment is `v22.14.0`. Both programs’ strict replay reports are valid with no problems and execution replayability true.

**30/30 client checks passed**. Anonymous read-back returned HTTP 200 for both canonical manifests, releases, artifacts and continuity checkpoints. Both checkpoint records explicitly have `evidence_verified: false`. The only failed request was a corrected `400 invalid_kind`: create accepts `program`, `mission` or `game`, while seed metadata had suggested `math`. The corrected request used a fresh idempotency key.

Original seed preservation: version 1, source and state identical, one unchanged event, no executions. The original seed service state hash stayed `sha256:413d2439eaeea3b46241af717707a4d4e77a29ef288f4f9a89739538a04f23a1`. No original compile, build, run, publish or checkpoint was requested.

Structured redacted HTTP exchanges are the numbered JSON files in this directory; `http-index.json` lists them. `report.json` contains exact IDs, content hashes, runtime receipts, results, checks and limits. `client-assertions.json` lists the independent checks. `independent-graph/REPORT.md` records the separate read-only graph investigation. Main session made 55 HTTP calls, with at most 14 in any rolling 60 seconds; independent graph session made 5 spaced GETs. No rate-limit rejection occurred.

Limits: this is native bounded PURL execution in a fresh same-provider agent session. It does not verify arbitrary-code sandboxing, Python/JS self-extension, cross-provider independence, full mission requirements, visual UI, database policy/backups, interrupted-job recovery, or restart durability. Seed historical Node24 metadata was preserved; fresh executions provide actual Node22 evidence. Content hashes prove internal consistency, not external authenticity.

Next: compare these frozen records and strict replay after the separately coordinated API/worker restart. Continue reconstruction and formal-contract evidence gathering before proposing mission status changes.
