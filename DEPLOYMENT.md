# Deployment

This repository supplies portable deployment configuration. No Railway service,
Oracle instance, hosted Supabase project, or public production URL was created by
this implementation. Local HTTP and container checks do not establish a public
deployment or hosted durability.

## Run locally

```sh
npm ci
cp .env.example .env
node --env-file=.env service/main.js
```

In a second terminal run `node --env-file=.env service/worker.js`. Both processes
must use the same `PURL_DATA_FILE`. This is explicitly DEVELOPMENT persistence,
uses one host filesystem, and does not establish production database durability.
Memory persistence (`PURL_PERSISTENCE=memory`) is for tests and disposable demos.

For local Docker development, build `purl:local` and run
`docker compose -f compose.dev.yaml up -d`. It exposes only loopback port8080
(override with `PURL_DEV_PORT`), starts distinct API/worker services, and retains
development state in the `purl-development` named volume. Ordinary `down` keeps
that volume; deleting it would discard local state. This profile disables
authored code and is deliberately distinct from Supabase-backed production.

## Production configuration

Apply [MIGRATIONS.md](MIGRATIONS.md) to a dedicated Supabase project first. Set the
following values in both API and worker secret/configuration settings:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PURL_PERSISTENCE` | `supabase` |
| `SUPABASE_URL` | HTTPS URL of the same Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only project service-role credential |
| `PURL_DOCUMENT_ID` | `main`, identical across both processes |
| `SUPABASE_ARTIFACT_BUCKET` | `purl-artifacts` |
| `PURL_BASE_URL` | Canonical HTTPS URL of the API service |
| `PURL_ROLE` | `api` for the API; `worker` for the worker |
| `PURL_JOB_LEASE_MS` | `30000`; increase above the maximum allowed execution duration |
| `PURL_SANDBOX_ENABLED`, `PURL_SANDBOX_VERIFIED` | `0` for these deployment profiles |

The server and worker reject missing Supabase configuration in production. The
service-role key must never be embedded in frontend assets, images, URLs, or
repository files. Give the API outbound HTTPS access to its Supabase endpoint;
the worker requires the same access. Storage objects remain private and API
artifact reads require program access. The helper uses content-addressed writes,
disables upserts, and verifies byte hashes; administrative service-role access
can still override Storage, so keep separate object backups.

Authored JavaScript/TypeScript/Python are retained as source but execution requires a
separately configured, verified isolated adapter. These Compose/Railway profiles
run the pure interpreter and do not mount a Docker socket. Merely changing an
enable flag does not establish sandbox safety.

## Image and Compose

The Dockerfile pins the base image digest, installs the committed lockfile using
`npm ci`, runs as UID 1000, and has API/worker health checks. Build on a normal
host with `docker build -t purl:local .`. In the managed cloud environment, retain
the configured proxy/CA and use:

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t purl:local .
```

The build secret never enters image layers. With production secrets supplied in
the environment, `docker compose up --build -d` starts distinct API and worker
processes. Do not store real credentials in tracked files. Compose uses a read-only
root filesystem, writable temporary directory, dropped capabilities and a
45-second graceful-stop interval. `docker compose ps` reports health;
`GET /healthz` checks the API repository. Worker health requires a fresh heartbeat
at `/tmp/purl-worker-heartbeat.json` (default maximum age 120 seconds).

## Railway first

Create two services from this repository and use the same release revision:

1. API: root `railway.toml`, start command `node service/main.js`, `PURL_ROLE=api`,
   generated HTTPS domain, health route `/healthz`. The image binds `0.0.0.0` and
   honors Railway's `PORT`.
2. Worker: configuration file `deploy/railway-worker.toml`, command
   `node service/worker.js`, `PURL_ROLE=worker`, no public domain. Railway does not
   provide a worker HTTP health route; monitor heartbeat, logs, queue age and
   execution failures in addition to process restarts.
3. Set the shared production values above, set both canonical base URLs to the
   API's HTTPS domain, and deploy. Verify the discovery manifest and `/healthz`,
   enqueue a pure job through the SDK/API, and verify its result survives API and
   worker restarts before claiming hosted durability.

Do not copy local `.purl` state into production as a second database. Supabase is
the sole production authority. A successful local image build is separate
evidence from Railway deployment and public reachability.

## Move workers to Oracle later

Keep the Railway API, canonical public URL, Supabase project, document ID, bucket,
and service-role credential unchanged. This migration changes worker placement;
it does not create a competing state store.

1. Push the verified release image and record its immutable `image@sha256:digest`.
   Provision a Linux Oracle host with Docker/Compose and outbound HTTPS to the
   existing Supabase project. Place shared configuration in a protected
   `/etc/purl/runtime.env` file, mode 0600. Add `PURL_IMAGE` with that digest and a
   unique `PURL_WORKER_ID=oracle-worker-1`.
2. Stop/scale down the Railway worker gracefully. SIGTERM stops new claims and
   allows the current `workOnce` to finish and persist its result. Retain its logs
   and record outstanding execution IDs and lease expiry times. The API stays up.
3. If shutdown was interrupted, wait until the outstanding lease expiry before
   concluding it is abandoned. The replacement worker claims expired work using
   the authoritative CAS document; it must not reset/delete execution records.
4. Run:

   ```sh
   docker compose --env-file /etc/purl/runtime.env -f deploy/oracle-worker.compose.yaml pull
   docker compose --env-file /etc/purl/runtime.env -f deploy/oracle-worker.compose.yaml up -d
   docker compose --env-file /etc/purl/runtime.env -f deploy/oracle-worker.compose.yaml ps
   ```

5. Verify worker health, enqueue a pure job, and confirm completion through the
   unchanged Railway API. Compare program versions, immutable build/release refs,
   grants, idempotency records and outstanding execution IDs before and after.
   Restart the Oracle worker once and check recovery of an expired lease. Record
   these results as migration evidence; this repository has not run them on Oracle.

Rollback: gracefully stop Oracle workers, retain Supabase unchanged, and restore
the previous Railway worker image/command. Wait for unexpired leases before
expecting reclaim. CAS claims prevent two placements from owning the same live
lease, but arbitrary external side effects are outside the pure interpreter's
transaction guarantee.

## Local verification

`node --test test/product/repository.test.js` verifies snapshots, failures,
file restart/atomic staging recovery, four-process serialization, stale locks,
production fail-closed behavior, CAS retries and Storage helper byte integrity.
`sh deploy/verify-schema.sh` runs migration/security assertions in disposable
PostgreSQL. `sh deploy/verify-rest.sh` uses real local PostgREST and PostgreSQL for
adapter HTTP/CAS concurrency and anonymous denial. Its forwarding gateway only
maps Supabase's `/rest/v1` prefix; SQL responses are real. These harnesses do not
exercise a hosted Supabase project or its Storage HTTP service. After building
`purl:local`, `sh deploy/verify-image.sh` checks separate non-root API/worker
containers with a read-only root filesystem, a real queued computation and
persisted result retrieval after restarting both containers. This last harness
uses DEVELOPMENT file persistence and has no network connectivity.
