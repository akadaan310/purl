# Task 05 independent review

Spec: **FAIL** — accepted provider outputs can prevent durable contribution completion and known-cost reconciliation; object count guards are not atomic.

Code quality: **CHANGES_REQUIRED**.

Reviewed the task brief/report, binding shared design, references 04/06/07, the supplied patch, both implementation files, and their tests. Existing reported 19 passing tests were inspected, not rerun. Three targeted in-memory probes used injected `Response` fixtures and made **zero external or local-network requests**. No implementation files, credentials, external state, or commits were modified. Real inference/performance remains **NOT_RUN**; absence of an approved real provider key is not itself a code defect. The root's live credential validation and consent-aware integration authorization are assumed as explicitly provided in the review assignment.

## Findings

### P2 — Validate provider text for storage and retain known billing on rejected output

Location: `service/launch/models.js:89` and `:94` (settlement construction at `:76–78`).

The response gate accepts every string up to 16,384 UTF-8 bytes, including embedded NUL and unpaired UTF-16 surrogates. The shared store expressly rejects those strings. `finish()` combines the raw result and billing settlement in one commit, so an otherwise valid paid response containing `answer\u0000end` causes `invalid_input`, leaves the call permanently `reserved`, and never records the supplied actual cost. Repeating the identical authorized request produces `CALL_IN_PROGRESS`, with no recovery path. This contradicts the requirement to parse and reconcile actual provider cost when known. No duplicate dispatch occurs, but a successful billed request is represented as still in progress and its known billing evidence is discarded.

Observed: one fixture dispatch; returned cost 40 USD-micro; ledger charged 0/reserved 85; persisted call `status: reserved`; repeat `CALL_IN_PROGRESS`.

Fix: validate storage-compatible output before constructing a persisted success result. Persist a terminal, replay-safe output error plus the independently known usage/cost when content is unusable. Do not lose known billing simply because the text cannot be stored. Add NUL/unpaired-surrogate coverage with assertions on the terminal receipt and reconciled ledger.

### P2 — Reserve serialized contribution capacity before accepting participant output

Location: `service/launch/constellations.js:31` and `:51–52`.

Only initial request JSON is bounded (110,000 bytes); contribution text is bounded upstream by decoded UTF-8 size, not its serialized JSON size. Legal JSON strings can expand sixfold on persistence. A default three-participant job with each accepted output equal to `String.fromCharCode(1).repeat(16384)` dispatches and settles all three requests, saves only two contributions, then fails with `row_limit`. The stored job with two contributions already occupies 202,364 bytes. Resume loads the saved third gateway receipt, attempts the same oversized aggregate row, and fails again. The job cannot complete through its public lifecycle even though every provider response was accepted and paid. The current serialized-input bound does not ensure enough room for supported output limits, events, stewardship, and baseline results.

Observed: `workOnce -> {status:'failed',code:'row_limit'}`; two persisted contributions, three calls, charged 120 USD-micro, reserved 0; resume fails again with `row_limit` and retains three total calls.

Fix: store contributions separately under bounded records and reference them, or budget the entire serialized job including all permitted outputs and subsequent baseline/steward/event growth. Enforce a documented output limit compatible with that storage budget before spending, and return a terminal recoverable response if upstream text violates it. Add boundary tests with JSON-escaped output; do not silently truncate attributed evidence.

### P2 — Object count quotas are bypassed by concurrent creates

Location: `service/launch/models.js:105–107`; same check-then-write pattern at `service/launch/constellations.js:33–36`.

Key creation checks a list count, then writes a fresh UUID key with no shared CAS-protected count/manifest. Concurrent requests can all observe fewer than 20 existing keys and each commit successfully. The analogous 100-Constellation guard likewise has no common record to serialize admissions. The tenant byte quota still applies, so this does not escape owner isolation or atomic spending caps, but the advertised object limits do not hold and repeated batches can fill the tenant until later settlement/storage operations fail.

Exact executed key probe: one existing key plus 25 simultaneous `POST /api/models/keys` calls; **all 25 succeeded**, producing **26 total keys**, no rejections. The constellation variant is established by the identical independent-key commit pattern, not separately executed.

Fix: atomically update an owner-scoped count/manifest alongside each object creation, retrying CAS conflicts and checking the cap again. Keep key creation redacted and avoid exposing secret material in the manifest. Add a concurrent boundary test that proves total stored objects cannot exceed the configured cap.

## Passing aspects and limits

