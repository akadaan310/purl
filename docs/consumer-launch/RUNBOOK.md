# Consumer launch operations

PURLs and CGIT Hub use separate API/BFF processes and one worker, sharing the scoped Supabase launch store in production. Existing legacy API/worker services and their authoritative revision-70 document remain separate. This runbook describes the new `service/launch/*` runtime. Allocated services are not proof of deployment: use root’s current deployment evidence for terminal SUCCESS and public verification.

## Local Docker preview

Docker Compose v2 is required. The root Dockerfile pins Node by digest, installs integrity-pinned vendored production packages offline, and runs as the `node` user. Compose builds the same `purl-consumer:local` image for all three services; Docker reuses its build cache. Essential local data lives in the named volume mounted at the image’s node-owned `/app/.purl` directory.

```sh
cp deploy/launch.env.example .env.launch
chmod 600 .env.launch
node --input-type=module -e 'import {randomBytes} from "node:crypto"; import {readFileSync,writeFileSync} from "node:fs"; const p=".env.launch"; writeFileSync(p,readFileSync(p,"utf8").replace(/^PURL_IDENTITY_ENCRYPTION_KEY=$/m,"PURL_IDENTITY_ENCRYPTION_KEY="+randomBytes(32).toString("base64")),{mode:0o600});'
docker compose --env-file .env.launch -f compose.launch.yaml config --quiet
docker compose --env-file .env.launch -f compose.launch.yaml up --build -d --wait
```

Open PURLs at `http://localhost:8180` and CGIT Hub at `http://localhost:8181`. Both APIs listen on container port 3000; the worker exposes no port. These are loopback-bound development origins with `NODE_ENV=development`, `PURL_IDENTITY_ALLOW_HTTP=true`, and `PURL_LAUNCH_FILE=/app/.purl/consumer.json`. OIDC is unconfigured by default, so verified login reports its setup blocker while unverified previews and deterministic tools work. Hosted inference is disabled.

Check health and restart persistence:

```sh
curl --fail http://localhost:8180/healthz
curl --fail http://localhost:8181/healthz
docker compose --env-file .env.launch -f compose.launch.yaml exec -T worker node deploy/healthcheck.js
docker compose --env-file .env.launch -f compose.launch.yaml ps
```

Create a private fact or a native resource in the preview UI, record its ID and save its export. Then restart all three services and verify that the same object and version still load:

```sh
docker compose --env-file .env.launch -f compose.launch.yaml restart
docker compose --env-file .env.launch -f compose.launch.yaml exec -T purls node deploy/healthcheck.js
docker compose --env-file .env.launch -f compose.launch.yaml exec -T cgit node deploy/healthcheck.js
docker compose --env-file .env.launch -f compose.launch.yaml exec -T worker node deploy/healthcheck.js
```

Restart does not renew a guest credential’s 30-minute expiry. Verify promptly with the same browser session; a new preview creates a different principal. Ordinary `down` retains the named volume; `down --volumes` deletes it. Preserve the original encryption key with the volume backup. Do not rerun key generation over an existing data set. A file store is a single-host development adapter, not a production or cross-host synchronization mechanism.

## Production configuration

Prefer the same reviewed image digest/revision for both APIs and the worker. At this checkpoint the APIs use `367e8ed` and the worker uses `3b2784b7`: the later changes affect API discovery and SDK CSRF handling, while worker execution is unchanged. Preserve these actual revision distinctions in deployment records. Configure secrets through Railway shared variables and service references; never put service-role keys, OAuth secrets or model keys in source, browser code, CLI output or public URLs. Production has no essential container file state and **must** use `PURL_LAUNCH_PERSISTENCE=supabase`. It rejects file/memory persistence with `NODE_ENV=production`.

Allocation (deployment status must be checked separately): project `7b6d6969-ebfe-4823-ac60-6370fb068458`, environment `eaa160f9-ab30-4dee-8fd5-9a6524eb7ee2`.

| Service | Allocated ID prefix | Command | Public origin |
| --- | --- | --- | --- |
| PURLs API | `04d207` | `node service/launch/main.js` | `https://purls-production.up.railway.app` |
| CGIT Hub API | `aef964` | `node service/launch/main.js` | `https://cgit-hub-production.up.railway.app` |
| Worker | `ec5d3` | `node service/launch/worker-main.js` | None |

