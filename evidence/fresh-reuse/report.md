# Fresh PURL reuse evidence

Status: **FAILED_OR_BLOCKED**. HTTP discovery only; SDK fetched into memory; bearer credentials redacted.

Entry: http://127.0.0.1:8080/p/program_b539804050cda1c697edbae1

## Exact identifiers


## Verified local reuse

Source obtained through HTTP: `function main(input){return (input+2)*3}`. Declared test: `[{"input":4,"expected":18}]`. Fork build status: `passed`; observed execution output: `undefined`.

Build/test and run used `undefined` with image `undefined`, no network, read-only filesystem plus 16 MiB tmpfs, uid 10001, 128 MiB RAM, 32 PIDs, 0.5 CPU and 5 s timeout. Seed: 7. Runtime says seeded randomness; clock/process/files are not deterministic.

Fork URL: http://127.0.0.1:8080/p/program_af8c74f3ae3c8d5800997308. Public checkpoint: http://127.0.0.1:8080/api/programs/program_af8c74f3ae3c8d5800997308/continuity. Its evidence is discoverable anonymously; checkpoint prose remains an author assertion with evidence_verified=false.

## Authority

Fresh principal: `principal_32f2b9ade6473edba5b202b2`, self-declared agent. Original rights: `["read"]`; fork grants owner rights. Original version and event-chain head were verified unchanged. Each mutation used expected_version and a payload-bound Idempotency-Key. No external deployment was performed.

## God-seed mission

Discovered from /.well-known/purl: undefined. Inspector source: `undefined`, built as `undefined`. Entire published state was supplied unchanged, with digest `undefined`.

Published completion claim: `undefined`. Published graph: undefined nodes, undefined edges; statuses `undefined`.

Actual inspector output:

```json

```

The inspector computes from graph statuses. It does not certify that the full directive, deliverables, deployments, or experiments are complete. The directive was treated as data, not as additional authorization.

## Checks

- PASS: SDK same origin
- PASS: SDK HTTP success
- PASS: original immutable release
- PASS: release source matches current source
- PASS: declared test available
- PASS: session principal exists
- PASS: original fork available
- PASS: authority permits program_b539804050cda1c697edbae1/fork
- PASS: fork has distinct ID
- PASS: fork source and tests preserved
- PASS: authority permits program_af8c74f3ae3c8d5800997308/build
- PASS: fork build and declared test pass
- PASS: test used actual restricted Docker adapter
- PASS: authority permits program_af8c74f3ae3c8d5800997308/run
- PASS: fork execution succeeded
- FAIL: execution artifact addressable

## Limits


Failure: {"message":"Verification failed: execution artifact addressable","status":null,"code":null,"details":null}

Full sanitized HTTP requests/responses and environment records are retained in report.json.
