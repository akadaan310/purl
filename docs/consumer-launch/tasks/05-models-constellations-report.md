# Task 05 — DONE_WITH_CONCERNS

Implemented the bounded OpenRouter gateway and durable Constellations. Targeted verification: **27 tests passed, 0 failed, 0 skipped**. Actual provider inference and performance comparison: **NOT_RUN**, because no approved operator inference credentials/budget are configured. No paid provider call, payment, deployment, commit, or external mutation was performed.

## Files

- `service/launch/models.js`
- `service/launch/constellations.js`
- `test/launch/models.test.js`
- `test/launch/constellations.test.js`
- `evidence/consumer-launch/05-models-constellations/*`
- This report.

No HTTP/UI/dependency/shared store or CGIT files were modified.

## Implemented behavior

`ModelGateway({store,encryptionKey,env,fetch,clock})` exposes the requested `handle` and `complete`. AES-256-GCM keys use a configured 32-byte base64 secret and owner/key authenticated encryption context. Key list and create responses are redacted. Key revocation is checked atomically with budget reservation, including the revocation/preparation race. Calls are restricted to one fixed HTTPS OpenRouter endpoint with redirect refusal, declared models, 8192-character contexts, 1–2048 output tokens, finite timeouts, bounded response bodies/text, explicit selected-context consent, exact scopes, and internal principal namespaces. Provider routing forbids fallbacks and provider data collection, requires parameter support, and enforces configured prompt/completion price ceilings.

Per-owner daily ledgers atomically reserve integer USD-micro amounts and a call count before HTTP. A conservative UTF-8 byte input bound includes message framing. Provider-reported cost settles the reservation; absent cost remains unknown and reserved. Known pre-generation HTTP rejections refund the reservation; network timeouts, server failures, malformed success responses, and crashes retain reservations. Same-key duplicates never repeat a provider request. Different payloads conflict. Actual receipts and private bounded chat threads persist. No payment collection exists; 15% markup is explicitly a proposal.

`ConstellationService({store,gateway,cgit,clock,authenticateActor})` creates three default independent researcher/challenger/verifier contexts; supports 3–5 distinct supported roles. Every initial request contains only the original question, role, and explicitly selected context. Participant outputs never enter another initial context. Attributed text and evidence/claims status are preserved verbatim, with disagreement explicitly **unassessed** rather than fabricated consensus. Saved contributions, event hash chains, checkpoint integrity, CAS worker leases/fences, completed-call receipts, and original idempotency keys support recovery. A live credential validator is required for every background job and checked before each subsequent participant and steward. Revoked, expired, or missing credentials stop execution. Scoped reads remain pure.

Lifecycle includes `draft` before start and `paused` on checkpoint, in addition to `queued/running/succeeded/failed`. This deliberately keeps unstarted and paused work outside indexed runnable scans so drafts cannot starve workers. Root worker scans `constellation-job/` via `workOnce` only. Restart resumes already-persisted contributions; an ambiguous provider call is never silently repeated. Steward intent is persisted before CGIT; an interrupted commit without a receipt becomes explicitly ambiguous and is not automatically retried. Optional steward uses real `cgit.commitArtifact` with separately explicit consent. The equal-budget baseline requires an explicitly authorized allocation equal to the participants' summed estimated maximum budgets, shares the original question/context, reports actual cost/tokens, and never asserts task success without a human rubric.

## Routes and integration

- `GET /api/models` is public: `{provider,available,hostedAvailable,models,quota,limits,pricing}`. `quota` is null without authorized `models:read`; public availability never depends on private BYOK keys. Key and thread routes remain private.
- `POST /api/models/keys`: `{provider:'openrouter',key,label?}` → `{key}`. `GET` lists `{keys}`. `POST /api/models/keys/:id/revoke` revokes.
- `POST /api/chat`: `{model,keyId?,messages:[{role:'user'|'assistant',content}],max_tokens?,idempotencyKey,selectedContext?:[{id,text}],consent?:true}` → `{text,model,provider,usage,cost,receipt,threadId}`. Context/header idempotencyKey overrides the body key. `GET /api/chat/threads` and `/api/chat/threads/:id` are owner-private.
- `POST /api/constellations` or `/create`: `{question,model,keyId?,max_tokens?,selectedContext?,consent?,participants?:[{role,model}],steward?:{consent:true,repoId,branch?,expectedHead?},idempotencyKey?}` → `{constellation}`.
- `GET /api/constellations`, `GET /:id`, `POST /:id/start`, `/checkpoint`, `/resume`, `GET /:id/replay`.
- `POST /api/constellations/:id/baseline`: `{consent:true,budgetMicroUSD}`. Without explicit consent returns `NOT_RUN` with no inference call.