| Environment name | Production setting |
| --- | --- |
| `NODE_ENV` | `production` on all three |
| `PURL_LAUNCH_PERSISTENCE` | `supabase` on all three |
| `SUPABASE_URL` | Existing authoritative project’s HTTPS origin |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only shared secret, all three; never a browser key |
| `PURL_IDENTITY_ENCRYPTION_KEY` | Same private canonical base64 encoding of 32 bytes on all three |
| `MODEL_ENCRYPTION_KEY` | Optional independent 32-byte base64 secret, shared with workers; application otherwise uses identity key |
| `PURL_PRODUCT` | `purls` for PURLs and worker; `cgit` for CGIT |
| `PURL_ROLE` | `api` for both APIs; `worker` for worker health checks |
| `HOST`, `PORT` | `0.0.0.0` and Railway’s injected API port |
| `PURL_BASE_URL` | Exact current API origin; worker uses PURLs origin |
| `PURLS_BASE_URL`, `CGIT_BASE_URL` | Both exact public origins on all three |
| `PURL_OIDC_ISSUER` | Trusted enabled issuer, e.g. `https://<project-ref>.supabase.co/auth/v1` |
| `PURL_OIDC_CLIENT_ID`, `PURL_OIDC_CLIENT_SECRET` | Current API’s separate confidential product client; worker uses PURLs pair |
| `PURLS_OIDC_CLIENT_ID`, `PURLS_OIDC_CLIENT_SECRET` | PURLs pair, also available for cross-product worker validation |
| `CGIT_OIDC_CLIENT_ID`, `CGIT_OIDC_CLIENT_SECRET` | CGIT pair, also available for cross-product worker validation |
| `SUPABASE_PUBLISHABLE_KEY` | Provider user-auth publishable key, never the service-role key |
| `SUPABASE_AUTH_REDIRECT_ALLOWLIST` | Exact existing consent origin plus `/oauth/consent`, comma-separated or JSON array |
| `PURL_OIDC_RECOVERY_URL` | Optional existing provider-owned HTTPS recovery page on the issuer origin |
| `PURL_WORKER_HEARTBEAT_FILE` | `/tmp/purl-launch-worker.json` on worker |
| `PURL_WORKER_HEALTH_MAX_AGE_MS` | Optional heartbeat age; default 120000 |
| `PURL_WORKER_POLL_MS`, `PURL_WORKER_ID` | Optional poll milliseconds and unique worker name; generated ID default |
| `PURL_SOURCE_REVISION` | Reviewed source revision for runtime discovery |
| `PURL_GITHUB_READ_TOKEN` | Optional server-only token for bounded public GitHub reads |

`PURL_IDENTITY_ALLOW_HTTP` must be absent/false in production. `PURL_PERSISTENCE`, `PURL_DATA_FILE`, `PURL_JOB_LEASE_MS` and the legacy Oracle Compose file do not configure this launch runtime. New worker leases are currently fixed by its entrypoint: 30 seconds for native jobs, 120 seconds for Constellations.

Apply only the reviewed additive launch migration after disposable PostgreSQL/PostgREST checks. Preserve old migrations, default branches, legacy deployments and existing Auth settings. API Railway health path is `/healthz`; worker health is `node deploy/healthcheck.js` using the explicit heartbeat path. Readiness requires the actual deployed revision, terminal Railway SUCCESS, both public health/discovery endpoints, authenticated owner isolation and durable queued execution across restart.

## Verified login and provider setup blocker

The recorded production discovery probe returned `feature_disabled`: Supabase OAuth server disabled. Real verified login, signup verification email, recovery delivery and SSO remain blocked until authorized provider setup and end-to-end checks succeed. A passing health route or guest session does not establish human identity.

Preserve the existing Supabase Auth **Site URL**. Host/proxy the central consent frontend at that existing Site URL’s `/oauth/consent`; do not change a shared default to one of the new products. Set the provider authorization path to `/oauth/consent` only through an explicitly approved provider setup. Register separate confidential code/S256 clients with exact redirects:

