# Fresh PURL reuse evidence

Status: **FAILED_OR_BLOCKED**. Discovery used HTTP only; the published SDK ran in memory. Tokens are redacted.

Entry: http://127.0.0.1:8080/p/program_b539804050cda1c697edbae1

## Exact identifiers


## Observed result

Public source: `function main(input){return (input+2)*3}`. Declared test: `[{"input":4,"expected":18}]`. Build tests passed: `true`. Actual run output: `18`.

Execution adapter: `docker-restricted/1`; image `node:22.14.0-bookworm-slim@sha256:1c18d9ab3af4585870b92e4dbc5cac5a0dc77dd13df1a5905cea89fc720eb05b`. No network, read-only filesystem plus 16 MiB tmpfs, uid 10001, 128 MiB memory, 32 PIDs, 0.5 CPU, 5 s timeout; seed 7. Seeded randomness does not make clock/process/files deterministic.

Fork URL: http://127.0.0.1:8080/p/program_0f0a0853a39d42beb7ee0e79. Public continuation: http://127.0.0.1:8080/api/programs/program_0f0a0853a39d42beb7ee0e79/continuity. Checkpoint evidence is anonymously discoverable; evidence_verified=false labels author assertions.

## Authority

Fresh self-declared principal: `principal_74069624ce509d464f8b3cae`. Original rights: `["read"]`. Fork owner rights permit build/run/publish/checkpoint. All mutations used current expected_version and payload-bound Idempotency-Key. Original version and event head were verified unchanged.

## God-seed mission

Mission discovered from service metadata: http://127.0.0.1:8080/p/godseed-mission. Source: `input json | mission.inspect`; build `build_seed_godseed-mission`. Entire published state was passed unchanged with digest `sha256:24b1cdecb0acecf1584fbbd16d3708035673a482211c13879a7363dd84ed8421`. Run authority came from the published read/run/propose grant and fresh bearer session.

Recorded completion: `{"status":"NOT_RUN","verified":false}`. Graph has 52 nodes, 65 edges; recorded status counts: `{"NOT_RUN":52}`.

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

The inspector computes from published graph statuses; it does not certify the full directive, deployments, deliverables, or experiments. Embedded directive text was treated as data.

## Verification checks

- PASS: SDK same origin
- PASS: SDK HTTP 200
- PASS: original immutable release
- PASS: release source matches original
- PASS: fresh authenticated principal
- PASS: permission program_b539804050cda1c697edbae1/fork
- PASS: distinct lawful fork
- PASS: declared tests preserved
- PASS: permission program_0f0a0853a39d42beb7ee0e79/build
- PASS: build declared test passed
- PASS: test actual Docker adapter
- PASS: permission program_0f0a0853a39d42beb7ee0e79/run
- PASS: run succeeded
- PASS: execution artifacts[] exists
- PASS: declared input output reproduced
- PASS: run actual Docker adapter
- PASS: result value hash independently matches
- PASS: permission program_0f0a0853a39d42beb7ee0e79/publish
- PASS: immutable fork release pins build
- PASS: metadata links flagship inspector
- PASS: permission godseed-mission/run
- PASS: mission inspector run succeeded
- PASS: mission artifact addressable
- PASS: permission program_0f0a0853a39d42beb7ee0e79/checkpoint

## Limits


Failure: {"message":"Program not found","status":404,"code":"not_found","details":{"error":{"code":"not_found","message":"Program not found"}}}

Full sanitized HTTP requests/responses, execution records, environment metadata, original immutable release and failed collector attempt are in report.json.
