# PURL · Programmable URLs

A working local language, API, worker, SDK and browser IDE extending the original PURL/0.1 continuity implementation. PURL is pronounced **pearl**. Programs have discoverable operations, explicit authority, immutable builds, execution receipts, artifacts and continuation checkpoints.

**Deployment status:** local development and Docker verified. Railway targets and domain are provisioned; isolated hosted Supabase resources are migrated. Live startup awaits the server credential in Railway. The allocated domain is not yet a verified working URL; production startup refuses filesystem persistence. See [ACCEPTANCE.json](ACCEPTANCE.json) for exact feature and experiment status, including remaining gaps.

## Run

Node ≥20 is required; the tested container pins Node22.14.0 by image digest.

```sh
npm ci
npm start                 # http://127.0.0.1:8080
```

In another terminal:

```sh
npm run worker            # same working directory / PURL_DATA_FILE
```

Open `/`, `/explore`, `/create`, `/workspace`, `/observatory` and `/docs`. The flagship is `/p/godseed-mission`. The entire capsule copies its canonical URL; its separate Open control inspects the program. Source editing, compile, build/test, run, publish, fork, history, artifacts and checkpoints use the actual API.

Default local state is `.purl/state.json` and is explicitly development mode. Accounts may be self-declared guests/AI principals. Optional Supabase Auth email sign-in verifies the provider subject server-side and retains resource grants as a separate authority system. Hosted Auth has not been exercised.

## Program

```text
input number | math.add 2 | math.multiply 3
```

Input `4` produces `18`. The JSON AST supports typed composition, branches and bounded repetition. There are 71 operator descriptors:68 available pure operators and3 explicitly unavailable effect adapters. Discovery and [LANGUAGE_SPEC.md](LANGUAGE_SPEC.md) list exact contracts; no arbitrary strings become executable shell commands.

The God-seed source is `input json | mission.inspect`. Given the persisted mission state, it validates dependencies/cycles and computes ready, completed and waiting nodes. Its52-node/65-edge graph contains the complete original directive and Railway amendment. `verified:false` separates recorded completion claims from independently established requirement truth.

## Discover and continue

```sh
curl -H 'Accept: application/purl+json' http://127.0.0.1:8080/p/godseed-mission
node scripts/cold-client.js http://127.0.0.1:8080/p/godseed-mission
node sdk/cli.js continue http://127.0.0.1:8080/p/godseed-mission
```

A fresh client discovers the SDK through the PURL itself. Bearer credentials go in headers, never URLs. Anonymous discovery is read-only; continuation mutations require an authenticated principal and current grants. The cold AI evidence records same-provider fresh-session reconstruction and a real allowed proposal; no cross-provider private-memory continuity is claimed.

## Verify

```sh
npm test
npm run sandbox:verify    # Docker plus the pinned JS/TS/Python images
npm run test:ui           # running local API and worker; install Chromium first
npm run experiments:godseed
sh deploy/verify-schema.sh
sh deploy/verify-rest.sh
sh deploy/verify-image.sh # build purl:local first
node scripts/cold-rebuild.js # committed codex/godseed-v3 revision
```

`npm exec playwright install chromium` installs the browser. [EXPERIMENTS.md](EXPERIMENTS.md) explains E01–E10, preregistration limits, exact run files and preserved failures. Real screenshots are in `evidence/ui/`. Local PostgreSQL/PostgREST tests exercise migrations, RLS, real CAS races and restart reads; they do not establish hosted Supabase Storage/Auth operation.

## Authored programs and deployment

Python, JavaScript and erasable TypeScript performers use a JSON `main(input)` interface. They can be authored, built, tested, published and reused through the service when an explicitly enabled restricted Docker adapter is available. It uses digest-pinned images, no network/host mounts, non-root UID, read-only root filesystem, dropped capabilities and CPU/RAM/PID/time/output quotas. Default deployment profiles disable authored code. Docker is a shared-kernel boundary, not a security certification. Erasable TypeScript is supported through the restricted Node worker; Julia and Octave adapters are unavailable.

[DEPLOYMENT.md](DEPLOYMENT.md) provides Railway API+worker setup and the exact Oracle migration procedure retaining the same authoritative Supabase project, document, immutable artifacts and lease records. No ACSP live data was modified. [RECONSTRUCTION.md](RECONSTRUCTION.md) pins all original and alternate branches and explains their compatibility boundaries.

Original source/tests and Git ancestry remain intact. `npm run start:legacy` runs the original PURL/0.1 server separately; its original documentation is retained in `docs/legacy/`. Its tokens, grants and ACSP resources are not silently imported into the product service.

| Artifact | Purpose |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | API, language, persistence and worker boundaries |
| [FORMAL_SEMANTICS.md](FORMAL_SEMANTICS.md) | Typed/effect contracts and projection admission |
| [SDK.md](SDK.md) | Browser/Node SDK and CLI |
| [SECURITY.md](SECURITY.md) | Threat model, tested attacks and open limits |
| [MIGRATIONS.md](MIGRATIONS.md) | Additive Supabase schema, backup and rollback |
| [PROGRAM_GRAPH.json](PROGRAM_GRAPH.json) | Complete executable mission graph |
| [handoff.json](handoff.json) | Machine-readable continuation and blockers |