- PURLs: `https://purls-production.up.railway.app/auth/callback`
- CGIT Hub: `https://cgit-hub-production.up.railway.app/auth/callback`

Local clients, if separately registered, use `http://localhost:8180/auth/callback` and `http://localhost:8181/auth/callback`. Product client IDs/secrets remain distinct. The central host needs both configured product client IDs and exact product origins. Its adapter origin must match its browser Origin/CSRF and email redirect bindings; proxying the static page alone does not establish a working central consent deployment. This hosting/binding remains part of the provider setup blocker; each product BFF still independently verifies state, nonce, PKCE, issuer, audience and live verified UserInfo. Add only the exact existing consent URL to both the provider’s email redirect allowlist and `SUPABASE_AUTH_REDIRECT_ALLOWLIST`; the environment declaration does not configure the hosted provider.

Test verified email delivery, real callback success, separate product consent, revocation, recovery UI and return flow with authorized accounts. The provider authorization-details API can reuse an existing grant and implicitly approve upstream; this adapter rejects redirect-only implicit approval locally, but cannot undo an upstream decision. Strict fresh consent remains a documented provider dependency. See the identity and provider-consent task reports before enabling production login.

## Worker relocation to Oracle or another Docker host

The consumer adapter is oracle-launch-worker.compose.yaml: `https://raw.githubusercontent.com/akadaan310/purl/codex/purls-cgit-consumer/deploy/oracle-launch-worker.compose.yaml`. Validate with `docker compose --env-file /protected/launch-worker.env -f deploy/oracle-launch-worker.compose.yaml config --quiet`, then start with the same command plus `up -d`. It requires an immutable image digest, the existing Supabase authority and encryption key, publishes no ports, and has no essential volume. No Oracle server is currently connected, so target execution has not been tested. The pinned Node base index includes ARM64, but actual ARM execution and complete trace replay across architectures remain unverified. Keep a matching replay environment for historical traces; a worker relocation alone does not establish cross-architecture trace equality.

Use a pushed release `image@sha256:<digest>`, the same reviewed new worker command, and the same authoritative Supabase project and shared encryption/OIDC settings. Supply secrets through the target host’s protected secret mechanism. Run non-root with a read-only root filesystem, writable `/tmp`, no published port and no essential volume. Use `PURL_ROLE=worker`, `PURL_PRODUCT=purls`, and explicit `/tmp/purl-launch-worker.json` heartbeat. An external read-only check must confirm `/api/runtime` and the deployed source/image revision before cutover.

1. Stop accepting new work on the old worker by sending SIGTERM. The entrypoint stops claiming new jobs and finishes its current iteration. Wait for `launch_worker_drained` and process exit. Do not delete jobs, checkpoints, leases or provider receipts.
2. Start the new host against the **same** backend with a unique `PURL_WORKER_ID`. No database export/copy/import is part of worker relocation. APIs continue using the same authority and immutable resource versions.
3. If the old process was killed before draining, allow its persisted lease to expire. New claims use CAS/fencing; a stale worker cannot publish over a replacement. Closed pure native jobs may safely retry. Ambiguous provider calls and ambiguous steward commits are not automatically repeated; inspect their saved receipts and provider/repository evidence before any manual action.
4. Check the new heartbeat, queue age, checkpoint progression and an authorized bounded native job. Compare object/version/receipt IDs before and after. Stop the old service only after the replacement is healthy. Roll back by draining the new worker and restarting the same prior image/backend; never restore an older database over concurrent writes.

Give the process enough termination grace to finish bounded current work; the local Compose grace is 180 seconds. Platform-enforced earlier kills use the interrupted-job path above. The legacy `deploy/oracle-worker.compose.yaml` runs `service/worker.js` and must not be used unmodified for this new worker.

## Backup, retention and cleanup

Production backups are Supabase/PostgreSQL backups/PITR covering the new scoped tables and original preserved document. Keep encryption keys and provider configuration in a separate protected backup; an export without required encryption keys cannot recover stored encrypted credentials. Rehearse restore into an isolated project and verify tenant isolation, immutable hashes, versions, pending deletion fences and interrupted-job receipts before considering any production restore. Do not run a whole-store erase/reset to clear one user or one queue.

