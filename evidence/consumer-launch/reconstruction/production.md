# Production preservation baseline — 2026-10-18

Read-only reconnaissance completed before consumer changes. No deployments, restarts, configuration changes, SQL writes, private document bodies, principal records, token hashes or secret values were read or performed. Structured details and fingerprints are in `production.json`; public GET receipts and bodies are in `production-public-sanitized.json`.

## Current production

Railway project `7b6d6969-ebfe-4823-ac60-6370fb068458` (`purl-godseed`), production environment `eaa160f9-ab30-4dee-8fd5-9a6524eb7ee2` has two live services, one running replica each in `iad`. No staged/applying work, volumes, Railway buckets, custom domains or TCP proxies are present. Tracing and auto-instrumentation are off. Current replicas have no warnings/critical alerts; one failed initial deployment per service remains in 24-hour history.

| Service | Current successful deployment | Start command | Public routing |
| --- | --- | --- | --- |
| `purl-api` `5ed93f79-e12c-4cb6-a835-b3158e8da5af` | `69cdb20a-69eb-4245-9d26-d347e5080a00` | `node service/main.js` | `https://purl-api-production.up.railway.app`, port 3000 |
| `purl-worker` `063e5f3b-9953-44d2-b479-84dab49bb7f1` | `b5e7671e-115f-48f2-9b78-d3fe6586c0db` | `node service/worker.js` | None |

Both use `Dockerfile`, Dockerfile builder/V3 build environment, V2 runtime, maximum three restart retries. API healthcheck `/healthz`, timeout 120 seconds. Railway manages the existing public hostname and TLS.

Shared variable **names**: `HOST`, `NODE_ENV`, `PORT`, `PURL_BASE_URL`, `PURL_DOCUMENT_ID`, `PURL_PERSISTENCE`, `PURL_SANDBOX_ENABLED`, `PURL_SANDBOX_VERIFIED`, `SUPABASE_ARTIFACT_BUCKET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`. Both services also define `PURL_ROLE`; worker additionally defines `PURL_WORKER_POLL_MS`. Values were not requested.

Railway MCP reads succeed. The authenticated CLI is `/tmp/purl-railway-cli/railway`, version 5.70.0; `whoami --json` succeeded. It is absent from PATH, so an initial bare-command failure did not indicate missing credentials. Deployment was not attempted. Repository source is null for both services; prior evidence confirms direct CLI upload, so a Git commit alone does not deploy production.

## Durable data and access

Supabase `frxufmwwbegconolevkw` (`itachis-corner`) is `ACTIVE_HEALTHY`, Postgres 17.11, `eu-central-1`. This is a shared existing project and unrelated resources must remain intact. Legacy PURL tables are in `public`, not a `purl` schema.

`godseed-v3-production`: revision **70**, updated `2026-10-18T15:25:45.909805Z`, JSON text size **5,462,714 bytes**, SQL `md5(data::text)` **`4d8b98fcf8a4d6bf0a6aed1cb60d6fcd`**. The same revision, timestamp, size and fingerprint were returned after all initial GET inspection. No document body was retrieved.

| Preserved projection | Count |
| --- | ---: |
| Programs | 12 |
| Principals | 7 |
| Executions | 8 |
| Artifacts | 8 |
| Audit rows | 56 |
| Private Storage objects | 9 |

Entity aggregate fingerprint `24caecb1fa94dc3f14fe753b0f9224a6`; audit aggregate fingerprint `395ad51d4ef60ed7160849681fcdfb03`; Storage metadata fingerprint `e0c0c6a3c0caecc2d282394407e85376`. Algorithms/order are described by the reconstruction SQL and structured output; these MD5 values are preservation comparison checks, not security signatures.

All three PURL tables have RLS enabled. `anon` and `authenticated` have no effective SELECT/INSERT/UPDATE/DELETE privileges on them. `purl_read_document` and `purl_compare_and_swap` are invoker functions whose execute ACL contains only `postgres` and `service_role`. The private `purl-artifacts` bucket has `public=false`, 50 MiB per-object limit, and four **RESTRICTIVE** policies excluding that bucket for anon/authenticated SELECT/INSERT/UPDATE/DELETE. No private bytes were fetched. Existing other-bucket policies remain unrelated preservation boundaries.

