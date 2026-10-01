# Bridge nomenclature

Registry of record: substrateIO `research/registries/nomenclature.json` (C-037…C-053).
This page is the bridge-facing view of it. Method (from the registry): map a
term onto established concepts first. A new term earns status only through
derivation and evidence.

Epistemic ledger: identity kinds are **verified against code** (the grep and the
tests listed); edge vocabulary, stasis and clock are **definitions** (DERIVED from
existing terms); "addressed transition" and "recursive program construction"
are **hypotheses** under test (see DOGFOOD-REPORT.md, `/transitions`).

## 0. Epistemic labels (defined once; used with these meanings everywhere in circle/)

Source: substrateIO `research/registries/epistemic_statuses.json` (machine-checked by `tools.validate`).
| Label | Meaning here |
|---|---|
| ESTABLISHED | accepted in an external discipline and traceable to a source or standard derivation; this work only records it |
| OBSERVED | measured from something that exists independently of the instrument: here, this repository's recorded history and records of runs (never a model's output about a physical system) |
| DERIVED | follows from definitions by an argument written down here; computation may corroborate (e.g. `tests/test_recurrence_terms.py`) |
| SIMULATED | produced by executing a computational model; true of the model only |
| INFERRED | an interpretation of evidence; at most this strong |
| HYPOTHESIS | proposed, not yet tested, or tested without a pre-registered falsification |
| UNRESOLVED | the evidence does not decide it, or a decision belongs to someone else |
| DISPROVEN | a recorded test contradicted it; the claim and the test stay in the record |

## 1. Identity: eleven kinds that must not collapse

Verified on 2026-10-01 by searching the code of every system and by tests.

| Kind | Definition | Implemented as | Where | Status |
|---|---|---|---|---|
| **address** | the name used to reach a thing | `address_id = H({address: canonical})` | substrate `purl.py` | IMPLEMENTED, TESTED |
| **derivation** | how a value is constructed: operations, operation versions, arguments | `derivation_id = H([(op, op_version, args)])`, computable from the typed term alone | substrate `purl.py` | IMPLEMENTED, TESTED |
| **value** | the thing denoted, in the canonical form of its kind | `value_id = H({kind, canonical value})`; null when not materialized | substrate | IMPLEMENTED, TESTED (independent oracle) |
| **environment** | observed capabilities of the executing runtime | `environment_id = H(runtime, python, implementation, modules)` | substrate | IMPLEMENTED |
| **build** | source + transformer/version + target + config → artifact | `build_id` (circle program transformation, §5 of DOGFOOD-REPORT) | purl circle `programs.js` | IMPLEMENTED this phase (was MISSING) |
| **content** | bytes | `content_id = H(bytes)` of a program's source text | purl circle `programs.js` | IMPLEMENTED this phase. Before: only the checkpoint's state hash used the name |
| **execution** | one occurrence of evaluating a derivation in an environment | `execution_hash = H(derivation_id, environment_id, code_hash, occurrence)`; `execution_id` is a **store-local sequence** (`X-000001`) | substrate `purl_store.py` | IMPLEMENTED. Naming DISCREPANCY: the spec's "execution_id" is the code's `execution_hash` |
| **observation** | the result of a declared projection applied to a record | `observation_id` (sequence) + `deterministic_sha256` (wall clock excluded) | substrate `acsp_events.py` | IMPLEMENTED |
| **record** | a persisted, versioned, authority-bearing thing | PURL resource id@version; ACSP resource id@version, event `id@v` | PURL, ACSP | IMPLEMENTED (by those protocols) |
| **view** | a rendering of a record or value for one request | circle/ACSP/PURL response documents; never persisted, no id | all | IMPLEMENTED as *absence*: no view id exists, by design |
| **session** | a declared participant context | `session_id`, `assurance: asserted` | ACSP (11 files), circle | IMPLEMENTED; never inferred |

Separation invariants (each with its check):

