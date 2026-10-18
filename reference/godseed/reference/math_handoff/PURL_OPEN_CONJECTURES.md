# Open problems and falsifiable conjectures

No new field or theorem is claimed. Some of the following may reduce to known programming-language semantics, automata theory, distributed systems or security results. Literature search is a release gate for any priority claim.

| ID | Question / candidate hypothesis | Test / falsifier | Status |
|---|---|---|---|
| POC-01 | A restricted typed PURL mission has a decidable static effect-safety judgment. | Define restricted language and complete rules; supply counterexample to soundness or finite decision procedure. | **OPEN**, standard effect-system theory relevant |
| POC-02 | Projection of event traces can produce a sound transition program in a decidable bounded fragment. | Enumerate quotient congruence on finite state spaces; demonstrate hidden-state counterexample. | **PARTLY RESOLVED** by classical congruence condition, not novel |
| POC-03 | A discoverable program URL enables a cross-provider session to resume without prior dialogue. | Blind trial: give only URL and authorized out-of-band credentials; evaluate reconstruction/completion vs prompt/DAG baselines. | **NOT RUN** |
| POC-04 | Attenuated delegation + event provenance make fresh-session workflows safer than prompt sharing alone. | Threat-modelled red-team suite: unauthorized operation rate, overbroad grants, provenance omissions, revocation latency. | **NOT RUN**, advantage unestablished |
| POC-05 | Typed mission compression reduces token usage or error rate without losing recoverability. | Compare prompts, textual checklists, DAG manifests, mission compiler across varied tasks and budgets. | **NOT RUN**, no benefit assumed |
| POC-06 | A finite verified transition-summary monoid improves repeated URL fragment evaluation asymptotically or practically. | Specify growth variables and workload; benchmark vs naive interpreter with preprocessing cost and updates. | **OPEN**, classical algebra likely sufficient |
| POC-07 | New grammar can be *causally* induced from transition logs. | Hold out intervention traces; compare causal intervention predictions to n-gram compressor and LTS learner. | **OPEN**; observational correlation not causation |
| POC-08 | Identity namespaces (`address`, `derivation`, `value`, `execution`) prevent provenance mixing. | Implement typed API and independent migration; count mix-ups vs old single-ID approach. | **OPEN**; architecture hypothesis |
| POC-09 | Canonicalization + external transparency checkpoint is sufficient for a practical tamper-evidence threat model. | Adversarial server rewrites full log; independent witness rejects it, including key rotations. | **OPEN**, standard trusted-log techniques |
| POC-10 | Operator versions and captured external reads suffice for deterministic replay of a specified pure/recorded fragment. | Test rerun across runtimes/platforms with exact mathematical and machine semantics; find mismatch. | **OPEN**; necessary set of captured inputs must be explicit |
| POC-11 | A general "minimal sufficient continuation package" has a task-independent minimal representation. | Exhibit two tasks with incompatible sufficient statistics / private hidden dependencies. | **CURRENTLY UNLIKELY**; scope to a task family |
| POC-12 | SubstrateIO pure address grammar can embed into PURL mission DSL while preserving pure denotation and epistemic labels. | Specify adapter and homomorphism; test unknown/materialized distinctions and refusal behavior. | **OPEN** |

## Constraints on claims

- If a conjecture is already a theorem of automata, algebra, PL, event sourcing or security, record its origin as **classical** and stop calling it novel.
- "Conformance" requires a real runtime/service and independently specified oracle, not a toy that reuses its own rules.
- Observable sameness is relative to observers; unbounded all-context equivalence is not normally computable.
- Authorization is a runtime fact, not a mathematical property inferred from an address string.
- A research claim does not become true by inclusion in a manuscript, benchmark or rendered demonstration.
