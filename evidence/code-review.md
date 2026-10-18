# Product correctness and security review

Reviewed the God Seed, deployment amendment, and `service/CONTRACTS.md` against the working extension on 2026-10-18. Base Git revision: `3df4452a3624b3f5492bf23c2dacc49d8d2b33c7`. The reviewed product files were untracked additions; line references below describe the version examined before concurrent remediation. Historical `src/` implementation and `.purl/live-v3.json` were not modified.

These are findings, not a declaration that the product is production ready. Root was notified as findings were confirmed and is implementing fixes. Rerun the reproducer against the final code to record resolution:

```sh
node --expose-gc evidence/security-review-repro.mjs --slow
```

The script uses isolated in-memory repositories and performs no network calls or production writes. Its output is observational: use the expected corrected behavior below when assessing it.

**Interim remediation rerun:** after root's concurrent schema patch, the full command above rejected both R3 prototype inputs with 422, rejected malformed nested schema shapes with 400, and rejected false/property-name schemas with 422 at validation. R2's 80 rejected creates retained **-1,216 bytes** after GC instead of approximately 16 MiB. R2/R3 are resolved by this observed patch. R4 still blocked the event loop for 3,674 ms; R5 still produced 10,001 programs; R6 still accepted modified receipts/traces. R1's browser regression is owned by the UI implementer. Preserve the original observations below as negative evidence.

## R1 — High: login callback permits account substitution

**Location:** `web/app.js:86–97`, `service/auth.js:start`, `service/domain.js:154–172`.

The callback automatically exchanges any `#access_token=...` fragment, then replaces the browser's current session without requiring a sign-in initiated by that browser. Provider token verification proves token ownership but does not bind this login to the victim's intent. Same-origin POST/JSON defenses do not prevent this navigation-driven login CSRF.

**Reproduction:** obtain a valid provider access token for an attacker-controlled account; send `/workspace#access_token=<attacker-provider-token>` to another browser. On opening the link, `consumeAuthCallback()` calls `/api/auth/session` and stores the attacker principal. Private programs subsequently created by the victim belong to the attacker; the attacker can independently authenticate and read them. This was established from the callback/control flow; no real provider account or external browser was attacked.

**Fix:** use PKCE and bind the callback to a random, short-lived, single-use state in the initiating tab; validate it before exchanging credentials or replacing a session. Missing/mismatched state must fail closed. Scrub fragments immediately. Root/UI owner reports nonce binding is being implemented; final browser regression remains necessary.

## R2 — High: failed program creation leaks schema memory indefinitely

**Location:** `service/domain/support.js:112,135`; `service/domain.js:185–188`.

The module-global `SchemaRegistry` stores schemas by client-selected `$id`. Input-schema registration happens before output/source validation, so failed transactions still add permanent process-global entries. Program/history quotas do not bound this cache.

**Reproduction:** submit 80 otherwise valid program definitions with input schema `{$id:'unique-'+i,default:String(i)+'x'.repeat(200000)}` and output schema `{type:'invalid'}`. All requests return 400 and zero programs persist, but forced GC leaves **16,150,184 additional heap bytes** in an isolated process. Repeat unique IDs to exhaust API memory. `failed-create-schema-retention` reproduces it.

**Fix:** product schemas prohibit references, so do not register user schemas in a global ID cache. Validate without registration, or use a request-local registry with no retained client data. After remediation, rejected requests should not retain memory proportional to schema payloads.

## R3 — Medium: schema declarations silently validate less than specified

**Location:** `service/domain/support.js:113–140`; historical dependency `src/core/schema.js:34,93,98–101`.

`required` and `properties` use inherited membership. A product schema `{type:'object',required:['constructor'],properties:{},additionalProperties:false}` accepts both `{}` and `{"constructor":"untyped property"}` as run inputs (202). The first is missing a required own property; the second should fail the closed properties constraint. Nested schema primitives such as `{items:42}` and `{properties:{x:42}}` are accepted. `{propertyNames:false}` accepts object keys, while the valid root schema `false` fails registration as `unknown schema false`.

**Reproduction:** `schema-prototype` and `schema-shape` checks in the reproducer. No historical code edits are needed to demonstrate the bug.