Use exact scopes `models:read`, `models:write`, `chat:write`, `constellations:read`, `constellations:write`. Hosted inference additionally requires a verified human. Inject `authenticateActor: credentialId => identity.authenticateCredentialId(credentialId)` into the worker; raw tokens are never queued. CGIT stewardship additionally requires the live actor's separately consented CGIT profile and `cgit:write`; the root must resolve cross-product authorization through identity rather than append unchecked scopes. Root owns service wiring, worker process, frontend handlers, full-suite integration, deployment, and production SQL checks.

Configuration:

- `encryptionKey` constructor or `MODEL_ENCRYPTION_KEY`: canonical base64 encoding of exactly 32 secret bytes.
- `OPENROUTER_MODEL_CATALOG_JSON`: declared entries `{id,promptMicroUSDPerToken,completionMicroUSDPerToken}`. Empty by default; no model availability is invented.
- `MODEL_DAILY_BUDGET_MICROUSD`, `MODEL_CALL_BUDGET_MICROUSD`, `MODEL_DAILY_CALL_LIMIT`, `MODEL_TIMEOUT_MS` bound requests. BYOK defaults are $0.10/day, $0.01/call, 20 calls/day, 30-second timeout; operators can lower limits.
- Hosted requires **all** `OPENROUTER_API_KEY`, `MODEL_HOSTED_ENABLED=true`, explicit positive daily/call budget settings, and declared models. Current readiness evidence reports hosted unavailable and actual inference NOT_RUN.

Read-only official catalog research observed 471 models. Example observed prices: `openai/gpt-4.1-mini` input 0.4/output 1.6 USD-micro/token; `openai/gpt-4.1-nano` input 0.1/output 0.4. These are observations, not durable price guarantees; the adapter sets matching provider-side maximum price filters. Terms note account credits/payment fees and provider-specific data terms. Official usage docs say `usage.cost` is total account cost and that `usage.include` is deprecated; implementation relies on the returned usage object and does not send the deprecated option. Evidence includes source URLs, fetch time, status, hashes, selected catalog fields, and relevant official excerpts.

## Verification and evidence

Commands run:

```sh
node --check service/launch/models.js
node --check service/launch/constellations.js
node --test test/launch/models.test.js test/launch/constellations.test.js
```

Final output: `evidence/consumer-launch/05-models-constellations/review-final-tests.txt`: **26 passed / 0 failed / 0 skipped**. Initial missing-module baseline outputs are retained in `models-red.txt` and `constellations-red.txt`; additional behavior-first failures and successful follow-ups are retained for provider price/privacy constraints, serialized-context limits, atomic revocation, and draft/paused queue projection.

Real local HTTP transport tests check actual JSON request histories, Authorization transmission to the fixture, separate contexts with no preceding participant outputs, actual response parsing, cost reconciliation, known rejection refunds, real socket timeout, duplicate idempotency and concurrent spending. These are **provider-protocol fixtures**, not actual OpenRouter inference or model-performance results. Additional tests cover encrypted/redacted keys, scope/owner boundaries, secret-free errors, selected-context consent, private threads, checkpoint/restart, stale leases, ambiguity recovery, live credential revocation, replay tampering, explicit baseline budgeting, and bounded contexts.

The file-backed integration reopens `FileLaunchStore`, runs all three fixture requests, writes an actual `CgitService` content-addressed trace, verifies an added artifact through CGIT diff, exports both real commits and all three saved contributions, reopens again, verifies replay, and confirms no repeated provider requests. The full repository suite was deliberately left to root per task instructions while peers integrate.

## Remaining concerns / truthful limits

- Actual inference, free/hosted economics, fresh model-context performance, and human-rubric task comparisons remain **NOT_RUN**. Enabling them requires an approved provider account key, explicit budgets, declared prices/models, verified credentials, and an authorized test request. No model-quality claim follows from fixture success.
- Unknown cost/outcome reservations intentionally remain held. There is no automatic billing reconciliation job or manual adjustment route; an operator needs provider-side evidence before releasing them. A crash after reservation but before dispatch is also conservatively non-replayable.
- Budget and token bounds use declared prices plus provider maximum-price filters; provider-reported billing remains authoritative. Upstream cost overruns are recorded honestly, then subsequent calls are denied by the ledger. Account-level provider spend controls remain useful when enabling hosted credentials for many owners.
- Replay hashes detect accidental/tampered persisted content relative to the recorded chain. They are not an externally signed defense against an administrator rewriting every record and hash; optional CGIT commits anchor evidence in independently addressable content hashes.
- Disagreements/claims/evidence are preserved as attributed original output and explicitly unassessed/unverified; this module does not invent a semantic consensus or automated success rubric.
- File persistence was exercised as development evidence. Root owns production Supabase/PostgreSQL and multi-process deployment verification.