- AES-256-GCM encryption uses a canonical configured 32-byte base64 key, random nonce, authentication tag, and owner/key AAD. Responses redact encrypted material; revocation removes ciphertext. Key lookup and all chat/job reads use the authenticated internal principal scope.
- BYOK reservation atomically checks the current key version/revocation with call creation and daily ledger changes. Same-idempotency requests never dispatch twice; payload mismatch conflicts. Unknown outcomes/costs retain reservations; known HTTP rejections refund reservations. Hosted inference fails closed without all required configuration and requires a verified human.
- Endpoint is fixed to OpenRouter HTTPS with redirect rejection. Declared models, output/context bounds, no-fallback routing, maximum prompt/completion prices, provider-data-collection denial, finite transport timeout, and bounded response reading are present. Provider overruns are recorded rather than inventing a capped actual price.
- Participant requests are independently built from the same question plus explicit selected context and role. No prior participant output is injected. Results remain attributed, identity is not falsely verified, and disagreements/claims/evidence are explicitly unassessed rather than fabricated.
- Durable CAS leases/fences prevent stale workers from saving contributions. Original per-participant idempotency keys allow completed-call recovery. Ambiguous calls cannot be automatically repeated. Live credential authorization runs before subsequent participants and stewardship. Steward intent precedes CGIT mutation, and missing receipts remain explicitly ambiguous.
- Stewardship requires explicit request consent; separate CGIT profile/scope authorization depends on the root's stated integration. No unchecked-scope finding is asserted.
- Baseline requires explicit consent/equal allocation and leaves task success unassessed. Mock fixture measurement does not establish real inference/performance. No payment collection or actual 15% markup is enabled.
- Minified single-line methods make authorization, state transitions, and failure paths difficult to audit. Reformatting/refactoring into focused helpers would improve maintainability, but the requested changes above are grounded in observed behavior rather than style alone.

## Exact reproduction

Run from any directory with the reviewed workspace present. This does not use a provider credential or perform network calls:

```sh
node --input-type=module <<'NODE'
import { ModelGateway } from '/workspace/purl/service/launch/models.js';
import { ConstellationService } from '/workspace/purl/service/launch/constellations.js';
import { MemoryLaunchStore } from '/workspace/purl/service/launch/store.js';
const actor={id:'review-owner',kind:'human',verified:true,credentialId:'review-credential',scopes:['models:write','models:read','chat:write','constellations:write','constellations:read']};
const env={OPENROUTER_MODEL_CATALOG_JSON:JSON.stringify([{id:'fixture/model',promptMicroUSDPerToken:1,completionMicroUSDPerToken:2}]),MODEL_DAILY_BUDGET_MICROUSD:'1000000',MODEL_CALL_BUDGET_MICROUSD:'50000'};
async function setup(text){const store=new MemoryLaunchStore();let calls=0;const gateway=new ModelGateway({store,env,encryptionKey:Buffer.alloc(32,1).toString('base64'),fetch:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:text}}],usage:{prompt_tokens:1,completion_tokens:1,cost:0.00004}}));}});const key=(await gateway.handle('POST','/api/models/keys',{provider:'openrouter',key:'review-only-fake-key'},actor)).body.key.id;return {store,gateway,key,calls:()=>calls};}
{
 const s=await setup('\u0001'.repeat(16384));const c=new ConstellationService({store:s.store,gateway:s.gateway,authenticateActor:async()=>actor});const job=(await c.handle('POST','/api/constellations',{question:'q',model:'fixture/model',keyId:s.key,max_tokens:2048},actor)).body.constellation;
 await c.handle('POST',`/api/constellations/${job.id}/start`,{},actor);const result=await c.workOnce({workerId:'review-worker'});const row=(await s.store.read(actor.id,`constellation-job/${job.id}`)).value;
 await c.handle('POST',`/api/constellations/${job.id}/resume`,{},actor);const retry=await c.workOnce({workerId:'review-worker-2'});
 console.log(JSON.stringify({probe:'serialized_output_overflow',result,contributions:row.contributions.length,storedJobBytes:Buffer.byteLength(JSON.stringify(row)),providerCalls:s.calls(),quota:await s.gateway.quota(actor),retry}));
}
{
 const s=await setup('answer\u0000end');const req={model:'fixture/model',keyId:s.key,messages:[{role:'user',content:'q'}],max_tokens:10,idempotencyKey:'unicode'};let first,retry;try{await s.gateway.complete(actor,req);}catch(e){first=e.code;}try{await s.gateway.complete(actor,req);}catch(e){retry=e.code;}console.log(JSON.stringify({probe:'unpersistable_provider_text',first,retry,providerCalls:s.calls(),quota:await s.gateway.quota(actor),call:(await s.store.list(actor.id,{prefix:'model-call/'}))[0].value}));
}
{
 const s=await setup('ok');const results=await Promise.allSettled(Array.from({length:25},(_,i)=>s.gateway.handle('POST','/api/models/keys',{provider:'openrouter',key:'review-only-fake-key',label:`${i}`},actor)));
 console.log(JSON.stringify({probe:'key_quota_race',created:results.filter(x=>x.status==='fulfilled').length,totalKeys:(await s.store.list(actor.id,{prefix:'model-key/'})).length,rejected:results.filter(x=>x.status==='rejected').map(x=>x.reason.code)}));
}
NODE
```

Review snapshot SHA-256:

- `models.js`: `6b298c6a2e187f0cdaa935b8079cc3b1337a9aec739c567156538662bdac7eee`
- `constellations.js`: `ec90c4c61b5f97b6ab85b994e0400ab175ccb48ecd0abce04d3e03eae23c049e`
- supplied patch: `188e730ee151fa484503d3dfb8caa5bca339f26ffe090b3595ed7b7dd88cee96`
