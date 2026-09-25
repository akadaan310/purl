# exp-0001 — Report

**Record:** [`record.json`](record.json) · **Definition (pre-registered):** [`definition.json`](definition.json) · **Raw data:** [`data/`](data/)
**Output hash:** `sha256:0f8ba42460cbcba2c12b3ca86918cc03097b031aa45a6ae7bf106c9c656d7389`
**Reproduce:** `npm run reproduce -- exp-0001` (re-derives raw data and every output; compares hashes)

This report is written by the implementing agent (Claude, in the session
that built this repository). Sections are labelled by epistemic category.
Where this report and `record.json` disagree, the record is authoritative.

---

## 1. Question

Which measurable structures in elementary state-transition sequences (a)
are detected against appropriate null models, (b) are artefacts of
representation, (c) persist under perturbation, (d) converge across
independently generated datasets, and (e) appear in projections of real
PURL event logs?

## 2. Design (summary)

- 11 synthetic binary datasets from sources with **known** structure
  (i.i.d. fair/biased, first-order Markov, lag-2 copy, periodic with
  noise, i.i.d. symbols with bursty timing; plus seed replicates), n = 2048.
- 2 projections of one **real PURL event log**: a seeded simulation of four
  agents making 400 operation attempts against a Layer 1 store (343
  accepted, 57 refused by authorisation or lifecycle rules → 359 events).
- For each: the measures in [MEASURES.md](../../docs/research/MEASURES.md),
  99 Monte-Carlo surrogates (39 for grammar), invariance checks, and
  persistence under 1 / 5 / 10 % symbol flips (5 replicates each).
- 11 hypotheses with machine-evaluable criteria, committed in
  `definition.json` *before* the first run (see git history: commit
  "Pre-register experiment exp-0001" precedes "Run exp-0001").

## 3. Results — hypotheses <span>(category: hypothesis, evaluated mechanically)</span>

| id | outcome | criterion (abridged) |
|----|---------|----------------------|
| H0 | **supported** | i.i.d. fair: h₃ not below shuffles (p = 0.88); H₁ = 1.000 |
| H1 | **supported** | Markov: h₃ below shuffles (p = 0.01) but not below Markov-1 surrogates (p = 0.48) |
| H2 | **not supported** | lag-2: order-1 matrix ≈ uniform ±0.05 — **failed** (P₀₀ = 0.615); h₃ below Markov-1 (p = 0.01) — passed |
| H3 | **supported** | biased i.i.d.: H₁ = 0.716, grammar ratio 0.187 < 0.238 (fair), but not below own shuffles (p = 0.97); h₃ p = 0.80 |
| H4 | **supported** | period 8 detected; 5/5 replicates keep period 8 at 5 % flips |
| H5 | **supported** | lag-2 at 5 % flips: mean h₃ = 0.547 < 0.8 |
| H6 | **supported** | bursty timing: B = 0.529 (p = 0.01); its symbols p = 0.11; Poisson B = 0.006 |
| H7 | **supported** | relabel-invariant: H₁, h₃, LZ76, change count, r(1); not invariant: proportion of 1s. Time-rescale: B invariant, rate not |
| H8 | **not supported** | periodic replicate signature overlap 0.062 vs i.i.d. 0.077 (needed ≥ i.i.d. + 0.3) |
| H9 | **supported** | event-kind projection: h₂ below shuffles (p = 0.01) |
| H10 | **not supported** | grammar boundary precision 1.000 vs baseline 0.966 (needed ≥ baseline + 0.2) |

8 supported, 3 not supported, 0 indeterminate. The criteria have not been
edited; `test/experiment.test.js` checks that the record's hypotheses
equal the committed definition's.

## 4. Selected observations and transformations