| Invariant | Check |
|---|---|
| equal values ≠ equal addresses | `test_one_value_two_addresses` (substrateIO); bridge test `identity_kinds_stay_distinct` |
| equal observations ≠ equal derivations | the observation hash covers resource id + request hashes; bridge test `identity_kinds_stay_distinct` |
| a view never owns its object | views are not persisted (nothing to own); K-03 |
| a session is not the resource | ACSP actor vs resource id; circle author vs PURL owner |
| a record is not the value | a scroll's record id ≠ its value_id; K-11 |
| an execution is not the program | `execution_hash` ≠ `derivation_id` ≠ the program's `content_id` |
| a build does not change the source's identity | `build_does_not_change_source` (bridge test) |

## 2. Edge vocabulary (for every cross-system interaction)

| Edge | Meaning | Effect class |
|---|---|---|
| ADDRESS | name something so another system can reach it | pure |
| PARSE | text → structured term, no evaluation | pure |
| RESOLVE | address → value or record | pure (read) |
| EXECUTE | evaluate a term in a declared environment | pure for values; recorded when POSTed |
| OBSERVE | apply a declared observation function to a record | append-only record |
| PROJECT | a total map between representations with declared loss | pure |
| RECORD | append to a store | append-only |
| PUBLISH | make a record visible to other sessions (ACSP propose) | append-only, authority-bounded |
| HANDOFF | move task responsibility (ACSP) | append-only, never authority |
| RECONSTRUCT | rebuild a state from records alone | pure over records |
| REPLAY | re-derive states from an event log and compare hashes | pure |
| FORK | new record derived from another; parent untouched | append-only |
| BUILD | source + transformer → new artifact with build_id | pure transformation; recorded |
| PERTURB | targeted change to a state or structure, compared with the unperturbed one | pure value; SIMULATED |

Every edge in `bridge-manifest.json` carries one of these.

## 3. Perturbation (unified record; implementations stay separate)

`{target, perturbation, parameters, pre_state, post_state, environment, observation, comparison}`.
SEURL `PERTURB/b` and substrate `flip/b` produce the same record (pre/post =
value_ids of the unflipped and flipped state). Substrate `rewire/s/d` is a
structural perturbation of a map. `damage/h` is the comparison. Projection:
circle `GET /scrolls/{id}` → `perturbations` (DOGFOOD-REPORT §4). Status: SIMULATED,
always.

## 4. Clock

From existing terms: C-005 (transition event, logical time t), C-035 (logical vs
wall-clock time), ONTOLOGY "observation = map + recording + clock".

* **clock domain**: one totally ordered counter owned by one system: ACSP
  resource version, PURL resource version, substrate execution sequence, a
  trace's step index t, SEURL move index, Golden Surface `twinRev`/`phoneRev`.
* **clock position**: `(domain, position)`.
* **clock transition**: position n → n+1, caused by exactly one recorded event.
* **clock projection**: a map from one domain to another. *There is no global
  clock.* Across domains, order is only partial, induced by references (a TOK
  that cites a scroll version is after it). This is Lamport's happens-before
  (established, 1978). Git commits form a DAG, not a counter.
* **clock observer**: the system that records the position (always the owning one).
* Wall-clock time is an observation of an instrument, never a clock position.

## 5. Stasis

**STASIS-n** = the tuple (commit of every repository, deployment commits, active
checkpoint, constitution content id, registry state) at a declared boundary.
Mapped term: an SCM **baseline** across repositories (established). It is
distinct from substrateIO's research state R_i (single repository, research
operations only). Registry C-049. Defined instances: `circle/stases.json`
(STASIS-0 pre-bridge, STASIS-1 circle, STASIS-2 this phase).

## 6. Cold reconstruction test

Stop every process → delete transient state → clone committed refs → install
from lockfiles → restart → verify hashes → replay logs → rerun tests → compare
with the prior checkpoint. Mapped terms: clean-room/hermetic rebuild +
event-sourcing replay + reproducible build (all established). Registry C-051.
Implementation: `scripts/bridge-cold-reconstruct.js`.

## 7. Terms in conflict (not resolved by renaming)

