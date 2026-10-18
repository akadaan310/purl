# Independent root integration review

Spec: **FAIL**. Quality: **CHANGES_REQUIRED**. One concrete P2 finding remains in the reviewed root integration.

Scope: `service/launch/{application,http,main,worker-main}.js`, `sdk/launch.js`, root HTTP/SDK tests, Dockerfile, vendored package manifest, package exports/scripts, and the existing health command/legacy entrypoints needed to verify integration. Peer domain implementations, provider implementation and UI were not re-reviewed. No source edits, covered suite reruns, network requests, deployment or external mutations occurred.

## Finding

### P2 — Launch worker's default heartbeat cannot pass its advertised container healthcheck

Location: `service/launch/worker-main.js:7`; integration references: `Dockerfile:16`, `deploy/healthcheck.js:5`, `service/launch/http.js:46`.

The launch worker writes `/tmp/purl-launch-worker.json` by default. The Docker image and runtime metadata advertise `node deploy/healthcheck.js`, which, for `PURL_ROLE=worker`, instead reads `/tmp/purl-worker-heartbeat.json` by default. A correctly running launch worker started with its advertised command and worker role is therefore permanently unhealthy unless the deployment supplies an otherwise unnecessary matching `PURL_WORKER_HEARTBEAT_FILE` override. This can prevent a health-gated rollout or cause incorrect monitoring of the new worker.

A targeted offline probe executed the actual healthcheck body with `PURL_ROLE=worker` and an injected read-only filesystem interface exposing a fresh running heartbeat at the path extracted from the actual launch-worker source. It used no network, spawned no worker and wrote no files. Result:

```json
{"workerWrites":"/tmp/purl-launch-worker.json","healthReads":"/tmp/purl-worker-heartbeat.json","healthyWorkerHealthExit":1}
```

Make the producer and health command share a default, or supply and document the same explicit path in the new worker's actual deployment contract. Add a small launch-worker health regression; the existing legacy-worker container checks do not cover this default mismatch. The old API/worker entrypoints should remain intact.

## Reviewed boundaries that passed

- HTTP rejects malformed Authorization headers and rejects an explicitly invalid bearer on authenticated domain dispatch instead of falling back to a cookie or anonymous authority. Cookie mutations pass through the identity service's exact-Origin and bound-CSRF check; bearer mutations retain the explicit Origin rejection when an Origin is supplied. Identity/provider routes are routed to their dedicated security handlers.
- JSON parsing has route-specific byte bounds: 8 MiB for CGIT import, 3 MiB for artifact commits and 256 KiB by default. Durable-value checks reject non-finite numbers, invalid Unicode/NUL, excessive depth and excessive node counts before domain writes. Query parameters become the plain object expected by handlers. This review raises no obsolete 256-KiB-import-limit finding.
- Static paths use explicit maps or tightly constrained basenames under fixed directories. Mission documents have a fixed naming allowlist. Unknown API paths terminate as 404 before HTML fallback. No filesystem traversal or caller-selected static root was found. Responses set no-store, nosniff, no-referrer and a restrictive CSP; this review does not make a UI accessibility or browser acceptance claim.
- Cross-product CGIT HTTP calls request target read/write authority through `authorizeIntegration`; background credential recovery re-authenticates the source credential and requests a fresh consented target grant. Agent scopes are not expanded by the integration authorizer. Domain services receive the resulting actor, never caller-supplied owner/scopes. Native workers can request the job's recorded source product when revalidating credentials.
- The worker invokes bounded identity compaction/deletion maintenance for both products and then both durable job handlers. API startup seeds the mission through the domain service. Root health reads the authoritative store. Detailed lease, model-consent and native execution semantics remain under the separate domain reviews.
- SDK requests check exact origin before transport, use manual redirects and reject redirect responses, and send browser credentials only to the configured origin. Manifest continuation links pass through the same origin check. Node cookies remain within that fixed client origin; no cross-origin redirect/cookie leak was found.
- The old default `start`, `worker`, Docker CMD and legacy entrypoint files remain separate from the additive launch scripts. The SDK has an additive `./launch` export. The Docker image is digest-pinned, installs production dependencies offline with scripts disabled and runs as `node`.

## Verification evidence and limits

Read `evidence/consumer-launch/http/green-json-sdk.log`: **8 tests, 8 pass, 0 fail**, including actual HTTP Origin/CSRF, invalid bearer, durable queued work, payload/path restrictions, independent CGIT preview, SDK continuation and redirect denial. These results were inspected, not rerun. The supplied first offline-container 351-pass checkpoint was treated as historical checkpoint context while separately reviewed peer fixes continue.

Independently hashed all seven files in `vendor/npm/MANIFEST.json` with SHA-512 and compared each hash/version with its package-lock entry. All seven matched: Babel helper string parser, helper validator identifier, parser, types, jose, oauth4webapi and openid-client. Read the retained offline build log; it records offline installation of seven packages and successful image export.

Production settings, actual new worker role/heartbeat overrides, terminal deployment success, live provider credentials and final post-peer-fix container/public smoke remain **Cannot verify** in this read-only scope. Existing production service mappings point at the legacy entrypoints and were not changed or deployed by this review.
