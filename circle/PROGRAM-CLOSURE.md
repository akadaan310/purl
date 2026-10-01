# Program closure: untyped vs typed vs constitution-aware transformers

Experiment EXP-PROGRAM-CLOSURE-1. The SPEC was pre-registered in 1b5feac and an
L2 erratum added in bba1b5d, both before any run. Records:
* `record-1` is an aborted run (operator-interrupted, uncommitted code), kept;
* `record-2` and `record-3` are the two runs;
* `posthoc-PH1.json` is a post-hoc breakdown, **not pre-registered**.

Arms filter one alphabet of 122 candidate operations at depth ≤ 2 from four
state-bound sources. The admissibility function is shared with the route
`/programs/closure?mode=` (`src/circle/closure.js`).

## Results (record-2)
| arm | generated | well-typed | executable | executable fraction | typing gap (typed ∧ ¬exec) |
|---|---|---|---|---|---|
| A0 untyped | 60 024 | 2 016 | 639 | 0.0106 | 1 377 |
| A1 kind-typed | 2 144 | 2 016 | 639 | 0.2980 | 1 377 |
| A2 constitution-aware (declared) | 2 016 | 2 016 | 639 | 0.3170 | 1 377 |
| A3 code-informed | 740 | 740 | 639 | 0.8635 | 101 |

| prediction | verdict | reading |
|---|---|---|
| P1 fraction strictly increases A0<A1<A2<A3 | **held** | each level of knowledge removes only failures |
| P2 A3 fraction = 1.0 | **FALSIFIED** (0.8635) | constraints exist that neither the catalog nor `LIMITS` states (PH-1 below) |
| P3 A2 typing gap > 0 | **held** (1 377) | the catalog under-declares: well-typed ≠ executable |
| P4 segments A1 = A2 = A3 | **held** | constraints removed parameter values, never whole operations |
| P5 laws L1, L2 | **held**: 0 counterexamples in 165 executable state instances | flip involution; f(f(x)) = (f²)(x) |
| P6 replicate identical | **held**: record-3 identical to record-2 in every count, reason, law instance and loss | the generator and substrate are deterministic, so this checks the instrument, not variance |

## What the numbers say (DERIVED from the table; OBSERVED in the records)
1. **Every arm reaches the same 639 executable programs.** No filter ever removed an executable program, so the filters are *sound*. They are not *complete*: failures still pass through.
2. **A1 → A2 adds nothing the substrate does not already enforce.** The 128 programs A2 removes are exactly the ones `/term` already refuses (declared minimums). What the catalog declares, typing checks.
3. **The gap is the undeclared.** Of A2's 1 377 typed-but-failing programs, `LIMITS` and `bit < n` explain 1 276. PH-1 classifies the remaining 101 into exactly two classes that the catalog schema **cannot express**:
   * **history precondition** (32): `damage` applies only to a *perturbed* state (`…/flip/b/damage/h`). It is a condition on the derivation, not on the kind or a parameter.
   * **value-dependent bound** (69): `at/t` needs t < the length of the trace computed so far. It is known only after evaluation.
4. Information loss H(program | value_id) is 1.976 bits over the 639 in every arm: the same programs, so the same collisions (e.g. `PERTURB/b` ≡ `WRITE/flip/b`, flip involution).

## Consequence for "constitution-aware"
A transformer that knows **everything the environment declares** is no better
at producing executable programs than one that knows only kinds, because typing
already enforces what is declared. The leverage is in what is **not** declared.
Two concrete schema extensions would close the measured gap:
* `requires_derivation` (e.g. damage: a flip earlier in the derivation);
* `bounded_by` (e.g. at.t < len(prefix value)).

Both are proposals for the substrateIO catalog owner (HYPOTHESIS: with them, A2 reaches 1.0 on this alphabet). Not adopted here.
