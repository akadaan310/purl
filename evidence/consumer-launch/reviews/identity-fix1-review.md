# Identity fix 1 — independent scoped re-review

Spec compliance: **FAIL (new quota-edge deletion regression)**
Code quality/security: **CHANGES_REQUIRED**
Original findings: **both addressed in the new design**, subject to the new deletion regression below.

Scope: `/workspace/consumer-review/identity-fix1.patch`, current `service/launch/identity.js` and `identity-crypto.js`, prior review, current task report/brief, and narrow store/public-memory reads needed to assess the fixes. Branch: `codex/purls-cgit-consumer`. Source was not edited; no network, external mutations, commits, helpers, or covered-suite rerun. Reviewed the code-review skill; its referenced reviewer template could not be loaded. This report uses explicit scope, severity, evidence, and required correction.

## New finding

### P2 — The new in-owner deletion plan makes deletion fail for near-quota accounts

Location: `service/launch/identity.js:291–295` (plan construction and atomic owner commit).

`beginDeletion` duplicates the complete credential/agent inventory into `profile:identity` before writing an external pending plan. That expansion is charged against the same 10 MiB tenant quota as product data. An account can be validly within quota yet have insufficient space for this new plan. Deletion then fails with `413 tenant_quota`; the identity remains active, no deletion intent is persisted, and `resumeDeletions` has nothing to resume. Larger retained inventories require more additional headroom.

Focused proof uses actual `IdentityService.provision`, `persistCredential`, `beginDeletion`, and `MemoryLaunchStore` with synthetic in-memory records, without bypassing store quota enforcement or making provider calls:

- Owner size: **10,485,632 bytes**, against a **10,485,760-byte** quota; **128 bytes** remain.
- New `beginDeletion`: **413 / tenant_quota**; owner is not marked deleted and the external plan is absent.
- The previous deletion fence from the supplied before/after patch succeeds on that same state, taking the owner to **10,485,686 bytes**. This establishes a regression caused by the new larger plan, rather than merely re-reporting the old behavior at exactly full quota.

Command: `node /workspace/consumer-review/identity-fix1-quota-probe.mjs` — exit 0, reproduction assertions passed.
Evidence: `/workspace/consumer-review/identity-fix1-quota-probe.log`.

Required correction: make the durable deletion-intent transition work when the owner has no spare data quota, while preserving the atomic issuance fence and complete descendant inventory. Do not depend on the user deleting unrelated product records first, erase the inventory before preserving it, or relax the generic tenant quota. Add a focused near/full-quota regression and retain interrupted-deletion recovery coverage.

## Prior findings

### Global 4096 credential/flow lifetime ceiling — ADDRESSED

Each credential and flow now has its own hash-derived scope containing a `record` and expiry marker (`identity.js:15–18,138–145,219–221,474–496`). The previous shared index scopes are no longer used. Owner metadata is a single stable registry, pruning expired credential entries and bounding active credentials/retained agents (`172–198`); the maintenance cursor is another stable row (`129–170`). Whole-scope expiry erasure reclaims tombstones, and consumed random flows remain rejected when their record or entire expired scope is absent. Maintenance scope validation excludes permanent deletion tombstones.

Inspected existing regressions covering full legacy indices with both products and a real local synthetic OIDC callback, 4100 sequential expired session lifetimes, live-session preservation, expiry cleanup, and callback replay denial. The retained `green-review-p1.log` reports **38 passed, 0 failed**. This re-review did not rerun those tests or treat their output as real provider proof.

### Owner deletion leaves delegated data/public shares — ADDRESSED in ordinary and interrupted paths

`persistCredential` retains agent IDs independently of credential expiry and updates inventory with a compare-and-swap of the identity profile in the same transaction (`174–198`). `beginDeletion` snapshots that inventory and fences issuance in the same owner transaction (`282–299`). `finishDeletion` persists the plan externally before erasing delegated scopes, credentials, and owner data (`301–316`). The complete external tombstone prevents account recreation. Maintenance can recover both external plans and an owner fenced before external persistence (`318–337`). The request credential becomes an expiring, revoked receipt without provider tokens.

The existing tests verify real MemoryService public reads, descendant erasure, interrupted erasure/restart, and interruption before external-plan persistence. Narrow consumer inspection confirms that passports re-read the erased owner's authoritative memory state, while public cognition uses publication rows inside that scope; erasing delegated scopes removes their live public access. The new quota regression above prevents some accounts from reaching this otherwise sound path.

## Follow-up obligations and limits

- Correct the quota-edge deletion transition before accepting this implementation as complete.
- Integrate periodic `compactExpired` and `resumeDeletions` into internal maintenance, as the report requires. Bounded request-path compaction alone does not clean idle expired records or resume abandoned deletions.
- Preserve the stated fresh-format rollout constraint: old identity indices are intentionally unreadable; this is not a migration for existing deployed credentials.
- The explicit cap of 128 retained delegated principals is an account-level lifetime constraint because inventory is preserved after revocation/expiry. Treat it as a documented product limit; do not silently drop expired agents and reintroduce deletion leakage.
- **No real Supabase OAuth proof exists yet.** Local signed-token/protocol tests do not establish production OAuth enablement, registered product clients, verified email delivery, or actual provider revocation behavior. Those deployment checks remain outstanding.