| dataset | H₁ | h₂ | h₃ | LZ76 | grammar ratio | B | candidate period |
|---------|----|----|----|------|---------------|---|------------------|
| iid_fair | 1.000 | 1.000 | 1.000 | 1.06 | 0.238 | 0.006 | **4** (spurious) |
| iid_biased | 0.716 | 0.716 | 0.716 | 0.74 | 0.187 | −0.005 | — |
| markov_sticky | 0.812 | 0.565 | 0.563 | 0.59 | 0.162 | 0.005 | — |
| lag2copy | 0.983 | 0.977 | 0.274 | 0.28 | 0.101 | 0.008 | 2 |
| periodic_noisy | 1.000 | 0.848 | 0.792 | 0.23 | 0.074 | −0.815 | 8 |
| periodic_noisy_r2 | 1.000 | 0.838 | 0.774 | 0.20 | 0.070 | −0.819 | **16** (harmonic) |
| bursty_times | 0.999 | 0.999 | 0.997 | 1.04 | 0.236 | 0.529 | **17** (spurious) |
| purl_workload_kind (k = 9) | 1.118 | 1.038* | 0.983* | 0.35 | 0.373 | 0.020 | — |

`*` = flagged unreliable by the estimator (too many possible blocks for n).
Periodic data reach h ≈ 0.21 only at L = 5–6 (period 8 needs 7 symbols of context).

## 5. Analysis of the three failures <span>(category: interpretation — author: implementing agent)</span>

### H2 — "structure invisible at order 1": half right, and the wrong half was mine

The order-2 part held overwhelmingly: h₃ = 0.274 against Markov-1
surrogates with mean 0.975 and minimum 0.960 (z = −124). The order-1 part
failed: P(0→0) = 0.615, outside the ±0.05 tolerance.

*Post-hoc exploratory check (not pre-registered; cannot change H2's
status):* over 200 fresh seeds at n = 2048, the lag-2 process gives
P(0→0) = 0.488 ± **0.068**, versus 0.498 ± 0.014 for i.i.d. data — a
4.7× larger sampling spread. Only 54 % of seeds would have passed the
tolerance. The reason is structural: the process is two independent,
slowly mixing sub-chains interleaved (even and odd positions, each
flipping with probability 0.05, mean run ≈ 20), so the effective number of
independent observations of the order-1 statistic is ~n/20, not n.

Meanwhile the *entropy* view of "invisible at order 1" was robust:
h₂ = 0.987 ± 0.012 across the same 200 seeds.

**Lesson:** a transition-matrix entry is not a reliable witness of the
*absence* of structure when there is hidden slow dynamics; its variance
depends on the very structure being tested for. The pre-registered
tolerance assumed i.i.d.-like variance. This is a finding about the
representation (finite-sample order-1 statistics), not about the process.

### H8 — convergence exists, but the metric could not see it

Signatures were compared by exact string identity of Re-Pair rule
expansions. Re-Pair's greedy left-to-right pairing fixes rule boundaries
at a phase determined by early noise, so replicates of the *same* periodic
source produce rotations of the same cyclic word (`01001011…` vs
`00101101…`) and share almost no exact strings.

*Post-hoc exploratory checks:* 8–11 of 16 signature rules from each
periodic replicate are substrings of the generating word
`00101101…`, against 0–1 of 16 for i.i.d. and Markov data; after
canonicalising exact-period rules by cyclic rotation, replicate overlap is
0.44–0.56.

**Lesson:** the convergence failure is an artefact of the *comparison
representation* (exact strings), not evidence of non-convergence. A
phase-invariant comparison must be pre-registered in a follow-up
(exp-0002) before it can be claimed. The i.i.d. "overlap" of 0.077 is also
instructive: short common strings recur in any binary data, which is why
the signature required length ≥ 6.

### H10 — the criterion was infeasible, and the projection hid the operations

346 of 358 inter-event positions are invocation boundaries (most
operations emit a single event), so the random-placement precision
baseline was 0.966 and "baseline + 0.2" exceeded 1. This is a design error
in the pre-registration, reported as such.

It also exposed a deeper representation issue: the `kind` projection maps
five different operations — `append`, `annotate`, `acknowledge`,
`checkpoint`, `supersede` — onto one symbol, `append`. The most used
grammar rule is `append·append` (123 uses), which spans two *different*
invocations. Compression recovered repetition of primitive kinds, not the
operations. The composite `handoff` pattern does appear as rules
(`append·assign`, `append·append·grant·assign`), but so do appends followed
by standalone `assign` operations, so the grammar cannot separate them.