User-facing exports are complementary snapshots: `GET /api/memory/export`, `GET /api/identity/export`, native resource `/api/resources/:id/continuity` plus `/source`, `/history` and `/replay` snapshots, and `GET /api/cgit/repos/:id/export`. Use authenticated requests; protect snapshots as private data. CGIT import verifies its content-addressed snapshot and stages immutable rows; it is not a Git wire-protocol bundle. Memory/identity exports do not claim to be automatic restore APIs. For a local raw volume backup, stop all three containers first and back up the named volume plus `.env.launch` securely; restore only while all writers are stopped.

Data remains until explicit deletion, quota enforcement or an announced policy change; no fixed automatic archival interval is promised. Memory is private by default. Shares/publications require selected facts, purpose and explicit `consent:true`. Revocation stops future reads and live shares reflect edits/deletions; no service can retract copies already exported to another AI/person. Identity deletion fences authentication, inventories owned delegates and erases their scopes; interrupted deletions are retryable. Do not remove deletion tombstones merely to reclaim space.

Worker maintenance compacts expired identity credentials/flows and resumes fenced identity deletions once per minute. It does **not** implement a universal physical garbage collector. Expired provider-session shards, orphan capability lookup shards after owner deletion, resource address/index shards and immutable resource history may need reviewed physical cleanup. Before erasing a shard, prove its live authority is absent/expired, exclude pending jobs/proposals/deletion plans, preserve required audit evidence and recheck versions with CAS. Never scan-and-delete by a broad prefix or erase a shared index namespace. The current public APIs intentionally do not expose an unrestricted cleanup endpoint.

Operational bounds: 256-KiB rows, 32 changes/transaction, 10-MiB active tenant data, 4096 keys including tombstones per scope, 200 records/read. Memory additionally bounds its aggregate to 250,000 bytes, 200 facts, 400 relations, 100 passport/publication records each (including revoked), and 20 correction revisions/fact. Public cognition returns at most 200 active publications. Catalog input is at most 64 KiB and declared output at most 250,000 bytes. Native source/state each cap at 64 KiB and retained resource history at 200 versions. CGIT caps include 20 repositories, 180 objects/repository, 128 paths/tree and 12 artifacts/commit; consult the response-specific limits before import. Export before hitting a quota; deletion may retain version tombstones, so deletion does not reset lifetime metadata limits.

## Inference remains disabled until authorized

Actual model inference, fresh-model task comparison and equal-budget multi-model study remain **NOT_RUN** without an approved credential and budget. Protocol fixture tests are not model-quality evidence. Do not enable paid inference as a health check.

Optional model settings are `OPENROUTER_MODEL_CATALOG_JSON` (verified `id`, `promptMicroUSDPerToken`, `completionMicroUSDPerToken`), `MODEL_DAILY_BUDGET_MICROUSD`, `MODEL_CALL_BUDGET_MICROUSD`, `MODEL_DAILY_CALL_LIMIT`, `MODEL_TIMEOUT_MS` and encrypted BYOK storage. Hosted inference additionally requires **all** `MODEL_HOSTED_ENABLED=true`, `OPENROUTER_API_KEY`, explicit positive daily/call budgets and configured models. The local Compose file forces hosted inference off. Provider keys, context export and Constellation baseline/steward spending need separate explicit consent. Unknown outcomes retain budget reservations; do not release or retry them without provider-side evidence. No payment collection is implemented; a 15% markup is only a proposal.

The hosted scoped migration was applied through MCP as remote version `20261018171407` (`purl_launch_scoped_store`); its preserved generated local filename is `20261018163930_purl_launch_scoped_store.sql`. Reconcile local/remote history before any future CLI push. The shared project has unrelated migrations; never repair/drop them blindly.

In this managed development runner, outbound HTTPS uses its inherited proxy. Use `NODE_USE_ENV_PROXY=1` for the Node24 SDK command, retaining injected CA trust. Playwright's launch config reads the inherited proxy with loopback bypass; it preserves TLS validation. Railway runtime networking works directly and needs no development proxy secrets.