Hosted migrations: `20261018013721 evidence_first_foundation`, `20261018014553 evidence_query_performance`, `20261018144237 purl_godseed_durable_repository`, `20261018152346 purl_skip_unchanged_projection_writes`. Local migration filename timestamps differ from hosted versions; match names and content, not filenames alone. Seven legacy PURL indexes cover primary keys, owner, program visibility, execution status and GIN JSON data.

## Public behavior and continuation

`/healthz` and `/.well-known/purl` return 200 and PURL/0.2 with Supabase persistence. Runtime reports Node 22.14.0/x64 and `sandbox_enabled=false`. `/api/auth/config` returns `available:false`, and discovery reports `verified_human_accounts:false`. Existing guests and AI labels are self-declared; this is not consumer OIDC SSO. GET `/api/auth/session` returns 404 because that endpoint is POST-only; no POST was attempted. Correct discovery path is `/.well-known/purl`; the guessed `.json` suffix returns 404.

The public catalog currently has **six technical templates**, **71 operator descriptors**, and **68 available pure operators**. `network.fetch`, `artifact.write` and `state.commit` are explicitly unavailable without approved adapters. These counts do not establish 40–60 differentiated consumer experiences.

Existing continuation: <https://purl-api-production.up.railway.app/p/program_ad56405463bfaa72e9bbddf2>, version 6, public, source `input json | mission.inspect`. Anonymous readers receive inspect/history/continuity/replay/diff rights only; manifest mutations require authenticated authority. Public replay returns `valid=true` and the recorded execution replay is valid.

Preserve build `build_9de64a19ba21e977fce4c9f2`, release `release_b6b37a667a51bd6724156430`, execution `execution_a0a362996c4a1c6bf7685c21` and checkpoint `checkpoint_e6bb9be7402ae4de632e47a2`.

The embedded directive is the **previous service/IDE God Seed**, with 52 nodes and 65 edges. Every graph node is `NOT_RUN`; completion `NOT_RUN`, verified false, checkpoint evidence_verified false. It does not contain the new consumer PURLs × CGIT mission files. Keep the old artifact and create a separately versioned/forked consumer mission. Hash/replay consistency does not verify requirement truth.

## Performance and stale assumptions

Railway's last-24-hour data contains one traffic bucket: 399 requests, one 5xx (0.2506%), ten 4xx; latency p50 **983 ms**, p90 **4417 ms**, p95 **6765 ms**, p99 **11079 ms**. Current safe public metadata/program probes mostly took 0.9–1.7 seconds; runtime/auth-config routes about 0.3 seconds. API last-hour memory averages 0.161 GB and CPU 0.00067; worker averages 0.127 GB and CPU 0.00237. This is observed traffic, not a controlled benchmark.

Source inspection shows domain reads load the entire CAS document through `purl_read_document` (`service/domain.js:149`, `service/repository.js:207`). With the 5.46 MB document and API/DB in different regions, this is a plausible bottleneck that needs profiling before consumer scaling. Low resource use does not establish adequate latency.

Prior local `ACCEPTANCE.json`/`handoff.json` distinguish runtime revision `0670baddefba9635af8fc71c3b96c85960227315`, later delivery revision `2ca63233cedcbce427da89bc5ee82a190a7b9687`, and runtime image `sha256:f464b235bbc0e788223ba6eaad6281d34197364ea19977fc35c561109a5d0ea0`. Current Railway deployment IDs match those records, but Railway has no commit hash that independently attests the source revision. Historical 197/197 tests, 57/57 recovery and 34/34 handoff checks retain their original scope; they do not satisfy current consumer launch acceptance. Prior database-upgrade revision 63 is superseded by the revision-70 baseline after later authorized work.

## Oracle inventory readiness

Authenticated Gateway `list_servers(limit=50)` returned `servers: []`, `nextCursor: null`. Therefore no owned target exists for server auth-status or uname/CPU/RAM/Docker inventory. Oracle inventory is **BLOCKED_NO_OWNED_GATEWAY_TARGET** for this connector. No host was guessed, registered, modified, cleared or restarted.

## Rollout preservation constraints

Use additive isolated consumer resources in the shared database; preserve the current CAS tables, grants, private bucket, immutable objects, existing continuation and public hostname. Keep arbitrary authored execution disabled until independent isolation validation. Prepare and test rollback before changing live services. Existing deployment access is ready for a direct CLI upload, but no rollout was tested in this reconnaissance.
