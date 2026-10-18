# Identity fix 3 — scoped independent re-review

Remaining P2 (concurrent fencing strands deletion): **ADDRESSED**.
Spec compliance for this scoped remediation: **PASS**.
Code quality/security for this scoped remediation: **APPROVE**.
New blocking findings: **none identified**.

Reviewed only the revised deletion snapshot/fence logic, agent-revocation registry transaction, new concurrency tests, and updated implementation report/evidence. No source edits, external mutations, network calls, commits, helpers, or covered-suite rerun. This is not a new audit of unchanged identity functionality.

## Concrete basis

`fenceDeletion` now re-reads the identity profile after reading the registry and compares profile versions before any external witness write (`service/launch/identity.js:307–313`). The exact prior failure involved reading the old profile and new registry across another attempt's atomic fence. That now changes the second profile version, causing a retry without overwriting the durable witness. A subsequent read observes the existing valid fence and advances to pending/complete.

The registry-writing sites preserve the required invariant: credential issuance and deletion fencing already include the profile in the same owner transaction; agent revocation now also includes its original profile version and value in the atomic registry update (`identity.js:675–685`). Therefore a stale authenticated revocation cannot change the registry after the profile is tombstoned. A revocation that loses this CAS may fail its request, but cannot restore authority or corrupt the deletion witness.

External-plan compare-and-swap still prevents stale writers from replacing a newer pending/complete state. Instability retries are bounded at eight attempts, return `deletion_busy` when exhausted, and retain authorized external intent for later maintenance. These changes do not restore the old quota requirement: fencing still tombstones the existing owner identity and rewrites the unchanged registry without adding owner data or records.

Inspected four focused new regressions:

- Exact prior request/request interleaving, followed by fresh-service maintenance and complete owner/delegate erasure.
- Exact prior request/maintenance interleaving, with successful concurrent completion.
- Authenticated agent revocation paused across the owner fence, with the late registry mutation denied and deletion completing.
- Repeated unstable inventory observations, bounded exhaustion, and successful later maintenance.

The current retained artifact `evidence/consumer-launch/02-identity/green-concurrent-fence.log` reports **46 passed, 0 failed**, including the above regressions and prior exact/near-quota and interruption cases. This reviewer inspected the tests and artifact without rerunning them. Earlier findings are now addressed across the successive fixes: shared lifetime index exhaustion, retained delegated data/public reads, quota-edge deletion, and concurrent-fence recovery.

## Follow-up obligations and practical limits

Root must retain periodic `compactExpired` and `resumeDeletions` integration, the documented fresh-format rollout restriction, and the explicit retained-agent limit. The stable-profile observation invariant depends on every future registry writer including the profile CAS in the same owner transaction; preserve that rule when adding identity mutations.

**No real Supabase OAuth proof exists yet.** These local signed-token/protocol and persistence tests do not establish production OAuth enablement, separate registered product clients, verified email delivery, or actual provider revocation behavior. Production readiness remains conditional on that outstanding evidence.
