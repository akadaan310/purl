# Grammar compiler recommendations — what to import and what to refuse

## Proposed narrow compiler architecture

`URL parse → canonical transport address → AST parse → type/effect check → resource+version check → discover legal operators → dynamic authorization → deterministic plan → permitted worker execution → signed/anchored receipt where needed → append events → checkpoint`.

The compiler is **not** a URL fetcher that interprets arbitrary prose. It accepts a finite, versioned typed operator vocabulary. The PURL/0.1 manifest stays the transport/discovery contract; the mission runtime is a *new explicitly versioned extension*.

### Suggested term grammar (not implemented)

```ebnf
mission     = "mission", resource_id, version, graph ;
graph       = node, { node }, edge, { edge } ;
node        = node_id, ":", op_id, "@", op_version, input_bindings, completion_predicate ;
edge        = node_id, "->", node_id, type_constraint ;
operation   = input_type, "->", output_type, effects, required_rights, determinism ;
```

Use AST/JSON schemas for production encoding. EBNF is explanatory only. Operators may refer to registries verified by digest; unknown operators are **not** eval-ed. For a graph, nodes are enabled only after predecessors' completion receipts verify, and any dynamic version/capability guard still passes.

## SEURL's seven verbs (no false equivalence)

| SEURL label | Possible PURL counterpart | Decision | Caveat |
|---|---|---|---|
| `START` | `create` or `reopen` | **Derived macro, parameter-dependent** | Creating a resource differs from reopening one |
| `SWITCH` | `assign`, `handoff`, or client-only focus change | **Ambiguous; split** | Switching UI context needn't mutate shared state |
| `WRITE` | `append` vs `update` | **Derived, typed overload** | Appending immutable entry differs from merge-patch |
| `COMMIT` | `checkpoint` vs mutation commit | **Rename or disambiguate** | One is an evidence artifact, the other a transaction boundary |
| `BUILD` | new worker `build` | **Experiment** | PURL/0.1 does not establish generic sandbox build execution |
| `TALK` | `append` message/annotation or external communication | **Keep separate** | Network calls require separate explicit authorization |
| `PERTURB` | SubstrateIO pure mathematical perturbation or external action | **Research-only** | A mathematical perturbation is not permission to modify another service |

Do not deploy a separate SEURL protocol. Retain its static-page work as an affordance-design reference; map historical entries with an explicit migration function only where semantics agree.

## Laws the compiler should enforce or test

| Law | Applicable fragment | Necessary guard |
|---|---|---|
| `id ∘ f = f = f ∘ id` | Typed pure operations | Identity has no effects or hidden mutation |
| `(h ∘ g) ∘ f = h ∘ (g ∘ f)` | Pure typed denotations, well-formed composition | Compatible types; same environment and versions |
| Effects and rights under composition join by set union | All syntactically typed chains as conservative requirements | Does **not** grant the union to the caller |
| Parallelism/reordering | Independently commutative operations only | Read/write sets, state invariants, locks or explicit commutation proof |
| Idempotence `f(f(x))=f(x)` | Only declared/tested operation | `append` and `handoff` are not idempotent by default |
| Termination | Acyclic mission DAG or measure-decreasing recursive fragment | A finite graph may still call nonterminating code |
| Confluence | Rewrite fragment with checked joinability | Critical-pair checks; no generic claim for effectful histories |
| Program equivalence | Decidable restricted fragments only | No generic semantic hashing |

## Canonicalization policy

Normalize URI transport bytes using a specified URL policy; normalize typed AST with a versioned serialization; keep canonical-value IDs separate; preserve original historical spelling for provenance. Use digest algorithms for collision resistance operationally but never infer semantic equality from digest equality. Content address code *with its versioned dependencies*, not only user-written source text.

## Admission tests before making a trace-derived operator

1. **Type safety** — source/target types match and exceptions are explicit.
2. **Congruence / abstraction soundness** — projection-equivalent states remain equivalent after each operator; else record hidden state or reject.
3. **Definedness / inverse fiber** — distinguish no solution, unique and multiple only where a concrete operation relation is defined.
4. **Effect coverage** — no unrecorded reads, process spawns, writes or networks.
5. **Determinism claim** — rerun under captured environment; a single matching trace is insufficient.
6. **Authority** — evaluate rights at the moment of execution, not only at publication.
7. **Replay / provenance** — record complete inputs, versions, receipts and side-effect evidence.

## Decision matrix

| Candidate | Verdict | Why / acceptance test |
|---|---|---|
| PURL/0.1 resource manifest and safe HTTP separation | **IMPORT NOW** (retain) | Existing code and `http.test.js`; validate against actual hosted service before launch |
| CGT LTS/relational composition for pure operators | **IMPORT NOW** | Well-scoped, standard algebra, straightforward property tests |
| GiN four-layer errors + value/representation distinction | **IMPORT NOW** | Prevents wrong claims and misleading IDs |
| GiN converse cardinalities | **EXPERIMENT** | Useful for partial inverse/undo only when domain relation is specified |
| Typed mission DAG + worker execution receipts | **EXPERIMENT** | Needs new server/worker/authority integration, budget and independent session test |
| SubstrateIO pure path evaluator as sublanguage | **EXPERIMENT** | Has typed registry and known purity claims; adapter/version agreement required |
| CGT finite transition monoid optimization | **EXPERIMENT** | Only for proven finite summaries and measured benefits vs baseline |
| ACSP direct database merger | **KEEP SEPARATE** | Different actor IDs, grants, protocol envelopes and lifecycle rules |
| SEURL seven verbs as new universal primitives | **REJECT** | Semantic ambiguity, unsupported authority/execution assumptions |
| Semantic identity by canonical URL hash | **REJECT** | Different terms can denote same value; arbitrary equivalence undecidable |
| Mutation triggered by GET/prefetch | **REJECT** | Violates HTTP safety and PURL's own security invariant |
| Generic "trace compressed = executable" conversion | **REJECT** | Counterexample: lossy projection not a transition congruence |

## Implementation order

1. Freeze a `purl-mission/0` schema and exact effect/right vocabulary. Test parser/checker on fixtures independent of the runtime.
2. Add a **pure-only** operator registry with deterministic execution and artifact digests; no shell/network first.
3. Add an isolated worker interface that records declared vs observed effects; limit time, memory, network, files and parallelism.
4. Integrate PURL `expected_version`, actor/authority, checkpoints and continuity; keep the authorization source single and auditable.
5. Test true fresh-session reconstruction with independent clients and credentials passed out of band.
6. Benchmark against naive static prompt, ordinary DAG/workflow engine and a manifest-driven client. Ship only on demonstrated advantage and passing security gates.
