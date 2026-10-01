# Composition and the transition-centric model (§23, §43)

## Epistemic ledger
* **Observed:** the field sets below come from the source on each branch, and the coverage matrix from `/transitions/coverage` on live records (2026-10-01).
* **Inferred:** the "what survives" reading.
* **Hypothesis:** C-052 (addressed transition). It is not established by this table.

## 1. Three independent constructions of "a program as a persisted artifact"

Built in separate sessions, on separate branches, without knowledge of each other:

| Property | ACSP program-001 Scroll (`src/scrolls/scroll.ts`) | circle Scroll (purl `src/circle`) | composition compute node (purl `schemas/compute-node.schema.json`) |
|---|---|---|---|
| unit | an ordered list of steps (substrate operation, or a call to an earlier Scroll version) | a SEURL move word, its prefix steps | one operation applied to 1–2 pinned operands |
| identity | `SCR-nnn` + version, inside an agent identity | PURL resource id; content_id = H(program text) | PURL resource id; `state_hash` of each operand |
| immutability | definition immutable once committed; new versions | records append-only; versions are forks | resources versioned; operands pinned by version + hash |
| composition | calls to earlier versions (depth ≤ 8) | none inside one program; transformers make new programs | operands are other nodes (a DAG) |
| evaluation | closed operation sets of registered substrates, inside ACSP | the substrate (separate process) | none by the server: the value is a **claim**, checkable by anyone |
| execution record | `executions` table | substrate execution records + PURL `builds` | none (re-evaluation by readers) |
| lineage | versions + aliases | `parent` (fork), `derived_from` (transform, build_id) | `references` links pinned to versions |
| authority | an embodied agent identity commits | the circle's principal owns; the session authors (asserted) | the creating principal owns |

**What survived all three, independently** (INFERRED, from the table): (1) the
program is *data*, never evaluated code; (2) definitions are immutable and
change by new versions; (3) references pin a **version**, not a name; (4) the
execution result is separate from the definition. **What did not survive:**
where evaluation happens (inside the continuity service, in a separate
substrate, or nowhere), whether composition is inside a program or between
programs, and whose authority commits.

That is a partial answer to §43. Independently built substrates converged on
*versioned, pinned, data-not-code* and diverged on *evaluation locus and
authority*. Three samples from one model family are not a law: the divergence is
recorded as a fact, and the convergence as INFERRED.

## 2. Transitions across record kinds (C-052, measured)

`GET /transitions/coverage` projects each kind into
`(source_ref, operation, target_ref, actor, clock, content_id)` and reports the
fraction of records that carry each field.

| Record kind | source | operation | target | actor | clock | content_id |
|---|---|---|---|---|---|---|
| PURL event | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |
| ACSP event | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 (request hash, not state hash) |
| substrate execution | 1.0 | 1.0 | 1.0 | **0.0** | 1.0 | 1.0 |
| SEURL move | 1.0 | 1.0 | 1.0 | **0.0** | 1.0 | 1.0 |
| git commit | 1.0 | 1.0 | 1.0 | 1.0 | **0.0** (DAG) | 1.0 (tree id) |
| Golden Surface action (STASIS-1 fixture) | **0.0** | 1.0 | **0.0** | 1.0 | **0.0** | **0.0** |
| circle checkpoint | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |

(Values from the dogfood circle. The ACSP row is from runs with a configured
continuity resource.)

Reading (INFERRED): the six-field form fits every kind, but **what each kind
loses is structural**. The substrate records no actor by design: values have no
authors. A SEURL move has no actor until it is committed. Git has no total
clock. The Golden Surface row's losses are partly my fixture's (D-7). So the
candidate unit "addressed transition" is a common *projection*, not a common
*nature*. C-052 stays a HYPOTHESIS. The test that could falsify it is a record kind whose
transitions cannot be expressed in the form at all. None has been found yet.

## 3. Which unit is fundamental? (§23)

Not decided. Evidence so far: every system stores **events** (transitions)
and derives states by folding them (PURL replay, ACSP versions, substrate
traces, git). That favours "transition" over "state" as the *recorded* unit.
Addresses are attached to both, so "addressed transition" adds a name, not a
new structure. The experiment that would discriminate: reconstruct a state
from transitions alone in each system, and count the systems where that
fails. PURL and git succeed (replay). The substrate does not need it (values are
recomputed from addresses). ACSP checkpoints store full snapshots, so it has
not been tested there.
