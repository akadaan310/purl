# Candidate typed semantics for executable PURLs (research proposal)

**Scope:** a minimal typed effectful fragment extending PURL/0.1, **not** a claim that the current PURL server implements a general evaluator.

## 1. Four distinct objects

1. **Address** `u`: transport locator bytes, parsed and normalized according to an explicitly versioned URL grammar. Do not place bearer secrets in it.
2. **Term** `p`: typed AST of a program; a resource URL may dereference a term but is not intrinsically a program.
3. **Denotation** `⟦p⟧`: partial relation or function on abstract domains, conditioned on declared semantics and environment.
4. **Run** `r`: an execution with principal, capabilities, timing, effects, inputs, outputs, event log and artifacts.

A person or agent given `u` can **discover** a program description. They cannot infer or acquire a `Run` permission from the address alone.

## 2. Typed language and effects

Types `τ ::= Raw | AST | Checked | Value | View | ResourceId | Event | Manifest | Artifact | ...`.

A primitive operation record is `(name, τ_in, τ_out, ε, R, version, precondition, transition)` where `ε ⊆ {pure, local, external-read, mutation, network, process}` is an effect set and `R` is a set of required rights. For practical purposes `pure` should be an empty effect set; do not treat it as a positive permission.

Typing judgment: `Γ ⊢ p : τ_in → τ_out ! ε [R]`.

**Identity:** `id_τ : τ→τ !∅ [∅]`.

**Composition:** If `p: A→B ! ε_p [R_p]` and `q: B→C ! ε_q [R_q]` then `q∘p : A→C !(ε_p∪ε_q) [R_p∪R_q]` *subject to* operation versions, dependency constraints and runtime guards. Mismatched types reject. Set union is a sound conservative rights over-approximation; conditional rights can be refined by inspecting the planned input.

**What this algebra actually supports:** type-correct chains compose associatively as syntax and (for pure denotations) as function/relational composition. Identity works. Associativity of syntax does **not** prove operations commute, side effects are reversible, or that a run is authorized. PURL's `handoff` and `merge` already demonstrate input-dependent composite requirements.

## 3. Small-step execution

Proposed configuration:

`⟨p, s, env, auth, log, artifacts⟩  --[op / observed_effect]--> ⟨p', s', env', auth', log', artifacts'⟩`

- `p` includes source, typed AST, operator versions and cursor.
- `s` includes immutable resource ID and mutable versioned state.
- `env` is a declared dependency manifest: worker/runtime, code digests, data snapshots, external reads, determinism classes and seeds.
- `auth` means authenticated principal and live grants, **not** a session's self-reported identity.
- `log` is a hash-linked sequence of protocol events / evidence; `artifacts` are content-referenced outputs with access policy.
- The transition label includes the invoking operation and the **observed effect** (which may differ from the declared effect in a buggy implementation).

**Parse rule:** `parse(raw)` produces AST or typed syntax error; no resource mutation.

**Check rule:** `check(ast, registry)` produces typed term and obligation report; no resource mutation. `check` may itself be an external read if it fetches remote modules.

**Discover rule:** `GET /r/{id}/manifest` returns a rights-filtered operation descriptor; source state remains unchanged. The result can depend on `auth`, so one resource URL has multiple authorized views.

**Propose rule:** a signed/attributed request for a proposed transition; recording it is a mutation and requires proposal permission. A proposal is not execution.

**Commit rule:** Only via POST and after schema validation, current expected version, current authority, lifecycle rules and successful primitive planning; append events atomically in the abstract state model. Concurrent invocations may fail with a version conflict. Backend crash atomicity remains an implementation obligation.

**Build rule:** fixed version of a sandboxed builder transforms typed source plus material inputs into an artifact; local file writes are effects and must be logged. A build is *not* assumed pure if it reads the network, clock or mutable dependencies.

**Execute rule:** runtime checks worker policy, operation allow-list, resource budgets, principal rights, exact code version and dependencies. Emit a run receipt and measured effects. Absence of a worker means **unavailable**, not simulated success.

**Checkpoint:** a version-bound, externally persisted continuation package with explicit producer, artifacts, tests and next operations. Claims remain claims until verified against the resource/event chain.

**Replay:** fold the same versioned deterministic reducer over complete events and initial state. If external reads/effects or hidden state are missing, replay is **incomplete** (not falsely deterministic).

**Publish:** create a discoverable registry pointer or immutable release record under explicit rights. Publishing a pointer is not authorization to execute its target.

## 4. Minimal URL-native executable mission

Proposed sample, **not a deployed address**: `https://example.invalid/r/mission-001`. At `GET`, a machine-readable manifest would include:

```json
{
  "protocol": "purl-mission/0-draft",
  "kind": "mission",
  "id": "mission-001",
  "source": {"language": "typed-mission-ast/0", "digest": "sha256:<source-hash>"},
  "state": {"version": 3, "completed_nodes": ["compile"], "ready_nodes": ["test"]},
  "operators": [{"name":"run_tests","input_type":"build-artifact","output_type":"test-report","effects":["local-process"],"requires":["execute"],"version":"sha256:<code-hash>"}],
  "dependencies": [{"name":"python","version":"3.13","source":"pinned-image-digest"}],
  "authority": {"mutation":"POST only", "credentials":"out of band"},
  "completion": {"required_artifacts":["test-report"], "predicate":"all declared tests pass"},
  "continuation": {"checkpoint_url":"/r/mission-001/continuity","next":"test"}
}
```

This is a **contract example**, not runnable by virtue of existing as JSON. The minimal viable execution addition is a trusted operator registry plus a worker adapter that enforces contracts and issues verifiable receipts.

## 5. Counterexamples and guards

- `parse ∘ render` is ill typed if `render: Value→View` and `parse: Raw→AST` (unless a specific conversion is declared).
- `grant(A,B)` followed by `revoke(A,B)` may leave a different audit history from `revoke(A,B)` followed by `grant(A,B)`. No general commutativity.
- `checkpoint` performed twice writes twice unless explicitly deduplicated; labels don't imply idempotence.
- `GET /resource?execute=yes` would violate the safe-GET contract if it actually mutated state. [RFC 9110 §9.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2).
- A hash of `add(1,2)` differs from `add(2,1)` even if they denote the same mathematical integer. Equal values do not entail equal derivations.
- A hash chain reconstructed entirely by its own operator shows **internal consistency**, not independent historical authenticity. Sign/anchor externally if adversarial tampering matters.
- A cross-provider AI session possessing a URL but not an authorized credential can legitimately read public descriptions and still fail to execute.

## 6. Identity lattice (do not conflate)

- `address_id`: content/hash of the normalized transport locator, versioned normalization policy.
- `derivation_id`: hash of typed AST + language version + operator digests (syntactic derivation identity).
- `value_id`: hash of a fully specified typed value + canonical **value encoding**; only where canonical value equality is defined.
- `execution_id`: run-specific identifier, with environment, principal, seed, event receipt and any external evidence.
- `semantic_equivalence`: proposition or proof/evidence about two terms, **never automatically established by matching hashes**.

## 7. Category-theory calibration

Pure total typed functions and types form the ordinary category `Set` (on relevant domains). Partial maps or relations require their own categories. Graded effects/rights can organize a typed program calculus, but the runtime with resource versions, changing grants and external side effects is not automatically a functor into `Set`. First exhibit objects, morphisms, identities and associative composition. No need for operads/monads until an interface problem demonstrably benefits from them.
