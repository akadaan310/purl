# Scoped store independent review

Verdict: **PASS WITH NITS** for the frozen store scope. No critical or important security/spec defect found in the reviewed CAS, tenant separation, handle reservation, access-control, quota, or erasure paths. One low-priority validation defect is reproducible. Hosted schema/deployment readiness is not established by this review; the additive migration remains unapplied remotely.

Reviewed requirements: `docs/consumer-launch/tasks/01-store-brief.md`, `01-store-report.md`, and the shared interface in `docs/superpowers/specs/2026-10-18-consumer-launch-design.md`. Reviewed implementation: `service/launch/store.js`, migration `20261018163930_purl_launch_scoped_store.sql`, both `deploy/verify-launch-store` files, `test/launch/store.test.js`, and preserved GREEN logs. Read `service/repository.js` to verify the reused file transaction behavior. Applied the code-review and Supabase security skill guidance within the explicit read-only/no-network scope.

## Finding

**P3 — Validate Unicode consistently in read selection options.** `service/launch/store.js:54`–`:57` checks prefix length/control characters and status length, but does not apply `validUnicode`; status values do not reject NUL either. `scan({prefix:'\ud800'})`, `scan({statuses:['\u0000']})`, and `scan({statuses:['\ud800']})` succeed with `[]` in memory and reach the RPC transport in the Supabase adapter. PostgreSQL cannot represent NUL or an unpaired surrogate in its text/JSON conversion, so these are not portable supported inputs. Depending on PostgREST error mapping, invalid user input is reported as persistence unavailable rather than the normal `400 invalid_input`. This does not bypass tenant authorization or mutate data. Add `validUnicode` to prefix/status validation, and verify rejection before fetch for those inputs.

Concrete proof: a fresh `node --input-type=module` probe imported the unchanged adapters, used a stub fetch returning `[]`, and printed:

```json
{"name":"surrogate-prefix","memoryResult":[],"sentToRpc":{"p_prefix":"\ud800","p_statuses":null,"p_limit":200}}
{"name":"nul-status","memoryResult":[],"sentToRpc":{"p_prefix":"","p_statuses":["\u0000"],"p_limit":200}}
{"name":"surrogate-status","memoryResult":[],"sentToRpc":{"p_prefix":"","p_statuses":["\ud800"],"p_limit":200}}
```

The probe made no network request. The PostgreSQL-side rejection is inferred from its supported text/JSON encoding; no new live PostgreSQL execution is claimed.

## Security and specification evidence

- **CAS and idempotency PASS.** SQL lines137–158 acquire a per-scope advisory transaction lock before scope creation, lock the scope row, check replay data before stale versions, and check every changed record before writing. The entire function executes inside the caller transaction, so failures after handle/record writes also roll back. JS `prepare` independently hashes normalized changes and handle; SQL hashes the actual JSON payload independently of the caller hash. Retry keys are indexed by `(scope,key)`. Exact retries preserve their original result. Memory commits swap a cloned candidate only after success; file commits run inside the existing exclusive lock and durable atomic rename.
- **Handle collision/aliases PASS.** SQL lines159–166 combine pre-checks with the unique name constraint and conditional conflict update, covering concurrent first claims by different scopes. Aliases retain the same immutable scope and resolve the current canonical name. Failed claims do not leave scope or record writes. No raw SQL interpolates caller-provided scope/key/prefix/handle values.
- **Public access and tenant boundaries PASS.** All four tables enable RLS (SQL205–208), revoke privileges from PUBLIC/anon/authenticated (209), and explicitly grant backend privileges to service_role (210–214). Functions are invoker functions with empty search paths; the end-of-migration ACL loop removes default public EXECUTE and grants service_role. Read/list use scope predicates; idempotency and primary keys include scope. Global scan is deliberately a trusted-backend API. The store is not an end-user authentication boundary; callers must derive scopes from authenticated principals.
- **Bounds and byte accounting PASS within documented contract.** Both adapters enforce 32 changes, 256KiB compact row JSON, 10MiB active tenant JSON, 200 returned records, 4096 records including tombstones, 1024 aliases, and 1024/2MiB replay metadata. SQL validates these independently, with counts updated under the scope lock. Numeric expansion in `decimalNumber` matches the intent of jsonb compact numeric accounting. Active quota decreases for tombstones while tombstone versions remain CAS-visible. Private upstream errors are sanitized.
- **Erasure/privacy PASS.** SQL erase takes the same per-scope advisory lock as commit and removes the parent scope; all three child tables have `ON DELETE CASCADE`. The local implementation deletes records/replays with the scope and removes every owned alias. No identifying anti-reuse record is retained here. The report correctly documents released handle reuse. Authorization revocation and preventing fresh writes after account deletion are domain-layer responsibilities; erase itself is a serialized delete, not a permanent namespace ban.
- **Legacy preservation PASS by static scope.** The new migration creates only new launch objects and changes privileges only on launch functions/tables. The file adapter defaults to a separate `launch.json`. No reviewed store path accesses the legacy Supabase document. This review performed no hosted read/write, migration, implementation edit, or commit.

## Performance and global-cap limits

No global tenant-count ceiling or single shared quota is implemented in this store: limits are per scope, and SQL locks serialize only the same scope (or an advisory hash collision). Thus one tenant filling its quota does not exhaust a global store counter. Total system admission limits, per-principal namespace creation controls, and worker fairness require the surrounding services; the store intentionally trusts its backend caller. This is a documented integration boundary, not a discovered authorization bypass.

The queue index requirement is implemented with the generated status column and `(status,key text_pattern_ops,scope)` index. However, the verification SQL lines53–54 explains simplified `SELECT key` statements with sequential scans disabled. It omits the real RPC's returned value, `ORDER BY scope COLLATE "C", key COLLATE "C"`, and LIMIT. The available index does not directly provide that requested global order, so the complete scan can examine/sort an unbounded number of matching jobs before returning 200. Existing evidence proves usable predicate indexes, not bounded end-to-end queue latency under a large backlog. A representative full-query plan/load check would strengthen operational confidence; no latency threshold or bounded-work guarantee is specified, so this is not classified as a failing requirement.

## Verification limits and disposition

Inspected existing evidence without rerunning covered suites:

- `evidence/consumer-launch/01-store/unit-green.log`: 18 tests, 18 pass, 0 fail/skip.
- `evidence/consumer-launch/01-store/sql-green.log`: 22 tests, 22 pass, 0 fail/skip, plus SQL rollback/quotas/role assertions and the genuine database restart message.
- The local harness uses digest-pinned PostgreSQL17.7/PostgREST13.0.4, a disposable network, loopback-only gateway, and cleanup trap. Its restart reads a committed service-role row after restarting the database process.

Only the small selection-validation probe above was newly executed. No full suite, network access, migration, production operation, implementation change, or commit was performed. The store is suitable to proceed to integration review with the P3 correction tracked and the full queue-plan limitation understood.
