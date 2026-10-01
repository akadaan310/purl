# EXP-PROGRAM-CLOSURE-1: untyped vs typed vs constitution-aware program transformers (pre-registered)

Committed before any code for it was written or run.

## Question
When programs are generated from programs, how much of the gap between
*generated* and *executable* does each level of knowledge about the environment
close? And does what the environment **declares** (its operation catalog) suffice?

## Arms (one shared candidate alphabet; an arm only filters)
| arm | admits a candidate operation `op(params)` after a prefix of kind K if… | knowledge used |
|---|---|---|
| A0 untyped | always | none |
| A1 kind-typed | `op.applies_to == K` | catalog kinds (`GET /operations`) |
| A2 constitution-aware (declared) | A1 and every param satisfies its **declared** `minimum` and `choices` | everything the catalog declares |
| A3 code-informed | A2 and the **undeclared** limits read from substrateIO code (`LIMITS`: max_bits, trace_steps, power, table_states) and the value-dependent `bit < n` | catalog + source code |

The candidate alphabet: every catalog operation applicable to a state, map or trace. Int params take values in {0, 1, 7, 8, 9, 4097, 1048577}; choice params take their declared choices plus one undeclared value. WRITE and PERTURB/b variants are both included. Sources: four programs bound to states (`eca/90/8/5`, `eca/30/8/1`, `increment/3/2`, `eca/110/16/9`). Depth ≤ 2: each arm extends its **own** admitted depth-1 programs.

## Measures (per arm)
generated; FSM-legal; well-typed (`/term` 200); executable (value resolution 200); the
**typing gap** (well-typed ∧ ¬executable); coverage (distinct operation segments
among executable programs); information loss H(program | value_id) over executable
programs (substrateIO); laws on executable state-valued programs:
**L1** flip involution, `P/flip/b/flip/b ≡ P` (same value_id);
**L2** `P/next/next` has the same state integer as `map/power/2/state/x`.

## Predictions and falsification
| id | prediction | falsified if |
|---|---|---|
| P1 | executable fraction increases strictly A0 < A1 < A2 < A3 | any non-increase |
| P2 | A3 executable fraction = 1.0 | any A3 candidate fails to execute (an undeclared constraint is missing even from A3) |
| P3 | A2's typing gap > 0: the catalog under-declares constraints | A2 typing gap = 0 |
| P4 | constraints remove parameter values, not operations: executable segments A1 = A2 = A3 | a segment disappears |
| P5 | L1 and L2 hold on every executable state instance, in every arm | any counterexample |
| P6 | a second run gives identical counts | any difference |

## Procedure
`node scripts/program-closure.js` against a local substrate (`tools.purl_server`, fresh store). Pure GETs only. Two runs; failures kept.
The circle route `/programs/closure` gains `mode=untyped|typed|constitution` using the same admissibility function as the script (one implementation).

## Erratum (appended before the first run; nothing had been executed)
L2 as written compares `P/next/next` with `map/power/2/state/x`. That address *is* x
(a state of the power map), not f²(x). Intended, and used: `P/next/next` has the same
state integer as `map/power/2/state/x/next`, i.e. f(f(x)) = (f²)(x). Also clarified:
value_id is extensional, `(n, x)` (substrate `value_rule`), so L1 compares value_ids.
