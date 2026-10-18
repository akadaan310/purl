# Independent findings, proofs, counterexamples and uncertainty

**These are chiefly classical consequences and concrete engineering diagnoses, not claims of new mathematics.** They are evaluated independently of the proposed product vocabulary.

## Finding 1 — Exact criterion for compiling projected transitions (classical)

Let `X` be a state set, `δ:X→X` a deterministic operation, and `π:X→Y` a projection. A deterministic function `δ̄` on the *reachable image* `π(X)` satisfying

`π(δ(x)) = δ̄(π(x))` for all `x∈X`

exists **if and only if** the equivalence induced by π is preserved by δ:

`π(x)=π(x')  ⇒  π(δ(x))=π(δ(x'))`.

**Proof (necessity):** if `δ̄` exists then `π(δ(x)) = δ̄(π(x)) = δ̄(π(x')) = π(δ(x'))` for any x,x' in the same projection fiber.

**Proof (sufficiency):** define `δ̄(y)=π(δ(x))` using any `x` such that `π(x)=y`. The premise ensures this value is independent of the representative, hence defines a function on `π(X)`. QED.

**Counterexample:** `X={0,1}²`, `π(a,b)=a`, `δ(a,b)=(b,a)` (bit swap). States `(0,0)` and `(0,1)` have the same observed value 0, yet project to next values 0 and 1. Therefore the projected trace cannot be replayed by any memoryless operator on the observed bit alone. `experiments/commission_checks.py` exhaustively finds this obstruction.

**Positive control:** `δ(a,b)=(1-a,b)` is π-compatible: the projected operation is `δ̄(a)=1-a`.

**Consequence:** PURL's Layer-1→Layer-2 projection must never automatically promote observed symbol transitions into executable deterministic grammar without verifying this condition (or enriching state). On finite systems the condition is decidable by exhaustive checking; for general programs/state spaces it is a proof obligation, not a free inference. This connects classical quotient automata/congruence to PURL's existing `src/research/projection.js`.

**Extension:** for a labeled LTS rather than a deterministic function, require appropriate relation compatibility or bisimulation/quotient conditions. Merely matching one trace is insufficient.

## Finding 2 — Operation grammar vs executable language

A string of labels such as `WRITE, COMMIT, BUILD` can be syntactically legal without representing an executable sequence. Three distinct constraints intervene:

1. **Typing:** one operator's output must fit the next one's input.
2. **Dynamic capability/lifecycle:** actor, delegated rights, resource version and status must allow each transition at the point of execution.
3. **Realization:** an implementation (sandbox worker, data, dependencies, environment) must exist and match its declared effects.

The isolated toy suite lists 125 length-three sequences across five operations; 118 are ill typed. This is not a universal benchmark, but it shows how a mere word language over-counts executable programs. A typed effect calculus is a materially better specification for a URL-native mission compiler than seven unrestricted verbs.

## Finding 3 — Four identities are different equivalence relations

`address_id`, `derivation_id`, `value_id`, and `execution_id` answer different questions. `add(1,2)` and `add(2,1)` have different paths and typed ASTs but equal integer outputs; two separate executions of the same AST can be distinct events even when their results agree. Semantic program equivalence cannot generally be inferred from equality of syntax hashes, and for sufficiently general languages cannot be algorithmically decided in all cases.

**Consequence:** GiN's number vs numeral distinction is not decorative. It prevents a real category error in PURL's identity/provenance model. CGT's grammatical addresses give canonical *representations under chosen rules*, not a general solver for program equivalence.

## Finding 4 — Internal hash-chain verification is not independently anchored authenticity

A self-contained chain can detect accidental or adversarial modification **relative to a previously trusted head**. But an adversarial storage operator who controls the entire event store can replace all content and recompute every unkeyed hash, yielding another internally consistent chain.

**Toy witness:** payload `alpha` and payload `beta` each have a locally valid recomputed SHA-256 event hash, with distinct roots. Without retaining, signing or witnessing an old root out-of-band, an independent reader cannot determine which chain is the original. This does not allege a vulnerability in an actual deployment; it identifies the trust assumptions of a hash-only design.

**Product action:** describe verification honestly as *self-consistency*. If tamper evidence against a malicious server is a requirement, sign periodic roots, use external transparency/witnesses, independent reader checkpoints or similar standard methods; test fork/rewrite detection.

## Finding 5 — One URL cannot confer capability or identity

PURL's own reference code and principles distinguish discovery from authorization. In `store.invoke`, a principal must authenticate, invocation body must validate, version must match, and rights must cover planned primitive effects. The operation manifest may be per-requester. A public URL may therefore be *sufficient for discovering what is next* but **insufficient for taking the next action**.

The correct flagship claim is: *A fresh session with the PURL, appropriate supported tools, and out-of-band grants can reconstruct external mission state and continue permitted operations.* It is **not**: *One bare URL automatically endows arbitrary autonomous agency*.

## Finding 6 — Time and history do not create a new computability class by themselves

Bare two-state toggle traces are periodic; an unbounded number of trace lengths means there are countably many finite records, not that a finite automaton has unbounded working memory. Externally supplied timestamps or labels add information from the observer/environment. The `007→070→700→007` rotation is a three-state cycle, not a new number system or universal computer. The exact distinction matters for any book claiming that a single bit or a cyclic word induces a new field.

## Independent verdict

The most valuable research contribution currently supported is **a disciplined integration of existing semantics**, including a falsifiable admission criterion for compiled projections. The manuscript should not claim a new theorem/field or semantic identity protocol. A new technical paper could be warranted by real verified end-to-end advantages, not by renaming established constructions.