**Fix:** preserve historical code; normalize product schema/value objects to null-prototype objects or implement own-property checks in a product validator. Reject every nested schema that is neither boolean nor object. Handle false schemas, including property-name schemas, explicitly. Corrected behavior: both prototype probes return 422; malformed nested schema registration returns 400; root false registers but rejects values; propertyNames false rejects nonempty objects.

## R4 — High: a small build request blocks the API event loop for seconds

**Location:** `service/domain.js:231–264` (`prepareBuild` test loop); `service/domain.js:128` (unbounded aggregate replay work).

Pure test execution runs synchronously on the API process. Per-execution step/work bounds multiply by the 100 allowed tests, and all failing tests still run. GET replay likewise executes every recorded execution synchronously without an aggregate work bound. Rate limiting only counts POST requests and cannot limit work within one request.

**Reproduction:** create source `input number | repeat 1000 { identity | identity | identity | identity | identity }` with 100 `{input:0,expected:0}` tests, then build. A single build returned status 200 after **3,750 ms**, with all 100 tests attempted and a zero-delay timer still unfired. This also works when tests fail their receipt/value quota. Run the reproducer with `--slow`.

**Fix:** impose an aggregate compiled-cost/work budget across build tests, fail fast on quota errors, and execute nontrivial builds/replays through workers or worker threads with deadlines. Bound or page replay verification and rate-limit expensive GET work. Corrected builds should reject this aggregate workload before interpreter execution, or complete without blocking API health/read requests.

## R5 — Medium: fork bypasses the instance program quota

**Location:** `service/domain.js:210` (create check), `service/domain.js:318–329` (fork).

The 10,000-program capacity check exists only on ordinary create. Fork adds a program without checking capacity, and it does not increment the parent version/history, so the same version can create indefinitely many forks.

**Reproduction:** fill an isolated repository's program map to 10,000 keys, retaining one authentic owned program. Ordinary create returns 429 `program_limit`; fork on that authentic program returns 201 and raises the count to 10,001. `fork-capacity` uses placeholder records only to reach the collection-size threshold; it does not alter durable state.

**Fix:** enforce the same centralized capacity/per-owner/storage budgets on every program insertion, including fork and any future import. Corrected fork at capacity returns 429 without adding state.

## R6 — Medium: execution replay ignores receipt, trace and immutable build integrity

**Location:** `service/domain.js:398–410` (`verifyExecution`).

Replay checks the artifact hash and recomputed result but does not validate the receipt hash/bindings, execution trace, recorded runtime environment or the immutable build hash. Consequently it reports valid evidence even when captured replay metadata has been modified. These changes require persisted-state corruption/access; they are integrity-detection failures, not an API authorization bypass.

**Reproduction:** after a normal pure build/run/worker completion, modify only `execution.receipt.seed=999`; replay returns both program `valid:true` and execution `valid:true`. Replace `execution.trace.steps=[]`; both remain true. Modify the build's source without updating its content hash; the program chain flags a mismatch, but execution verification still reports `valid:true`. `replay-tampering` covers these cases. No hashes are recomputed by the probe.

**Fix:** verify build content ID/source digest/plan binding, receipt content ID and all receipt references, captured runtime/environment/input/seed IDs, execution/artifact linkage and the stored trace against recomputation. Distinguish snapshot-chain consistency, artifact integrity and execution replay in response fields; do not expose one ambiguous success value. Corrected execution verification must return false for each independently corrupted record.

## Checked without a new finding

- Live authentication/authority precede idempotency replay; keys bind principal, route and payload. Grant attenuation and ancestor revocation are rechecked. Commit is owner restricted.
- Source revisions invalidate active builds. Builds retain source/plan/schema/environment and releases retain a program snapshot; later source edits do not update those objects through normal API operations.
- Worker completions are fenced by a unique claim ID, and authority is checked at claim/completion. No direct stale-claim completion flaw was found in the examined path.
- Sandbox arguments drop capabilities, use a nonroot user, read-only filesystem, bounded tmpfs/pids/memory/CPU, no network and digest-pinned images; no host mounts are passed. This source review does **not** verify a host kernel/Docker isolation boundary, ARM image availability, provider authentication, Supabase persistence or Railway deployment.
