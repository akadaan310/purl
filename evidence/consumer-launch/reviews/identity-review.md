# Identity independent review

Spec compliance: **FAIL**
Code quality/security: **CHANGES_REQUIRED**

Reviewed the complete identity snapshot diff, current identity/crypto sources, task brief/report, binding design and identity requirements/provider reconstruction. Inspected the generic store and memory consumer where needed to verify real consequences. No repository source edits, external mutations, helpers, commits, or unnecessary rerun of the 32 covered identity tests.

## Findings

### P1 — Account deletion leaves delegated-agent data and public shares available

Location: `service/launch/identity.js:475–479` (especially `await this.store.erase(owner)` at line 476). Related identity assignment: line 134; issuance: lines 499–501.

Delegated agents have a separate `agent_*` actor ID, and domain services persist their data in that principal's scope. Account deletion only erases the human owner's scope, including the records needed to discover those agents. It revokes future agent authentication but does not erase agent-owned memory/resources/repositories or revoke their public capabilities. This violates account deletion's claim that it removes local product data. It also leaves public data accessible with no surviving owner credential able to revoke it.

Confirmed using the existing synthetic OIDC protocol fixture without running its test cases: sign in, issue an agent with memory read/write/share/publish scopes, create a fact, publish it and create a passport, then delete the human account. Actual result: agent authentication is null, but `agentDataRetained: true`, public cognition still contains one partition, and the passport still returns one fact. These reads use actual MemoryService public-read methods, not fabricated authorization.

Required correction: retain and follow the human-to-agent ownership relationship during deletion; revoke or erase all delegated principal namespaces and their live shares, with retry-safe deletion state, before reporting local deletion complete. Add a regression that checks public reads as well as authentication after owner deletion.

### P1 — Shared identity scopes impose a permanent 4096-issuance outage across both products

Location: `service/launch/identity.js:248–250` (shared credential index); additional occurrences at lines 313–315 and 504–506.

Every guest session, human session and agent credential appends to the single `__identity_credentials` scope. Nothing removes expired or revoked indices. Login starts similarly append to `__identity_flows`; consuming a flow leaves a tombstone. The actual store deliberately caps every scope at 4096 records **including tombstones** (`service/launch/store.js:95`; SQL enforces the same limit). Thus only 4096 lifetime credentials or login starts exhaust these service-wide scopes. Authentication of already-issued credentials may continue, but new guest/human sessions or login flows fail for every account and both products. Expiry/logout/restart does not recover capacity. An unauthenticated caller can exhaust guest issuance in approximately 137 minutes within the stated per-source 30/minute rate limit; normal usage also reaches the same ceiling.

Focused boundary probe prefilled 4096 structurally valid expired credential indices using the real MemoryLaunchStore API, then performed normal bootstrap and guest requests for each product. Both returned `413 metadata_quota: Tenant exceeds 4096 records including tombstones`. No provider configuration is needed for this attack. The report's suggested future compaction does not resolve the active global cap, and tombstoning alone cannot reclaim record capacity.

Required correction: redesign identity indexing/flow storage to use bounded partitions or per-credential/per-flow namespaces under the existing generic per-scope contract, plus safe expiry cleanup where needed. Do not exempt global identity scopes from generic tenant quotas or erase active indices. Verify issuance beyond a complete partition's lifetime capacity while active sessions remain authenticatable.

## Confirmed compliant boundaries

The reviewed source uses pinned established openid-client code/PKCE and signature/issuer/audience/nonce/expiry validation, strict verified-email checks on callback and live UserInfo authentication, immutable issuer+subject principal IDs, encrypted provider tokens, separate product cookies/profiles and consent, bounded unverified guests, and parent-bound expiring scoped agents. Recovery fails closed. The internal integration method revalidates stored credentials/consent and attenuates delegated scopes; it does not mint browser SSO. Cookie mutation CSRF checks use the same Bearer decision as authentication, so an unrelated Authorization header cannot disable them. Legacy production settings/files are untouched by this snapshot. Provider enablement/client/email dependencies remain documented blockers, not fabricated readiness. Root HTTP's planned requireActor/trusted-Origin integration is accepted as the stated boundary rather than reported as a missing module defect.

## Probe evidence

Command: `node /workspace/consumer-review/identity-probes.mjs`

Result: exit 0; targeted defect reproductions succeeded. Script reuses only the existing protocol setup helpers and exercises real identity/store/memory implementations. No full suite rerun.

Output: `/workspace/consumer-review/identity-probes.log`.
