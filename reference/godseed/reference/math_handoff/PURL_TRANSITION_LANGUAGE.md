# Transition language: binary bit, 007 cycle, timing, projection, expressivity

## 1. Bare toggling bit

Let `Σ={0,1}`, initial state `s₀ ∈ Σ`, deterministic map `δ(s)=1-s`. Define the length-`n` transition history `hₙ=(s₀,...,sₙ)` with `s_i=s₀ XOR (i mod 2)`.

- For **each fixed n**, exactly **two** state histories exist (one per start state).
- Over **all finite n**, there are countably infinitely many finite histories, because length is unbounded. This does **not** mean one fixed-length trace encodes arbitrarily much independent information, nor that the two-state machine is Turing-complete.
- Over infinite time, this map has only two infinite orbits, both periodic. Additional labels/external data fundamentally change the object.
- State histories vs state *words*: if `Σ*` is the free language of all binary strings, it has `2^n` strings of length n, but most are **not** valid toggle traces.

## 2. Timestamps and external clock

If each of n transitions also carries one independently selected label from alphabet `T` of cardinality `k`, there are at most `2·k^n` labeled histories; the bound is attained only when all labeled transitions are admissible and distinguishable. A finite precision clock is a finite alphabet for each timestamp/delta, subject to monotonicity and resolution constraints. Arbitrary real-valued exact times would introduce uncountably many annotations, but that richness comes from an **external real-number assumption**, not from the two-state toggle.

Measured clock drift or jitter is evidence about the clock/channel only with controls; it is not automatic new computational expressivity.

## 3. The 007 cycle

Let `X={007,070,700}` as **three labels**, with `δ(007)=070`, `δ(070)=700`, `δ(700)=007`. For a fixed n there are three possible histories, one per initial label. Their finite-history language has infinitely many words across lengths but eventually periodic structure and a three-state finite automaton.

The digit strings 007, 070, 700 are labels, not numbers obtained by arithmetic; if interpreted as numerals they denote different values under positional syntax. Their cyclic shifting is a word transform, not a new numeric operation.

## 4. When is a trace a program?

For a deterministic transition system `(X,δ)` a fully observed trace `(x₀,...,x_n)` is an **execution witness** of δ only when every adjacent pair satisfies `δ(x_i)=x_{i+1}`. It is **not** an implementation of δ outside observed states and it is not sufficient to infer external reads, operator version or side effects.

Counterexample: hidden state `(a,b)` projected to a; transition `δ(a,b)=(b,a)` is not representable by any deterministic `δ'` on the projected bit a, since `(0,0)` and `(0,1)` both project to 0 but next project to 0 and 1 respectively. The proof appears in `PURL_INDEPENDENT_DISCOVERIES.md`.

Only compile projected transitions when the projection kernel is a congruence for each exposed operation, or explicitly promote hidden context/state into the executable contract.

## 5. Trace equivalence and replay requirements

| Equivalence | Test | Does it justify substituting programs? |
|---|---|---|
| Address equality | same normalized URL bytes | No |
| Trace equality | same observed sequence under a named projection | No; projection may discard hidden state |
| Value equality | same typed mathematical denotation on one tested input | No |
| Observational equivalence | same outputs under a specified observation family and domain | Sometimes, only relative to those contexts |
| Bisimulation | matching labeled transitions under an explicit bisimulation relation | Stronger, still scoped to modeled effects |
| Semantic equivalence of arbitrary programs | equality of denotations over all admissible inputs | Not generally decidable |

Exact replay requires a versioned transition function, initial state, input order, deterministic seeds, all relevant environmental observations, and an effects policy. A complete log of *labels only* cannot certify replay of side effects.

## 6. Perturbation tests

1. Flip initial state in toggle → same period, opposite parity; distinguishable if value observed.
2. Delete one 007 label → an invalid trace under the declared transition relation (unless transitions are redefined).
3. Change timestamps but preserve labels → state-history equality preserved, timing-history equality lost.
4. Change read order of noncommuting state writes → final state may change; do not optimize by sorting events.
5. Project away hidden state → legal deterministic transition may cease to exist on quotient.

## 7. Measured toy results

`experiments/results.json` shows 2 fixed-length toggle traces for n=0…8, 3 for the 007 cycle, and a concrete projection failure. These are tiny exact enumerations, not statistical estimates. They confirm classical finite-state reasoning and expose a useful PURL compiler admission condition.
