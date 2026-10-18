# PURL integrated architecture

The original continuity/research/transport layers in `src/` remain intact with their dependency tests. The product extension resides in `service/`; it reuses original canonical hashing, differences and proven authority patterns without merging ACSP databases or granting authority through mathematical validity. Original architecture documentation is in `docs/legacy/ARCHITECTURE.md`.

## Execution path

`URL discovery → source → parser → typed/effect/capability checker → versioned IR → immutable tested build → durable queue → worker authority/environment recheck → bounded execution → immutable artifact → receipt → checkpoint → replay`

- `service/http.js`: HTTP/body/origin/rate/credential boundary; static browser assets; read-only metadata and compatibility adapters. Every durable mutation uses POST. No user-supplied URL is fetched.
- `service/domain.js`, `service/domain/`: principals, optional provider-verified identity exchange, scoped/attenuated grants, optimistic versions, proposals, immutable builds/releases/artifacts, games, mission graph, queue leases, replay and evidence. Request-bound idempotency is persisted and rechecks current authority before returning a prior mutation.
- `service/compiler.js`, `service/language/`: a closed bounded operator language. Plans are data and are checked again at execution. Registry/source/dependency digests prevent silently accepting a changed interpreter. Pure computations have empty effect rows. External adapters remain unavailable.
- `service/adapters.js`, `service/compat/`: pinned original SEURL FSM, parse-only Substrate term registry, independent re-evaluation of pinned bit-composition snapshots. No token/grant import and no networking.
- `service/repository.js`: transactional memory/file development adapters and authoritative Supabase REST CAS adapter. Mutators are synchronous and side-effect-free; retries never repeat external effects. File mode uses locks, fsync and atomic rename on one host.
- `service/worker.js`: separate worker process, persisted claims with expiring leases and claim-ID fencing, current authority at claim/completion, heartbeat and graceful draining. Only bounded pure computation runs in default deployments.
- `service/sandbox.js`: opt-in isolated authored-code adapter with pinned JS/TS/Python images and recorded actual runtime environment. Not a public shell or an ambient-cloud-credential subprocess.
- `web/`: self-hosted responsive browser UI. Its counts, diagnostics, traces, history and outputs come from the API. Tokens stay in per-tab session storage; nonce-bound optional account callbacks clear provider tokens immediately.
- `sdk/`: dependency-free browser/Node SDK, TypeScript declarations and CLI. Off-origin manifest operation links cannot receive a bearer token.

## Persistence and atomicity

Production state lives in `public.purl_documents`, a revisioned JSON document updated by restricted SQL CAS RPCs. The migration also projects normalized entities and audit rows in the same transaction. Server-only roles can access the persistence API; anonymous/authenticated direct access is revoked and RLS is enabled. Immutable result objects are uploaded to the private Supabase Storage bucket before success acknowledgement and referenced by persisted artifacts. A failed upload yields a failed job, not false success. CAS failures can leave an unreferenced immutable object; conservative garbage collection requires a separate review.

This coarse document transaction favors correctness and a reviewable integration over high write throughput. The default capacity is10,000 programs with bounded per-program history. Document copies, snapshots and global serialization are scaling limits; separate indexed queue/entity repositories are future work, not a claimed production scale result. Build/replay aggregate work budgets reject expensive synchronous work; this is not a distributed fairness or billing system.

## Restart and portability

API and workers are interchangeable placements of the same image and configuration. Containers contain no essential production state. After interruption, an expired lease is claimable by a replacement worker; a stale worker cannot commit through a superseded claim ID. Exact pure replay checks captured inputs, seeds, versions, traces and environment; an environment change is explicit, never silently claimed equivalent. Portability tests compare specified pure values across host Node24 and container Node22; ARM execution is not verified.

Railway runs API and worker separately. Moving workers to Oracle retains Supabase and public addresses and drains or recovers leases. See DEPLOYMENT.md. Hosted deployment, object backup/restore and actual Oracle execution remain blocked without configured targets.

## Evidence and trust

Hash chains establish internal self-consistency relative to an existing trusted head. They do not prove historical authenticity against a malicious server who can rewrite all state and hashes. Mission statuses and submitted evidence remain claims; artifact existence/hashes do not establish all requirement predicates. No external transparency witness, signature authority, general semantic-equivalence procedure, cross-provider continuity advantage or arbitrary sandbox safety certificate is claimed.
