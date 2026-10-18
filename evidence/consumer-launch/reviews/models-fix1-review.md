# Task 05 — scoped fix re-review

Spec verdict: **FAIL** — known billing can still be lost in the newly added rejected-output path.

Code quality verdict: **CHANGES_REQUIRED**.

Scope: only the three prior findings in `models-review.md` and new breakage in `models-fix1.patch`. Read the fix diff, current models/Constellations implementation, relevant shared-store validation, and task 05 report. The reported **26 passing tests were not rerun**. One additional in-memory probe used an injected `Response` and made **zero network requests**. No implementation files, credentials, commits, or external state were modified. Actual live inference/performance remains **NOT_RUN**.

## Disposition of prior findings

| Prior finding | Disposition | Evidence |
| --- | --- | --- |
| Unpersistable output loses known billing | **PARTIALLY ADDRESSED** | NUL and unpaired-surrogate strings now become terminal `output_rejected` receipts, preserving independently parsed usage/cost. The new hash computation for rejected non-string content can still throw before settlement; see finding below. |
| Escaped output exceeds aggregate job row after paid calls | **ADDRESSED** | Output is limited to 16,384 serialized JSON bytes, exposed in model metadata. Initial job capacity includes participant and baseline allowances plus event headroom; start reserves actual padded tenant bytes before inference. Accepted evidence replaces padding, job rows remain below the store limit, and oversized output becomes an attributed terminal failure without redispatch. Steward receipt storage retains the commit hash. |
| Concurrent object creation bypasses count limits | **ADDRESSED** | Each object admission atomically writes an owner-scoped quota record with the object under CAS, retries conflicts, and rechecks the cap. Revocation updates active count atomically and handles duplicate revocation. Total key records remain capped at 20; Constellations at 100. |

## Remaining finding

### P2 — Rejected-output hashing must not prevent known-cost settlement

Location: `service/launch/models.js:99` (`JSON.stringify(content)` used for `outputError.sha256`).

The new output gate correctly rejects non-string content, but rejection then recursively serializes that same untrusted value to hash it. A valid provider JSON response can be deeply nested while remaining well below the 131,072-byte transport limit. `JSON.parse` accepts the response, cost parsing obtains 40 USD-micro, and the output gate rejects it; then `JSON.stringify(content)` throws `RangeError: Maximum call stack size exceeded`. The exception occurs before `finish()`, leaving the call `reserved` and its known cost unrecorded. A repeat returns `CALL_IN_PROGRESS`, so the newly promised terminal rejection/reconciliation does not occur.

Executed fixture: content is 10,000 nested arrays around numeric zero; complete response is **20,104 bytes** with usage `{prompt_tokens:1,completion_tokens:1,cost:0.00004}`. Observed **one dispatch**, first call `RangeError`, retry `CALL_IN_PROGRESS`, persisted status `reserved`, ledger **charged 0 / reserved 85**. This is an uncovered failure of the new rejection-hash expression, not a repeat of the NUL/surrogate regression tests.

Fix direction: make diagnostic hashing unable to block billing settlement. For example, hash the already bounded raw response bytes (and label that digest appropriately), or use a safe bounded diagnostic for non-string content instead of recursively reserializing it. Persist the terminal rejection with the parsed cost even if diagnostic construction fails. Add a regression asserting a terminal replay-safe receipt, charged 40, reserved 0, and one dispatch for this fixture.

## Exact probe

```sh
node --input-type=module <<'NODE'
import { ModelGateway } from '/workspace/purl/service/launch/models.js';
import { MemoryLaunchStore } from '/workspace/purl/service/launch/store.js';
const actor={id:'review-owner',kind:'human',verified:true,scopes:['models:write','chat:write']};
const store=new MemoryLaunchStore();let calls=0;
const body='{"choices":[{"message":{"content":'+ '['.repeat(10000)+'0'+']'.repeat(10000)+'}}],"usage":{"prompt_tokens":1,"completion_tokens":1,"cost":0.00004}}';
const gateway=new ModelGateway({store,encryptionKey:Buffer.alloc(32,1).toString('base64'),env:{OPENROUTER_MODEL_CATALOG_JSON:JSON.stringify([{id:'fixture/model',promptMicroUSDPerToken:1,completionMicroUSDPerToken:2}])},fetch:async()=>{calls++;return new Response(body);}});
const key=(await gateway.handle('POST','/api/models/keys',{provider:'openrouter',key:'review-fake-key'},actor)).body.key.id;
const request={model:'fixture/model',keyId:key,messages:[{role:'user',content:'q'}],max_tokens:10,idempotencyKey:'deep-json'};
const errors=[];for(let i=0;i<2;i++)try{await gateway.complete(actor,request);}catch(e){errors.push({name:e.name,code:e.code,message:e.message});}
console.log(JSON.stringify({bytes:Buffer.byteLength(body),calls,errors,quota:await gateway.quota(actor),status:(await store.list(actor.id,{prefix:'model-call/'}))[0].value.status}));
NODE
```

Review snapshot SHA-256:

- `models.js`: `e6a6ddca44a33b310af9b0a65b1dbd175598d323fd86d96c9d6f0ac927ddc80d`
- `constellations.js`: `c501bfb3a2ddb1d016fdee22a0b8751396b2b2b7c87ce18cce395865f9c87926`
- `models-fix1.patch`: `5f5c27e00a608f2d11cf3388622e30813b88833f5c26f419d63b3f7e05f4c117`
