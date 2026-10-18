# PURL Constitution

PURL is an addressable computation and continuity system. A URL identifies a
resource; knowing its URL does not grant authority to change it. This document
states the invariants enforced by the product domain, alongside the preserved
PURL/0.1 continuity reference implementation in `src/continuity/`.

1. **Authority is current and explicit.** Ownership and effective grants confer
   rights. A requester cannot obtain authority by declaring a label, AI identity,
   principal ID, administrator flag, constitutional claim or proposal. Provider
   account verification establishes a principal; it confers no resource rights.
2. **Delegation attenuates.** One live grant chain must authorize an operation.
   A delegate cannot combine separate grants to invent a stronger grant. Revoking
   an ancestor disables every descendant. Owner acceptance is required to commit
   proposals. A grant to the public is limited to read, run, play and propose.
3. **Visibility and authority are distinct.** Public resources are listed and
   readable; unlisted resources are readable at their known URL; private resources
   require ownership or an effective read grant. Artifacts, executions, releases,
   diffs and history inherit the program's current visibility. A fork starts with
   its own owner and no inherited grants.
4. **Reads do not change durable state.** Inspection, manifests, history, replay,
   continuity and discovery use GET. Mutations use explicit POST operations and
   require a current expected version. Browser clients with only read access are
   given preparation links, never fictitious mutation capabilities.
5. **Retries cannot revive revoked authority.** Idempotency records are durable,
   scoped to the principal and route, and bound to the complete request payload.
   Live authentication and authority are checked before replaying a cached result.
   Reusing a key for another payload is a conflict.
6. **Published evidence is immutable.** Source edits create a new source revision.
   Builds capture source, schemas, tests, compiler derivation and environment.
   Releases pin passing builds and snapshots. Execution artifacts and receipts have
   integrity hashes. Equal hashes establish equality within the chosen encoding;
   they do not establish authenticity, authorship or semantic equivalence.
7. **Execution has a boundary.** The PURL interpreter runs bounded typed pure
   operations. Stored JavaScript and Python do not execute in the API process.
   Authored code requires an explicitly enabled, verified isolated adapter; absent
   that adapter, builds report BLOCKED and execution/publication fails closed.
   No normal subprocess or Node VM is treated as an isolation boundary.
8. **Durable jobs survive interruption.** Inputs, seeds, dependencies, immutable
   build identity and environment are persisted before acknowledgement. A worker
   claims a time-limited lease and rechecks authority. Expired leases can be
   reclaimed; only the current claim can commit a result. Authority is checked
   again at completion. Immutable results commit atomically with terminal state.
9. **Replay states its limits.** Program replay verifies every event hash, parent
   hash, version and state snapshot. Game replay validates moves against prior
   players, turns, cells and winner state. Pure execution replay reruns captured
   input and seed. Authored runtime replay proves artifact integrity only unless
   the recorded environment can be reproduced; a seeded RNG does not make clocks,
   files, architecture or external effects deterministic.
10. **Mission claims require evidence.** The God Seed mission preserves the full
    directive and deployment amendment as a typed dependency graph. Checkpoint
    prose is an author's assertion, explicitly distinct from service-verified
    state hashes. A node cannot be marked PASS before its dependencies pass and
    its evidence names immutable artifacts owned by that mission. Artifact
    existence alone does not prove a research, security or deployment claim;
    independent verification remains explicit.
11. **Secrets stay out of addresses and snapshots.** Bearer tokens are returned
    only when creating a session, never put in URLs, program state or manifests,
    and stored only as cryptographic digests. Identity-provider tokens are
    verified server-side and never persisted by the product domain.
12. **Results retain honest provenance.** Local development persistence is labeled
    development. Production requires the Supabase authority. Local execution,
    simulated independent sessions, fixture evidence, missing sandbox capability
    and missing deployment credentials must remain distinguishable. BLOCKED and
    NOT_RUN are not PASS. Existing historical projects and research are preserved.

Constitutional validity is necessary for a supported transition; it is never a
substitute for the requester's actual authority.
