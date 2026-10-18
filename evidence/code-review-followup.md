# Scoped security review follow-up

Re-reviewed the R1–R6 remediations on 2026-10-18 in `service/domain/schema.js`, `service/domain/support.js`, `service/domain.js`, and the related sign-in callback/provider redirect. Historical `src/` and production state were not modified. This is a review of the six original findings, not a new broad audit.

**Final result: PASS for the six original findings.** R1, R2, R3, R5 and R6 passed the scoped follow-up below; the subsequent R4 large-literal fix passed the exact residual probe recorded at the end. Earlier negative results remain preserved as evidence.

## Verification performed

```sh
node --expose-gc evidence/security-review-repro.mjs --slow
node --test test/product/security-regression.test.js test/product/auth.test.js test/product/domain.test.js
```

The targeted tests passed **68/68** with no failures or skips. The isolated original reproducer produced:

| Probe | Current result |
|---|---|
| Missing/inherited `constructor` and undeclared own `constructor` | Both return 422 |
| Malformed nested schema primitives | Registration rejects with `invalid_schema` |
| Boolean false and false property-name schema | Validation rejects with `input_schema_mismatch` |
| Fork at 10,000 programs | Both create and fork return 429; count remains 10,000 |
| Corrupted receipt seed, trace and build source | Overall replay and execution verification both return false |
| 80 rejected oversized schema definitions | Zero persisted programs; 5,536-byte heap difference after GC, rather than approximately 16 MiB |
| Original 100-test repeat workload | Returns 422 `build_budget` in 2 ms before any tests execute |

Heap deltas are diagnostic measurements, not exact memory guarantees. The relevant cache fix is structural: product schema registration is now stateless.

## Finding disposition

- **R1 — Addressed.** The callback requires a matching random sign-in intent, checks a finite age of 0–10 minutes, consumes the intent before exchange, and removes the fragment/state from the URL. The provider OTP request uses `redirect_to` with the bound state. The original attacker-token link is rejected before any exchange. Existing Playwright evidence reports 12 expected tests, zero unexpected/flaky/skipped tests, and includes the unsolicited-token browser regression; this follow-up inspected that evidence rather than rerunning the browser suite. Age/nonce checks were also inspected in source. No real provider login was attempted.
- **R2 — Addressed.** `normalizeSchema` has no identifier cache and limits schema size/nodes/depth. Failed create requests cannot accumulate client `$id` entries outside repository transactions.
- **R3 — Addressed.** Product-only validation now handles boolean schemas, rejects malformed nested shapes, uses own-property membership, treats prototype names as data, and uses canonical JSON equality for enum/const/uniqueness. Historical validation remains unchanged.
- **R4 — Partially addressed; residual below.** Build and replay now reject aggregate step/count/byte budgets. The original costly build and oversized replay batches are rejected. Primitive-count budgeting still omits repeated large literal bytes; the loop continues after quota failures.
- **R5 — Addressed.** Fork checks the same instance capacity inside the atomic transaction before adding a program. The regression also checks that a rejected fork leaves the repository unchanged.
- **R6 — Addressed.** Replay verifies immutable build/source, receipt hashes and field bindings, input/seed/environment/runtime/dependency identities, artifact/trace/result linkage and deterministic recomputation. The overall validity includes execution failures. Immutable run history is unioned with execution records, so deleted or reassigned records cannot disappear from verification. A completed record cannot evade verification solely by changing status, and authored runtime image evidence must match its captured build. The targeted tests include coherent rehash attempts. No further load-bearing R6 gap was found within this scope.

## Remaining R4 reproduction

Create this valid PURL program with 99 tests `{input:'',expected:''}` and permissive input/output schemas:

```js
const source = {
  input: 'string',
  steps: [{ repeat: {
    count: 200,
    steps: [{ op: 'constant', args: { value: 'x'.repeat(50000) } }],
  } }],
};
```

The source fits the 64 KiB source limit. The compiler cost is 201; 99 tests cost 19,899, below `BUILD_STEPS=20000`, and the test values occupy only a few KiB. Each test copies/hashes large literal values and eventually hits `TRACE_QUOTA`. The build still executes all 99 tests. In an isolated subprocess this returned HTTP 200, attempted all 99 tests, and blocked the event loop for **3,982 ms**; a zero-delay timer did not run during the operation.

At minimum, stop a build batch after a resource-quota error, since continuing identical quota failures burns the entire budget unnecessarily. Prefer accounting for repeated argument/trace/work bytes as well as primitive counts; worker/thread execution with deadlines would also protect API responsiveness. This residual was sent to root immediately for correction.

## Limits of this follow-up

The fixes establish bounded validation and better replay consistency; they do not establish host-kernel sandbox security, cryptographic authenticity of rewritable server state, real provider authentication, remote Supabase persistence, deployment health or complete scheduling isolation. Authored replay is explicitly artifact-integrity-only, and oversized synchronous replay requests now fail rather than being verified in pages. Those limitations remain honestly scoped and are not new claims of successful verification.

## Final R4 remediation verification — PASS

After the expanded argument/work-byte budget and runtime-quota fail-fast fix, reran **only the exact remaining large-literal probe above** in an isolated `MemoryRepository`. The source and all 99 tests were accepted at creation, and the subsequent build produced:

```json
{"check":"residual-large-literal-R4","status":422,"error":"build_budget","elapsedMs":4.27,"buildsPersisted":0,"repositoryRevisionChanged":false}
```

The same workload that previously blocked the API for 3,982 ms is now rejected during budget preflight, without persisting a build or changing the repository revision. The residual R4 finding is addressed. R1–R6 are therefore **PASS within this review's scope**; the limitations in the preceding section still apply. This final check did not rerun unrelated suites or broaden the audit.