The event-kind projection *does* have sequential structure (H9), but
LZ76 and grammar compression did **not** distinguish it from its shuffles
(p = 0.72, 0.95), and h₂ is fully explained by a first-order Markov model
(p = 0.61 vs Markov-1 surrogates). In this workload, what looks like
"operation structure" in the event log is, to these measures,
first-order transition statistics.

## 6. Other observations worth recording <span>(interpretation — author: implementing agent)</span>

1. **The period detector is fragile.** "Largest local maximum of r(τ)
   above 2/√n" reported spurious periods for i.i.d. (4), bursty (17) and
   Markov replicate r2 (32) data, and a harmonic (16) for one periodic replicate. The
   2/√n band is a per-lag 95 % band applied to 31 lags — a
   multiple-comparisons problem. H4 is recorded as supported and stands,
   but its support depends partly on this detector; exp-0002 should use a
   corrected band and prefer the fundamental over harmonics.
2. **Compression without structure (H3)** behaved exactly as predicted:
   biased i.i.d. data compress well (0.187) but no better than their own
   shuffles. Compressibility measured the marginal distribution, not
   sequential organisation.
3. **Time carries information symbols do not (H6).** Identical i.i.d.
   symbols with bursty timing: B = 0.53, memory coefficient 0.13 (both
   p = 0.01), while every symbolic test was null. A purely symbolic
   representation of a transition stream discards this.
4. **A cross-layer measure conflates layers.** The Fano factor of
   *change counts* per time window is 7.3 for lag2copy under Poisson
   timing — driven by the symbols (changes cluster when the sub-chains
   disagree), not by the clock. Measures mixing symbol and time must be
   read with both surrogates.
5. **Invariance (H7)** separated encoding-dependent quantities
   (proportion of 1s, run length of "1") from process quantities
   (entropy family, LZ76, change count, r(1)); and unit-dependent
   quantities (rate, mean interval) from unit-free ones (B, CV, memory,
   Fano).
6. **Multiple comparisons.** Across all datasets about 80 p-values are
   reported. One nominal false positive is visible: iid_biased's interval
   memory coefficient p = 0.03 under Poisson timing. None of the
   hypothesis criteria depended on it.

## 7. What exp-0001 does and does not show <span>(interpretation — author: implementing agent)</span>

It shows that the substrate can **detect** built-in structure against
appropriate nulls, **attribute** it to the right order (first- vs
second-order), **refuse** to call compressibility structure, **separate**
symbolic from temporal structure, and **flag** its own representation
artefacts — including artefacts in the analysis code written for this
experiment (H2's tolerance, H8's metric, H10's criterion, the period band).

It does **not** show that elementary transitions "form increasingly
expressive structures" in any sense beyond what standard information
theory and symbolic dynamics already describe. Every positive result here
is an application of established measures to sources whose structure was
built in. The one real-system dataset (the PURL workload) showed only
first-order structure that its own composition rules put there. No
evidence here bears on meaning, semantics or intelligence, and none was
sought.

## 8. Conclusions <span>(category: conclusion — author: implementing agent)</span>

1. The measurement pipeline is calibrated on known sources (H0, H1, H3,
   H6, H7 supported), with specific, documented weaknesses (period
   detection; order-1 statistics under slow mixing).
2. Three pre-registered hypotheses failed because of choices made in
   representing or comparing the data, and each failure was diagnosable
   from the preserved raw data. This is the behaviour the project asked
   for: the substrate disproved parts of its author's expectations.
3. Next steps are registered as questions Q-R1 … Q-R5 in
   [RESEARCH_QUESTIONS.md](../../RESEARCH_QUESTIONS.md), starting with a
   pre-registered exp-0002 using a phase-invariant convergence metric, a
   multiplicity-corrected period detector, and an operation-level (`op`)
   projection of event logs with a feasible boundary criterion.
