# ADR 0003 — Event sourcing over ordinary state storage

Status: **accepted**.

## Question
Store current state and append an audit log beside it, or make the log
the source of truth and derive state?

## Decision
Event sourcing: the per-resource event log is authoritative; state is the
left fold of a pure reducer; the store caches the latest state.

## Reasons
1. **Lineage must be reconstructable** (brief §13, §23). With an audit log
   beside mutable state, the two can diverge; with event sourcing,
   divergence is detectable by replay (`verify`).
2. **State hashes before/after each event** make each transition
   independently checkable, including by clients (`PurlClient.reconstruct`).
3. **The log is the research substrate.** Layer 2 needs time-indexed
   transitions; event sourcing produces exactly that as a by-product.
4. **Time travel and diff** fall out (`state?at=`, `diff`).

## Costs
- Replay is O(n) per historical read (no snapshots yet; RESEARCH_QUESTIONS
  Q-P6).
- Schema evolution of events must be handled by the reducer forever.
- "Previous state / resulting state" from the brief are stored as hashes,
  not copies; full states are reconstructed by replay. This keeps events
  small and makes tampering with stored copies impossible by design.
