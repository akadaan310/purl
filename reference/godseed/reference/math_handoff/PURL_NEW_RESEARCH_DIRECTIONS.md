# New research directions — independently prioritized

## Priority 1 — A proof-obligation compiler for mission graphs

A PURL mission node should be more than `(verb, args)`. Give each node `(input type, output type, capability demand, effect row, operator digest, preconditions, completion predicate, dependency witnesses)` and require signed or at least traceable execution receipts. This is an application of effect systems, workflow DAGs and proof-carrying evidence—not a new mathematical language by itself.

**Smallest implementation experiment:** a pure `eval`/`transform` registry with types `Raw→AST→Checked→Value`. Reject unknown operators, mismatched types and grants; compare with a naive agent which treats all operation names as valid. Then add a single sandboxed `build` node with strict resource budget. Keep live endpoints disabled for research until authorization tests pass.

## Priority 2 — Projection/congruence checker for PURL research

Build a bounded checker that takes `(state domain, operations, projection)` and reports witnesses when a projected deterministic operation is ill-defined. Extend to nondeterministic labeled systems with relation compatibility. This uses CGT's LTS framing, the existing PURL event projections and SubstrateIO's map/projection code. It materially prevents invalid "compressed history = executable grammar" promotions.

**Baseline:** simply build an n-gram or Re-Pair compressed representation; count how often it falsely suggests a deterministic next move. **Metric:** counterexample detection and retained-state overhead.

## Priority 3 — Versioned replay certificates

For pure segments record: typed AST digest, operator versions, input digest, output digest, cost bounds, seed and reproduced result. For external reads: recorded response digest, time, origin, freshness, authorization scope and replay policy. For stateful effects: append-only operation intent and observed receipt, with compensation or irreversibility explicit. Distinguish *simulation of replay* from *reissuing effects*, since replay must never send another email, charge twice or execute duplicate shell writes merely to verify a log.

**Test:** sabotage an environment variable, package version or external response and show that verification either rejects or classifies the replay as incomplete. Do not silently report success.

## Priority 4 — Cross-session blind benchmark

Three arms with same tasks and tools:

- A: one long natural-language prompt / checklist;
- B: static DAG/JSON task page;
- C: PURL mission manifest with live auth, events, checkpoint and typed worker.

Randomize independent fresh clients. Give no private predecessor transcript. Score structural reconstruction, lawful next step, authorization violations, artifact quality, reproducibility, recovery after interruption, token/tool cost, and false success claims. This is the decisive product-relevant experiment. If C does not beat simpler baselines on an important dimension, keep PURL simple.

## Priority 5 — Identity/provenance model

Separate address/derivation/value/run namespaces; require explicit transformation receipts and anchored checkpoint policy. Incorporate W3C PROV terms where meaningful (`Entity`, `Activity`, `Agent`), but avoid fictitious certification of model identity or private-memory continuity. Public credentials stay out of URLs; rights remain revocable and bound to authenticated principals.

## Priority 6 — Borrow computation from SubstrateIO without coupling

Expose a read-only adapter from PURL to a pure named operator registry (e.g. a bounded cellular automaton, orbit/traces, projection). Use a schema mapping `SubstrateIO.Operation(applies_to,yields,effects)` to PURL typed operator descriptors. Use operator source digests and explicit unsupported/materialization statuses. Crucially, do not map "KNOWN but not MATERIALIZED" to falsehood or unavailable permission.

## Risks worth tracking

1. **Protocol drift:** ACSP, PURL and SubstrateIO use superficially similar but non-equivalent verbs and IDs; test adapters against the exact versioned contracts.
2. **False replay:** external effects are not reversible and local hash verification is not a third-party timestamp or signature.
3. **Overclaim:** a machine-readable manifest improves discovery but has no special powers over a conventional API until measured.
4. **Prompt injection:** the content of PURLs is untrusted instructions to an agent; discovery of a string is never authorization to obey it.
5. **Resource escalation:** arbitrary URLs, file writes, shells and external network tools require explicit allowlists and worker isolation.

## Suggested milestones

**M0 — Math/checker:** toy type, quotient, identity and replay tests (included here, 17 pass).

**M1 — Protocol extension:** formal `purl-mission/0` schema + validator and pure run receipts on a *new branch*; independently reproduce 58 original PURL tests before integration (reported count only).

**M2 — Restricted worker:** one hermetic build, explicit effects and artifact receipts, version/authority checks, abort semantics, replay verification.

**M3 — Fresh-provider trial:** discover only via URL, with credentials delivered out of band; compare to simple baselines. Make outcomes and failures public as claims with reproducible artifacts.

**M4 — Publication decision:** if gains are measurable, publish a focused methods paper and possibly a book chapter. Otherwise no independent field/book claim.
