# Identity fix 2 — scoped independent re-review

Prior P2 (deletion at near/full tenant quota): **ADDRESSED**.
Spec compliance: **FAIL — new concurrent-fencing recovery regression**.
Code quality/security: **CHANGES_REQUIRED**.

Scope limited to the changed deletion intent/fence/completion/resumption functions, their authentication/issuance marker checks, the new targeted tests, and current task report. No unchanged subsystem audit, source edits, network calls, external mutations, commits, or covered-suite rerun. The retained `green-quota-deletion.log` reports **42 passed, 0 failed**; that is inspected implementer evidence, not a re-run by this reviewer.

## Prior P2 — addressed

The full deletion inventory now lives in `__identity_deletion:<owner>`, under a stable existing record (`identity.js:283–297,320–325`). The owner transition replaces the existing identity value with a tombstone and compare-and-swaps the unchanged registry (`326–330`), releasing bytes and allocating neither a new owner row nor retry metadata. Consequently it no longer requires spare owner quota. Inspected new tests establish complete deletion at 128 bytes and zero bytes headroom and restart recovery after external intent but before the owner fence. Initial external-intent failure correctly leaves the account active, with no deletion claimed. Authentication/provisioning/issuance all consult the external marker.

## New P2 — concurrent deletion fencing can permanently strand deletion

Location: `service/launch/identity.js:307–330`, particularly separate profile/registry reads followed by external snapshot persistence, and the tombstone version check at `309–311`.

Two valid deletion attempts, including a request overlapping maintenance, can construct a mixed-version snapshot. One reader observes the pre-fence identity row and post-fence registry row. It persists those versions externally before its owner CAS fails. The actual owner fence has already succeeded, so neither attempt can refresh that snapshot from a live identity. Every later retry rejects the registry version mismatch as `deletion_identity_changed`. The external marker disables authentication, but the requested erasure never finishes and the owner/delegated data remain.

Deterministic interleaving reproduced with two real service method calls and a `MemoryLaunchStore` subclass that only pauses reads/commits:

1. Attempt B saves the external snapshot and pauses before the atomic owner fence.
2. Attempt A reads that snapshot and the still-live owner identity.
3. B atomically tombstones the identity and increments the registry version; it pauses before marking the external plan pending.
4. A reads the newer registry, saves an external snapshot combining the old profile version and newer registry version, then loses its owner CAS.
5. Both retry with a tombstoned profile. The persisted registry version is already the post-fence version, but recovery requires that version plus one; both throw 409.

Observed output:

```json
{"first":{"status":409,"code":"deletion_identity_changed"},"second":{"status":409,"code":"deletion_identity_changed"},"maintenance":{"completed":0,"failed":1},"intentStatus":"fencing","intentRegistryVersion":2,"actualRegistryVersion":2,"dataRetained":true}
```

Command: `node /workspace/consumer-review/identity-fix2-race-probe.mjs` — exit 0; all reproduction assertions passed.
Evidence: `/workspace/consumer-review/identity-fix2-race-probe.log`.

Required correction: ensure a concurrent fencer cannot replace the durable pre-fence inventory/version witness with a mixed snapshot after another fencer has committed the owner fence. Preserve zero-growth quota behavior, complete descendant inventory, and incarnation protection. Add a deterministic overlapping-fencers regression and verify restart/maintenance completes it. The existing concurrency test only inserts a delegation before the initial intent; it does not exercise this request/maintenance interleaving.

## Remaining obligations

Integrate periodic expiry compaction and deletion resumption as previously required. Retain the fresh-format rollout limitation and explicit retained-agent quota. The original global-index and delegated-data findings need not be re-opened; this report concerns only the new transition's concurrency failure.

**No real Supabase OAuth proof exists yet.** The local protocol suite does not establish production OAuth enablement, separate registered clients, verified email delivery, or provider revocation behavior.