## Independent-review corrections and fresh verification

The first independent review correctly identified three P2 defects. All are corrected with retained failing regressions in `review-regressions-red.txt` (19 passed / 6 failed before corrections). The final covering run is `review-final-tests.txt` (26 passed / 0 failed / 0 skipped), using the exact syntax/test commands above.

1. **Storage-incompatible provider output and known billing:** NUL, unpaired UTF-16 surrogates, missing/non-string content, and output above **16,384 serialized JSON bytes** are rejected terminally. Valid usage/cost are parsed independently before rejecting text. A persisted `output_rejected` result holds the actual cost, usage, output hash, serialized byte count, and non-replayable receipt; no invalid text is persisted or silently truncated. First and repeated calls return `PROVIDER_OUTPUT_REJECTED` with the same billing receipt, without redispatch. Constellation failures retain the participant role/index/model and receipt/cost attribution. Regression tests use the actual shared `MemoryLaunchStore`, whose string validation matches the PostgreSQL JSONB NUL/unpaired-surrogate restrictions. The source tree's PostgreSQL contract is respected; this correction did not run a separate live PostgreSQL service.

2. **Durable output capacity:** The output limit now measures JSON serialization, so sixfold control-character escaping cannot bypass it. Each model reservation allocates 24 KiB of actual temporary store space before HTTP, releasing it upon terminal settlement; a regression fills the rest of the 10 MiB tenant quota while HTTP is in flight and still confirms known-cost settlement. Each Constellation computes its full initial-state-plus-participants-plus-baseline/checkpoint capacity before admission and reserves actual padded tenant space when started, before any model call. Padding is replaced as evidence grows and omitted from public views. Stored rows are bounded to 240 KiB, below the shared 256 KiB limit. Steward receipts retain the commit hash rather than an unbounded repository tree. Five 16,202-byte serialized outputs, a baseline, replay metadata, and reserved headroom fit durably. Oversized upstream output stops explicitly at the first participant with its known charge recorded; resume returns the existing terminal receipt and does not repeat billing. Drafts do not reserve full execution space until started, so pure creation never spends model budget.

3. **Atomic object admission:** `model-key-quota` and `constellation-quota` are owner-scoped manifests updated in the same CAS commit as object creation. Key revocations atomically decrement active count, remove encrypted material, and remain idempotent under concurrent duplicate revocations. Total key records remain capped at 20, including revoked records; active keys are tracked separately. The key regression starts with one key then races 25 creations: exactly 19 succeed and 6 return `KEY_LIMIT`, leaving exactly 20 stored keys. The Constellation regression creates 98 actual jobs then races 8 admissions: exactly 2 succeed and 6 return `CONSTELLATION_LIMIT`, leaving exactly 100 actual records.

A frontend integration correction also makes GET `/api/models` public for catalog/prices/readiness. Public responses contain no usage, private keys, or key-dependent availability; `quota:null` explicitly indicates no private quota access. Returned `limits` describe context characters, output tokens, and serialized output bytes. All mutation/key/thread scopes remain enforced.

Fresh independent review of these corrections remains root-coordinated. No real inference, paid request, external mutation, commit, or shared-file edit was introduced by the corrections.


## Rejection-hash follow-up

The scoped review identified a diagnostic failure for a valid 20,104-byte provider response whose non-string content contains 10,000 nested arrays. The rejection path previously recursively serialized that value to compute its diagnostic hash and could throw before settling the already-known 40 USD-micro charge.

The narrow correction retains the already bounded raw response buffer and hashes its bytes. Rejection diagnostics explicitly label `hashSource: "provider-response-bytes"` and include `responseBytes`; no recursive serialization of non-string content remains. The regression uses actual local HTTP transport and the shared store, verifies `output_rejected` twice, charged 40/reserved 0, one dispatch, and the bounded-response diagnostic fields.

Evidence: `rejection-hash-red.txt` preserves the pre-fix RangeError; `rejection-hash-green.txt` verifies the focused regression; `rejection-hash-fix.patch` contains the narrow implementation diff. Fresh complete scoped run `rejection-hash-final-tests.txt`: **27 passed / 0 failed / 0 skipped**. Commands:

```sh
node --test --test-name-pattern='deeply nested non-string' test/launch/models.test.js
node --check service/launch/models.js
node --test test/launch/models.test.js test/launch/constellations.test.js
```

No Constellations code, shared files, actual inference configuration, external state, or commits changed in this follow-up.
