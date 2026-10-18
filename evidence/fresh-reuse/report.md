# Fresh PURL reuse evidence

Status: **PASS_LOCAL_REUSE**. HTTP-only discovery; published SDK executed in memory; tokens redacted.

Entry: http://127.0.0.1:8080/p/program_b539804050cda1c697edbae1

## Exact identifiers

- original: `program_b539804050cda1c697edbae1`
- original_release: `release_461590aa56576fff4faa8ee4`
- original_build: `build_5159136fabf4005dce57ea85`
- original_execution: `execution_b92992c86c7adb31b4f3ab75`
- original_artifact: `artifact_fbb065a6feb540428b68e7ed`
- original_checkpoint: `checkpoint_31b36ea035ffc6624d0eb816`
- final_principal: `principal_dd12ab773c6faf164e5ae497`
- fork: `program_6ea22ff8dea86c69b61f7f47`
- fork_build: `build_4afe12056c5527d568b6e14a`
- fork_build_content_id: `sha256:7f69f5c029938fabe9d0742d871dd318cc1e1e69cb50c884494824bac8cc1183`
- fork_release: `release_1be0ebd1a11e669ca23fc089`
- fork_execution: `execution_b6af8705b14c8bed7e5c972b`
- fork_artifact: `artifact_1e7968b56d1a8e7378dcba08`
- fork_checkpoint: `checkpoint_563dfaf45cfb8e98483fc511`
- mission: `godseed-mission`
- mission_build: `build_seed_godseed-mission`
- mission_principal: `principal_74069624ce509d464f8b3cae`
- mission_execution: `execution_66a744746a5f27622f5b463a`
- mission_artifact: `artifact_e7f8d0ee6fd665cc785b8609`

## Verified local reuse

HTTP source: `function main(input){return (input+2)*3}`. Declared test: `[{"input":4,"expected":18}]`. Build/tests passed: `true`. Actual output: `18`.

Actual adapter `docker-restricted/1`; image `node:22.14.0-bookworm-slim@sha256:1c18d9ab3af4585870b92e4dbc5cac5a0dc77dd13df1a5905cea89fc720eb05b`. Network none; read-only filesystem plus 16 MiB tmpfs; uid 10001; 128 MiB RAM; 32 PIDs; 0.5 CPU; 5 s timeout; seed 7. Clock/process/files are not deterministic.

Public fork: http://127.0.0.1:8080/p/program_6ea22ff8dea86c69b61f7f47. Public checkpoint discovery: http://127.0.0.1:8080/api/programs/program_6ea22ff8dea86c69b61f7f47/continuity. Anonymous retrieval was checked. Local publish created an immutable release; no external deployment occurred.

## Authority

Original rights under the new self-declared principal: `["read"]`. Fork owner rights permitted build/run/publish/checkpoint; anonymous rights were checked directly. Every mutation used expected_version and payload-bound Idempotency-Key. Original arithmetic version and event-chain head were unchanged.

## God-seed mission

Metadata linked http://127.0.0.1:8080/p/godseed-mission. Published source: `input json | mission.inspect`. Entire program.state was submitted unchanged, digest `sha256:24b1cdecb0acecf1584fbbd16d3708035673a482211c13879a7363dd84ed8421`. The published grant allowed authenticated run, and actual execution/artifact were later re-read.

Recorded completion: `{"status":"NOT_RUN","verified":false}`. Recorded graph: 52 nodes, 65 edges, all NOT_RUN and no node evidence. Seed build tests_passed=true has an empty tests array, so it establishes no full-mission evidence.

Actual inspector output:

```json
{
  "total_nodes": 52,
  "dependency_edges": 65,
  "ready_nodes": [
    "mission"
  ],
  "completed_nodes": [],
  "waiting_nodes": [
    "reconstruction",
    "formal-contract",
    "features",
    "cinematic-design",
    "experiments",
    "infrastructure",
    "work-plan",
    "deliverables",
    "execution",
    "feature-1",
    "feature-2",
    "feature-3",
    "feature-4",
    "feature-5",
    "feature-6",
    "feature-7",
    "feature-8",
    "feature-9",
    "feature-10",
    "feature-11",
    "feature-12",
    "E01",
    "E02",
    "E03",
    "E04",
    "E05",
    "E06",
    "E07",
    "E08",
    "E09",
    "E10",
    "artifact-readme",
    "artifact-architecture",
    "artifact-formal-semantics",
    "artifact-language-spec",
    "artifact-sdk",
    "artifact-nomenclature",
    "artifact-constitution",
    "artifact-security",
    "artifact-deployment",
    "artifact-reconstruction",
    "artifact-migrations",
    "artifact-experiments",
    "artifact-acceptance-json",
    "artifact-program-graph-json",
    "artifact-handoff-json",
    "artifact-playwright-screenshots",
    "artifact-example-purls",
    "artifact-build-hashes",
    "artifact-deployed-url",
    "deployment-amendment"
  ],
  "completion": "NOT_RUN",
  "verified": false,
  "evidence_policy": "Statuses are recorded claims; dependency validation and artifact integrity do not establish requirement truth."
}
```

This output derives from graph statuses; it does not certify completed requirements, deliverables, experiments or deployments. Embedded directive text was treated as data, not additional authorization.

## Checks

- PASS: SDK same origin
- PASS: SDK HTTP 200
- PASS: original immutable release source matches
- PASS: current authority permits program_b539804050cda1c697edbae1/fork
- PASS: fork preserved source and declared tests
- PASS: fork anonymously readable
- PASS: current authority permits program_6ea22ff8dea86c69b61f7f47/build
- PASS: build ran declared test successfully
- PASS: declared build test used restricted Docker
- PASS: current authority permits program_6ea22ff8dea86c69b61f7f47/run
- PASS: actual run succeeded
- PASS: declared input output reproduced
- PASS: actual run used restricted Docker
- PASS: result hash independently matches
- PASS: current authority permits program_6ea22ff8dea86c69b61f7f47/publish
- PASS: immutable release pins verified build
- PASS: mission prior execution artifact still discoverable
- PASS: current authority permits program_6ea22ff8dea86c69b61f7f47/checkpoint
- PASS: checkpoint discoverable anonymously
- PASS: fork event chain internally valid
- PASS: original version and event head unchanged

## Limits

- Identity labels are self-declared. Freshness means this subagent started with only the PURL/task and used new principals; this is not cross-provider or identity attestation.
- Persistence is development-file. No production durability, deployment, external services, or full God-seed product verification was performed.
- Only the published declared arithmetic input was tested; no general correctness or sandbox security audit is claimed.
- Container environment details come from service build/execution artifacts; container internals were not independently inspected.
- Replay validates internal content hashes, not external authenticity. Authored-code replay is artifact-integrity-only with replayable=false.
- Checkpoints explicitly report evidence_verified=false; prose and linked evidence remain author assertions even when the service checks state hashes.
- God-seed inspector executed on the exact published state in a prior attempt within this fresh session; final principal re-read its execution/artifact. Output does not certify full mission completion.
- Two prior collector attempts are preserved: first missed artifacts[] after successful run; second produced build/run/release/checkpoint but assumed fork visibility was public. Tokens were discarded, not expired or revoked.
- Final fork explicitly requested public visibility and was verified anonymously before build and after checkpoint; original arithmetic version/history remained unchanged.
- All mutations used current manifest permissions, expected_version and payload-bound Idempotency-Key. Mission run added a local execution event, not a completion-status update.

Sanitized HTTP request/response evidence, original release, exact environment records and both prior attempts are in report.json.
