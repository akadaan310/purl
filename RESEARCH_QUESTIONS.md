# Unresolved research questions

Each question states what is unknown, why it matters, and what would
answer it. Questions arising from exp-0001 cite the report section.

## Protocol

**Q-P1 · Is the primitive set minimal under a different criterion?**
docs/operations.md argues minimality by (mutated field, required right,
algebraic behaviour). If rights were attached to *fields* instead of
primitives, `grant`/`assign`/`transfer` might collapse into a field-scoped
`patch`. Would that be simpler, or would it make attenuation harder to
reason about? *Answer by:* implementing field-scoped rights on a branch
and comparing the authority tests.

**Q-P2 · Should grants survive ownership transfer?** Currently they do;
the new owner can revoke. Alternatives: root grants are voided on
transfer; or transfer requires the recipient to accept a grant list.

**Q-P3 · Consent to receive.** Handoff and grants do not require the
recipient's acceptance. Should `assign` be two-phase (offer → accept),
using `acknowledge` as the acceptance?

**Q-P4 · Cross-instance references.** How can a resource reference one on
another instance *without the server dereferencing URLs* (SSRF)? Content
hashes (`state_hash`) allow verification by clients that fetch both;
is that enough, or are signed events required?

**Q-P5 · Signed events and principal keys.** Hash chains show internal
consistency but not who wrote them if the server is dishonest. What is the
minimum signing scheme (per-principal keys, HTTP message signatures) that
keeps the protocol simple?

**Q-P6 · Snapshots.** `state?at=` replays from genesis (O(n)). When do
snapshots become necessary, and can they be verified against the chain
cheaply?

**Q-P7 · Name collision.** "PURL" is already used (Persistent URLs;
package-url in SBOMs). Rename before any wider use?

**Q-P8 · Merge beyond direct forks.** Merge requires one resource to be
`derived_from` the other. General merges need a common-ancestor search
across lineage, and JSON Merge Patch cannot set a value to `null` (RFC 7396
limitation).

**Q-P9 · Is self-description useful beyond `/.well-known/purl`?** The
protocol resource gives protocol changes an event history and lets any
PURL client read the vocabulary. Does any client actually use it
differently from the well-known document? (ADR 0004.)

**Q-P10 · Do agents in practice use the manifest?** The demo client does
by construction. Whether independent LLM-based browsing agents discover
operations from `rel="describedby"` and embedded JSON, without being told,
is untested. *Answer by:* a controlled study with agents given only a URL.

## Continuity

**Q-C1 · Does a Communication Profile change anything measurable?**
Compare `purl.stylometry/0.1` features of a recipient's output with and
without a transferred profile, against the profile's own `measured`
block. Until then, profiles are specifications with unknown effect.

**Q-C2 · What should a continuity package minimally contain?** The
current fields are a design guess. An empirical answer would compare task
success after handoffs with different package subsets.

## Research substrate (from exp-0001)

**Q-R1 · Phase-invariant convergence (REPORT §5, H8).** Exact-string
comparison of grammar rules missed convergence that exists modulo cyclic
rotation. Pre-register a rotation- or substring-aware metric (and its
i.i.d. baseline) in exp-0002.

**Q-R2 · Multiplicity-corrected period detection (REPORT §6.1).** Replace
the per-lag 2/√n band with a family-wise band (or a surrogate-based
threshold on max r(τ)), and prefer the fundamental over harmonics.

**Q-R3 · Variance of order-1 statistics under hidden slow dynamics
(REPORT §5, H2).** Report sampling uncertainty for transition-matrix
entries using a block bootstrap whose block length adapts to the mixing
time, rather than binomial variance.

**Q-R4 · Operation-level projections (REPORT §5, H10).** The `kind`
projection merges five operations into `append`. Add an `op` projection
(operation names) and restrict boundary tests to multi-event invocations,
where the random baseline is not near 1.

**Q-R5 · Structure in real logs beyond composition rules.** The only
sequential structure found in the PURL workload was first-order and put
there by the workload generator and composite operations. Do logs from
*real* multi-agent use show structure beyond first order — and does it
survive a surrogate that preserves operation-level Markov statistics?

**Q-R6 · Hierarchies of representation.** The brief hypothesises that
transitions → motifs → symbols → grammars → compositions yields
increasingly expressive structure. exp-0001 found each step to be an
established transformation whose outputs are sensitive to representation
choices (order, phase, projection). What observable would distinguish
"a higher-level structure exists in the process" from "a higher-level
description was imposed by the analysis"? Candidate: statistical
complexity / ε-machines (Crutchfield) estimated with CSSR, which infer the
minimal predictive state space rather than a compression grammar.

**Q-R7 · Time and symbols jointly.** Symbolic and temporal structure were
independent in exp-0001 by construction (H6). Real transition streams may
couple them (e.g. faster transitions after authority changes). Joint
models (marked point processes, Hawkes processes) are the established
starting point.

**Q-R8 · What counts as convergence across *implementations*?** The brief
asks which structures converge across different implementations. The
current substrate compares datasets, not implementations. A test would
run two independent PURL servers (or two projections) on the same
workload and compare invariant measures only (those passing H7-style
invariance checks).

## Composition (from exp-0002)

**Q-X1 · Should PURL have a content-addressed view?** The state hash commits
to the whole record (id, timestamps, owner, grants, relations), so equal
values, equal expressions and equal operand pins never share it (exp-0002
H3, H9). A value-only or structure-only hash would let independent builders
recognise the same result; it would also make results linkable across
principals, which the per-record hash does not. *Answer by:* adding a
server-computed `content_hash` of `state` alone to the event (additive
field) and re-running E1–E8.

**Q-X2 · Is declared idempotence of `link` the right claim?** A repeated
identical `link` leaves `relations` unchanged but appends an event, advancing
`version` and `updated_at` and so the state hash (exp-0002 E9, exploratory).
Either the manifest should say "idempotent in `relations`, not in the log",
or the plan should emit no event when the relation exists (as `append` with a
known entry id already does). *Answer by:* deciding which, and adding a test.

**Q-X3 · Transitive staleness.** After an operand changes, only its direct
dependents have a pin behind their operand's head; nodes further up look
fresh locally (exp-0002 H10). Detecting staleness needs a traversal of the
cone. Is a server-side "stale because" projection over `inbound` relations
worth adding, and can it stay cheap?

**Q-X4 · Early cutoff.** A dependent whose value does not change still gets a
new identity and state hash when recomputed (Y in exp-0002), so its own
dependents must be re-pinned. Pinning by value hash instead of state hash
would allow cutoff but lose the binding to a specific record. Which does a
continuity protocol want?

**Q-X5 · Server-attested evaluation.** The server stores computed values as
claims; only re-evaluation detects a wrong one (the wrong-node fault). Would a
server-side, deterministic, registered evaluator (a new operation) be worth
its cost to the "names are never evaluated" rule? What would it attest to
that client replay does not?

**Q-X6 · Cross-instance pins.** exp-0002 kept operands and results on one PURL
instance, and the agents checked `same_instance`. A pin to a resource on
another instance can be verified by a client that fetches both (Q-P4), but
nothing stops that instance from rewriting history. What would a
cross-instance pin need (signed heads, witnesses)?

**Q-X7 · Would LLM agents follow the verify-before-build procedure?** The
exp-0002 agents are deterministic programs. Whether a language-model agent
given only the ACSP URL discovers, performs and records the same checks is
untested.
