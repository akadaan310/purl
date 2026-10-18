# Task01 report

Status: DONE

## Delivered files

- `service/launch/store.js`
- CLI-generated `supabase/migrations/20261018163930_purl_launch_scoped_store.sql`
- `deploy/verify-launch-store.sh`, `deploy/verify-launch-store.sql`
- `test/launch/store.test.js`
- `evidence/consumer-launch/01-store/*`

No commits, remote migrations, external writes, dependency changes, legacy document changes or peer-file edits were performed by this task. Root owns full-suite integration and deployment.

## Shared API and configuration

Exports `MemoryLaunchStore()`, `FileLaunchStore(path='./.purl/launch.json', options={})`, `SupabaseLaunchStore({url, serviceRoleKey, fetch=globalThis.fetch, timeoutMs=15000})`, `createLaunchStore(env=process.env)`.

Factory: `PURL_LAUNCH_PERSISTENCE=memory|file|supabase`; `PURL_LAUNCH_FILE` overrides the development file. Production defaults to Supabase and rejects memory/file. Supabase requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. File persistence uses the existing file repository's exclusive process-aware lock, atomic synced rename and private file permissions in a separate launch-only document; it never accesses the legacy persistence file.

Async methods match the shared contract: `read(scope,key)`, `list(scope,{prefix='',limit=200})`, `scan({prefix='',statuses,limit=200})`, `commit(scope,changes,{idempotencyKey,payloadHash,handle:{name}})`, `resolveHandle(name)`, `erase(scope)`. `commit` returns `{revision,records,duplicate}`; revision is per scope. Missing reads return null; tombstones return `{key,version,value:null}` and remain CAS-visible. Lists/scans exclude tombstones. Handle names are lowercase alphanumeric/hyphen, 1–63 characters, with alphanumeric ends.

Idempotency keys and payload hashes must be paired. Stored caller hash plus an independently computed payload fingerprint bind the exact normalized changes, expected versions and handle reservation. A successful retry returns its original result with `duplicate:true`, even after later writes. Mismatches and optimistic CAS/handle conflicts reject the entire operation with status409.

## Authority, bounds and SQL

All `purl_launch_*` functions are SECURITY INVOKER with an empty search path, revoked from PUBLIC/anon/authenticated and explicitly granted to service_role. All four new tables have RLS enabled, service-role-only policies and explicit grants. The service role is trusted backend authority: domain services must derive scope from authenticated internal principal IDs; this adapter does not authenticate end users or authorize caller-selected scopes.

Tables:

- `purl_launch_scopes`: `scope`, `revision`, `active_bytes`, `canonical_handle`, `record_count`, `handle_count`, `idempotency_count`, `retry_bytes`.
- `purl_launch_records`: `scope`, `key`, `version`, `value`, `active_bytes`, generated bounded `status`.
- `purl_launch_handles`: `name`, `scope`.
- `purl_launch_idempotency`: `scope`, `key`, `payload_hash`, `fingerprint`, `result`, `metadata_bytes`.

RPCs: `purl_launch_read(p_scope,p_key)`, `purl_launch_list(p_scope,p_prefix,p_limit)`, `purl_launch_scan(p_prefix,p_statuses,p_limit)`, `purl_launch_commit(p_scope,p_changes,p_idempotency_key,p_payload_hash,p_handle)`, `purl_launch_resolve_handle(p_handle)`, `purl_launch_erase(p_scope)`.

Per-scope advisory transaction locks include absent scopes and erasure; tenant row locks and unique handle reservations make multi-record CAS, handle claims, quota accounting and retry recording atomic. Hash collisions only serialize unrelated scopes. No global JSON document is rewritten in production. Prefix/status indexes are demonstrated by real index-only EXPLAIN plans. List/scan force custom SQL plans so current prefix/status parameters remain available to the planner. Queue status projection indexes strings up to64 bytes; arbitrary larger user `value.status` strings remain valid data and are not indexed as queue states.

Enforced in local adapters and SQL:

- 256KiB compact JSON per row; 10MiB active row JSON per scope.
- 32 changes per commit; 200 results per read list/scan.
- 4096 records including tombstones; 1024 retained handle aliases per scope.
- 1024 idempotency entries and 2MiB retry metadata per scope. Metadata includes key, payload hash, fixed-size fingerprint and full replay result. No silent pruning.
- Nonempty bounded scope/key/retry identifiers; finite plain JSON, no prototype keys, accessors, symbols, cycles, malformed Unicode or NUL; JSON nesting bounded to64. JSON byte accounting matches compact PostgreSQL JSON numeric expansion, including exponent-form JavaScript numbers.

Overflow rejects atomically with status413 and code `row_limit`, `tenant_quota` or `metadata_quota`. Invalid input has status400/code `invalid_input`. SQL/transport failures expose sanitized status503/code `store_unavailable`; configuration errors use `store_configuration`. No upstream private response body or credential appears in errors.

## Verification evidence

Commands:

1. `node --test test/launch/store.test.js` — 18/18 PASS, zero skips; final local memory/file and validation checks; see `unit-green.log`.
2. `./deploy/verify-launch-store.sh` — 22/22 PASS, zero skips, plus direct SQL/role/restart checks; disposable pinned PostgreSQL17.7 and PostgREST13.0.4, all additive migrations, direct SQL checks, real database restart, adapter tests and HTTP role-denial checks; see `sql-green.log`.
3. `node --check service/launch/store.js` and `sh -n deploy/verify-launch-store.sh` — syntax checks.

Exact test results are preserved at the end of the two GREEN logs. The local harness creates only disposable Docker resources, uses cached digest-pinned images, publishes its gateway only on loopback and cleans up containers/network. It does not contact Supabase or apply hosted migrations.

Preserved RED baselines: `unit-red.log` (missing exports); `sql-red.log` (missing SQL read function before migration); `json-hardening-red.log` (prototype-shaped dictionary keys and invalid JSON); `metadata-red.log` (unbounded tombstones and retry metadata); `status-index-red.log` (real PostgREST500 from oversized btree status); `numeric-accounting-red.log` (exponent numeric row-size bypass); `upstream-red.log` (unsanitized configuration failure).

SQL checks cover direct server-side byte/batch/count quotas, exact-limit active data and quota release by tombstone, all-or-nothing CAS, handle conflicts without orphaned scopes, payload-bound retries, literal wildcard prefix handling, cross-scope status scans, transaction rollback, tombstone versions, aliases, explicit role denials, grants/RLS/invoker inspection, and persisted reads after a real PostgreSQL process restart. SQL fixtures verify metadata ceilings without thousands of network calls. Node contract tests use real concurrent competing CAS and handle claims through PostgREST.

## Integration and privacy limits

Apply the additive migration before configuring production launch services, then run root's full integration suite and hosted read-back/smoke checks. Those operations remain root-owned. Neither hosted Supabase verification nor production deployment is claimed here.

`erase(scope)` removes all owned records, tombstones, retry history and handles/aliases. No identifying anti-reuse tombstone is retained. Deleted handles can therefore be claimed by another principal later. Durable identity links must pin the immutable principal ID; handle aliases retain identity only while that principal's data remains present. A deleted principal's stable URL should return404, as root specified. Development file persistence is single-host only; production uses SQL.