| Term | Definitions found | Decision |
|---|---|---|
| Scroll | ACSP program-001 (immutable versions in an agent identity); circle (PURL resource holding a SEURL program); luna-foundry (text window); MUSA (sealed memory page) | Keep C-042 PROVISIONAL and qualify every use: "circle Scroll", "program-001 Scroll" |
| SEURL | move words (circle); `seurl://golden/…` resource addresses (golden-surface engine) | Two terms: **SEURL move word** (C-043), **seurl:// address** (Golden Surface namespace) |
| bridge | circle (purl session branch); composition (purl+ACSP 0.2); golden-surface `POST /bridge` (agent loop with a decider) | "the bridge" in these documents means the circle only |
| constitution | MUSA v1; COP directive; circle constitution-v1; ACSP PROTOCOL invariants | one methodology (BRIDGE-CONSTITUTION.md), several artifacts |

## 8. New registry entries this phase

C-047 identity decomposition (eleven kinds) · C-048 bridge edge vocabulary ·
C-049 stasis · C-050 clock domain · C-051 cold reconstruction test ·
C-052 addressed transition (HYPOTHESIS) · C-053 recursive program
construction under explicit transition rules (HYPOTHESIS).

## 9. Conflict register (STASIS-3 phase 2)

| Term | Senses found | Resolution | Status |
|---|---|---|---|
| attractor / closed class | substrateIO C-011 "attractor (periodic orbit)" = cycle of a functional graph; purl NOMENCLATURE rejects "attractor" for empirical graphs, uses "closed class" | **scope, not error**: on functional graphs cycles = bottom SCCs = recurrent states (verified exhaustively for all 256 maps on 4 states, plus 300 random maps); on general graphs they differ (two counterexamples). C-011 scoped to deterministic maps (revision entry); C-054 "closed class" added as the general term | DERIVED (test `tests/test_recurrence_terms.py`) |
| "recurrent natures" (operator) | — | no new term: C-054 (closed class) and C-011 (periodic orbit) cover it; recurrence across programs is C-044 | DERIVED |
| Scroll | ACSP program-001; circle; luna-foundry (text window); MUSA (sealed page) | qualified senses `scroll@acsp-p001`, `scroll@circle`, `scroll@luna-foundry`, `scroll@musa`. No rename: `/scrolls` is a live route, and renaming would erase history. The SDK states the sense it means | UNRESOLVED (which sense becomes canonical is the owners' call) |
| SEURL | move words; `seurl://golden` addresses | two terms: C-043 *SEURL move word*; *seurl://golden address* (Golden Surface namespace) | DERIVED from code |
| bridge | circle; composition (ACSP 0.2 + purl compute); golden `POST /bridge` | "the bridge" = the circle in these documents | declared |
| constitution | MUSA v1; COP directive; circle v1; protocol invariants | one methodology, several artifacts (BRIDGE-CONSTITUTION.md) | declared |

## 10. Is the 12-field term schema the right one? (measured: `circle/nomenclature/schema-fit.json`)

Over the 53 registry terms:
* 6 of the 12 proposed fields (OPERATION, INPUT, OUTPUT, INVARIANTS, VALIDATION METHOD, IMPLEMENTATION) had **no slot** (coverage 0.0).
* EVIDENCE was filled for 0.32 of terms and non-examples for 0.075.
* The registry carries fields the schema lacks, and they matter: **status** (stops terminology outrunning evidence), **term_class**, **notation**, **examples**, **non-examples**.

INFERRED: one schema does not fit all terms. The categories split into
*operational* terms (method, measurement, measure, perturbation, map, artifact:
21 terms), for which operation/input/output/invariants/validation/implementation
are meaningful, and *relational/structural* terms (relation, representation,
structure, dynamics, meta, physical, provenance, observation, dependability:
32 terms), for which those fields are empty by nature. Adopted practice:

* **core profile (every term):** name, domain/derivation, definition, notation, related and competing terms, established counterparts, examples, non-examples, status, term_class, history, scope.
* **operational profile (operational terms add):** operation, input, output, invariants, validation_method, implementation.

Applied to the operational bridge terms C-042…C-044 and C-051…C-053. Whether
the profiles help a fresh participant reconstruct the structure is measured in
the observation-arrow experiment (condition with nomenclature exposure).
