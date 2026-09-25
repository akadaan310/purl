# Nomenclature

Rule: before a term is introduced, the repository and established
vocabulary are searched for an equivalent. **Most PURL terms are
established terms used in their established sense**; they are listed so
their scope in PURL is explicit. Genuinely new coinages are marked
**[new]** — there are three.

Each entry: *type* · *scope* · definition · relationship to existing
terminology · motivation · example · non-example.

---

### Resource
*noun · Layer 0/1* — An addressable, versioned, stateful object identified
by `/r/{id}`, whose state is the fold of its event log.
**Relation:** REST resource (Fielding 2000); here additionally versioned,
event-sourced and authority-bearing. **Motivation:** the web's word for
"thing a URL identifies". **Example:** `/r/r_7F82K…` of type
`research-session`. **Non-example:** a static HTML page (no version,
operations or history).

### PURL
*noun · all layers* — (1) The protocol; (2) informally, a URL that
identifies a PURL resource. **Relation:** unrelated to the "Persistent
URL" (purl.org) service and to the "package URL" (purl) spec used in SBOMs.
**This name collision is acknowledged**; see RESEARCH_QUESTIONS.md Q-P7.

### Principal
*noun · Layer 1* — An account on an instance that can authenticate and
act. Kinds: `human`, `agent`, `service`, `instance`. **Relation:**
security principal (standard). **Non-example:** a model, person or
process — a principal is the account they act through; many sessions may
share one, and one session may hold several.

### Right
*noun · Layer 1* — An atomic permission (`observe`, `read`, `append`,
`update`, `assign`, `link`, `lifecycle`, `grant`). **Relation:**
permission / privilege (access-control literature). **Example:** `append`.
**Non-example:** `owner` (a position, not a right).

### Role
*noun · Layer 1* — A named bundle of rights (observer, reader,
contributor, operator, owner). Carries no power itself. **Relation:**
RBAC role, weakened: PURL checks rights, never role names.

### Grant
*noun · Layer 1* — A record giving a principal (or `*`) a set of rights,
optionally restricted to operation names and an expiry, with a `parent`
grant. **Relation:** ACL entry + capability-style attenuation (macaroons,
UCAN, SPKI). **Non-example:** a token — grants are server-held and bound to
a principal id, not bearer objects.

### Authority source
*noun · Layer 1* — One way a principal holds authority over a resource:
`owner`, a `grant` (with chain), a `public` grant, or `admin`.
**Relation:** no standard single term; closest is "basis of authority".
Chosen as a plain descriptive phrase. **Example:** "C acted via grant
g_2, chain g_2 → g_1".

### Delegation chain
*noun · Layer 1* — The path of `parent` links from a grant to its root.
**Relation:** certificate/capability chain; UCAN proof chain.

### Attenuation
*noun · Layer 1* — The rule that delegated authority can only narrow.
**Relation:** established (object-capability, macaroons).

### Event
*noun · Layer 1* — Immutable record of one primitive state transition,
hash-chained. **Relation:** event sourcing (Fowler); W3C PROV *Activity*
with `actor` as *Agent* and resource versions as *Entities*.

### Primitive
*noun · Layer 1* — One of nine event kinds that the reducer understands.
**Relation:** "primitive operation" in its ordinary algebraic sense.

### Operation
*noun · Layer 1* — A named, invocable action in the protocol vocabulary;
classified as primitive, composition, alias or projection.

### Invocation
*noun · Layer 1* — One call of an operation; all its events share an
invocation id and are applied atomically. **Relation:** transaction /
command (CQRS).

### Projection
*noun · Layer 1 & 2* — (a) A safe, derived view of a resource (`diff`,
`lineage`); (b) in Layer 2, a documented function from an event list to a
symbol sequence. **Relation:** event-sourcing projection; in (b) also the
"symbolic encoding" of symbolic dynamics. Both senses are "a function of
the event log", which is why one word is used.

### Checkpoint
*noun · Layer 1* — An entry binding a continuity package to a verified
`(resource, version, state_hash)`. **Relation:** checkpoint (databases,
distributed snapshots) — here a logical, not physical, snapshot.

### Continuity package
*noun · Layer 1* **[new, compound]** — The selected state carried
between sessions: task, objective, findings, assumptions, open questions,
constraints, requested operation, optional profile. **Relation:** handoff
note / shift report (operations practice); "context transfer". No
existing term separates the *claims* in the package from the
*server-verified* checkpoint, which is the reason for the term.
**Non-example:** a copy of a conversation or of model state.

### Handoff
*noun/verb · Layer 1* — Transfer of responsibility for continuing work
(`assignee`) with a checkpoint and optional delegated grant. **Relation:**
handoff (clinical and operational practice). **Non-example:** ownership
transfer (`transfer`), merger of principals.

### Communication Profile
*noun · Layer 1* **[new, compound]** — A specification of observable
communication characteristics, declared and/or measured. **Relation:**
register (sociolinguistics), stylometric profile (computational
linguistics), style guide. None covers "declared + measured, kept apart,
explicitly not identity". **Non-example:** a persona, a model, a memory.

### Supersession
*noun · Layer 1* — A later entry or resource declaring it replaces an
earlier one, without deleting it. **Relation:** "supersedes" in standards
bodies (RFC obsoletes/updates) and records management.

### Lineage
*noun · Layer 1* — Ancestors, descendants and relations of a resource.
**Relation:** data lineage; PROV `wasDerivedFrom`.

### Epistemic category
*noun · Layer 2* — One of observation, transformation, interpretation,
hypothesis, conclusion. **Relation:** standard distinctions in scientific
method; "transformation" is used rather than "analysis" because the
outputs are deterministic functions of the observations.

### Closed class
*noun · Layer 2* — A strongly connected component of a transition graph
with no outgoing edge. **Relation:** closed communicating class (Markov
chains); bottom SCC (graph theory). **Motivation:** used *instead of*
"attractor", which the brief proposed — "attractor" belongs to continuous
dynamical systems and would overstate what a finite empirical graph shows.

### Entropy profile
*noun · Layer 2* — The sequence (H_L, h_L) for L = 1…L_max. **Relation:**
block entropy and conditional entropy (Shannon); "entropy profile" is an
informal but common label.

### Grammar signature
*noun · Layer 2* **[new, local]** — The top-coverage Re-Pair rules (length ≥
6) used to compare datasets. A working label for one experiment's
comparison object, not proposed as general terminology — and shown in
exp-0001 to be phase-sensitive.

### Boundary artefact
*noun · Layer 2* — A closed class or run that exists only because
observation started or stopped where it did. **Relation:** edge / censoring
effect (statistics).

---

## Terms from the brief deliberately *not* adopted

| Proposed idea | Why not |
|---------------|---------|
| "attractor" for recurrent graph structure | Overstates; use closed class (above). |
| "intelligence" for any measure | No measure here measures it. |
| "transition velocity" | Rate (changes per unit time) is the established term; "velocity" implies a vector. |
| "persona transfer" | Implies identity transfer; replaced by Communication Profile with a mandatory disclaimer. |
| New names for entropy rate, LZ complexity, burstiness | Established names used. |
