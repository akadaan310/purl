# Measures

Every transformation in `src/research/` is documented here with its
**definition, assumptions, domain, units, interpretation and limitations**,
and tied to the established concept it implements. None of these is a
measure of meaning, understanding or intelligence.

Notation: a sequence x₁…xₙ over the alphabet {0,…,k−1}; event times
t₁ ≤ … ≤ tₙ in declared units (seconds, or `index` if untimed).

---

## counts

- **Definition.** cᵢ = #{j : xⱼ = i}; proportions pᵢ = cᵢ/n.
- **Assumptions.** None beyond a finite alphabet.
- **Domain / units.** Any sequence; counts (dimensionless), proportions ∈ [0,1].
- **Interpretation.** The marginal distribution.
- **Limitations.** **Not invariant under relabelling** — the proportion of
  "1"s describes the encoding as much as the process (exp-0001 H7).

## entropy

- **Definition.** H₁ = −Σ pᵢ log₂ pᵢ (Shannon 1948), plug-in estimator.
- **Assumptions.** Stationarity if interpreted as a property of a source.
- **Domain / units.** bits per symbol, 0 ≤ H₁ ≤ log₂ k.
- **Interpretation.** Uncertainty of one symbol ignoring context.
- **Limitations.** Plug-in estimator is biased low by ≈ (k−1)/(2n ln 2)
  (Miller–Madow); negligible for k = 2, n = 2048. Says nothing about order.

## transition-matrix

- **Definition.** Cₐᵦ = #{j : xⱼ = a, xⱼ₊₁ = b}; P̂ₐᵦ = Cₐᵦ / Σᵦ Cₐᵦ
  (maximum-likelihood estimate of a first-order Markov chain). Rows
  without observations are `null`, not zero.
- **Assumptions.** Interpretation as a Markov chain assumes stationarity
  and first-order dependence.
- **Units.** probabilities.
- **Interpretation.** First-order transition structure.
- **Limitations.** Its sampling variance depends on the process's mixing
  time: for exp-0001's lag-2 process the s.d. of P̂₀₀ at n = 2048 was
  0.068, 4.7× the i.i.d. value. **Near-uniform rows do not demonstrate the
  absence of structure**, and non-uniform rows do not demonstrate its
  presence, without a variance model.

## changes

- **Definition.** Number of j with xⱼ₊₁ ≠ xⱼ; per step = count/(n−1);
  directed counts a→b for a ≠ b (off-diagonal of C).
- **Units.** count; changes per step.
- **Interpretation.** How often the state flips; direction asymmetry
  (0→1 vs 1→0) differs by at most one in any binary sequence, so it is
  uninformative for k = 2 — reported for completeness.
- **Limitations.** Invariant under relabelling; conflates all orders.

## run-lengths

- **Definition.** Maximal blocks of equal symbols; per symbol: number of
  runs, mean, max, distribution.
- **Interpretation.** For a first-order chain, run lengths of symbol a are
  geometric with mean 1/(1 − Pₐₐ).
- **Limitations.** Per-symbol statistics are encoding-dependent (H7).
  First and last runs are censored by the observation window.

## entropy-profile

- **Definition.** Block entropy H_L of overlapping L-blocks; conditional
  entropy h_L = H_L − H_{L−1} = H(xⱼ | xⱼ₋ₗ₊₁ … xⱼ₋₁) for L ≥ 1, H₀ = 0.
  h_L is non-increasing for stationary sources and converges to the
  **entropy rate** h (Shannon; Cover & Thomas ch. 4). The runner's
  "h₃" is the entropy of the next symbol given the previous two.
- **Assumptions.** Stationarity.
- **Units.** bits per symbol.
- **Interpretation.** The smallest L at which h_L stops decreasing
  indicates the memory length needed to predict the source (cf. excess
  entropy, Crutchfield & Feldman 2003).
- **Limitations.** Plug-in H_L is biased low when k^L is not ≪ n. Rows
  are flagged `reliable: false` when k^L·10 > n − L + 1; do not interpret
  them. Order-selection by eye is not a test — surrogates are.

## lz76

- **Definition.** Lempel–Ziv (1976) complexity c(n): number of phrases in
  the exhaustive parsing, computed with the Kaspar–Schuster (1987)
  algorithm; normalised c·log_k(n)/n, which → h/log₂k for ergodic sources
  (≈ 1 for i.i.d. uniform).
- **Units.** phrases; normalised is dimensionless.
- **Interpretation.** A compressibility proxy for the entropy rate.
- **Limitations.** Normalisation converges slowly; values slightly above
  1 at n = 2048 (exp-0001: 1.03–1.06) are finite-size effects. Invariant
  under relabelling.

## autocorrelation

- **Definition.** r(τ) = Σ (xⱼ − x̄)(xⱼ₊τ − x̄) / Σ (xⱼ − x̄)², τ = 1…32
  (biased estimator). *Candidate period*: the lag τ ≥ 2 that is a local
  maximum with the largest r(τ) exceeding 2/√n.
- **Assumptions.** Numeric symbols — meaningful for binary, arbitrary for
  categorical alphabets.
- **Units.** dimensionless, [−1, 1]; lag in steps.
- **Interpretation.** Linear dependence at lag τ; periodicity.
- **Limitations.** **Known weakness (exp-0001 §6.1):** 2/√n is a per-lag
  band applied to 31 lags (multiple comparisons) and the "largest local
  maximum" rule can select a harmonic. It reported spurious periods in 3
  non-periodic datasets. Treat `period` as a candidate, not a detection.

## mutual-information

- **Definition.** I(xⱼ; xⱼ₊τ) = Σ p(a,b) log₂ [p(a,b) / p(a)p(b)], plug-in,
  τ = 1…4.
- **Units.** bits.
- **Interpretation.** Any (not only linear) dependence at lag τ. For the
  lag-2 copy process I(τ=2) ≈ 1 − H_b(ε).
- **Limitations.** Plug-in bias upward ≈ (k−1)²/(2n ln 2).

## temporal

Inter-event intervals Δtⱼ = tⱼ₊₁ − tⱼ.

| Measure | Definition | Units | Poisson value | Invariant under t → c·t? |
|---------|-----------|-------|---------------|--------------------------|
| mean, sd, CV | usual; CV = σ/μ | time; CV none | CV = 1 | mean/sd no; CV yes |
| burstiness B | (σ − μ)/(σ + μ) (Goh & Barabási 2008) | none, [−1,1] | 0 | yes |
| memory M | Pearson corr. of (Δtⱼ, Δtⱼ₊₁) (Goh & Barabási 2008) | none | 0 | yes |
| event rate | (n−1)/(tₙ − t₁) | 1/time | λ | no |
| change rate | changes / span | 1/time | — | no |
| Fano factor | var/mean of change counts in 20 equal windows | none | 1 | yes |
| finite differences | Δᵏ of windowed change rates | rate units per window step | — | no |

- **Assumptions.** Ordered times; stationarity for interpreting B and M.
- **Interpretation.** Temporal organisation independent of which symbols
  occur (exp-0001 H6).
- **Limitations.** Finite differences of windowed rates are the *only*
  "derivative" PURL computes; there is no assumption of smoothness, and
  window width changes the result. The Fano factor of *change* counts
  mixes symbolic and temporal structure (exp-0001 §6.4). Zero-length
  intervals occur in PURL logs because composite operations emit several
  events at one timestamp.

## transition-graph

- **Definition.** For order m, nodes are observed m-blocks; edge u→v when
  block v follows block u (overlapping), weighted by count; p = count /
  out-weight (the empirical transition graph of an order-m Markov model;
  a subgraph of the de Bruijn graph B(k, m)).
- **Graph analysis (established terms):** strongly connected components
  (Tarjan); **closed classes** (SCCs with no outgoing edge — the
  finite-Markov-chain notion that "attractor-like behaviour" refers to);
  **transient** nodes; **period** of a class (gcd of cycle lengths);
  **stationary distribution** on each closed class (lazy power
  iteration); branching (out-degree > 1), merging (in-degree > 1),
  elementary circuits up to length 6.
- **Limitations.** Estimated from one finite path: a closed class can be
  an artefact of where observation stopped — flagged
  `boundary_artifact: true`. Absence of an edge means "not observed",
  not "impossible".

## grammar

- **Definition.** Re-Pair (Larsson & Moffat 2000): repeatedly replace the
  most frequent adjacent pair (≥ 2 non-overlapping occurrences) with a new
  nonterminal; ties broken by smallest pair (deterministic). Reported:
  rules with expansions, uses, coverage (uses × length), grammar size =
  |final sequence| + 2·|rules|, compression ratio = size / n, and the
  top-level segmentation boundaries.
- **Interpretation.** A compressed *representation*: redundancy relative
  to the class of straight-line grammars.
- **Limitations.** **Compression is not meaning**; output carries
  `semantic_interpretation: null`. Compression ratio reflects the marginal
  distribution as well as order (exp-0001 H3). Rule boundaries are
  phase-dependent (exp-0001 H8). Smallest-grammar is NP-hard; Re-Pair is
  a heuristic.

## motifs

- **Definition.** Most frequent L-grams (L = 3) with expected counts
  under (a) i.i.d. symbols with observed frequencies and (b) the observed
  first-order chain; ratios observed/expected.
- **Interpretation.** Over-representation is always *relative to a stated
  null model* (as in network-motif analysis, Milo et al. 2002).
- **Limitations.** No significance test; overlapping occurrences counted.

## surrogates

- **Definition.** Monte-Carlo rank test: compute statistic S on data and on
  N surrogates; p = (1 + #{S_surr at least as extreme}) / (N + 1)
  (Theiler et al. 1992 surrogate-data method).
  - *shuffle*: random permutation — preserves counts, destroys order.
  - *Markov-1*: resample from the empirical transition matrix — preserves
    first-order statistics, destroys higher order.
  - *exponential intervals*: i.i.d. exponential with the observed mean —
    Poisson null for timing.
  - *interval shuffle*: preserves the interval distribution, destroys
    interval order.
- **Limitations.** Minimum attainable p is 1/(N+1) (0.01 for N = 99;
  0.025 for N = 39). No multiple-comparison correction is applied inside
  the runner; see each record's `uncertainty`.

## invariance

- **Definition.** Recompute measures after (a) relabelling symbols
  (0 ↔ 1) and (b) rescaling time (×1000); report equality within 1e−9
  relative tolerance.
- **Interpretation.** A measure that changes under relabelling describes
  the encoding; one that changes under time rescaling carries units.
  Neither is wrong, but neither is a property of the process alone.

## perturbation

- **Definition.** Flip each symbol independently with probability ε ∈
  {0.01, 0.05, 0.1}; 5 replicates; report mean conditional entropy, mean
  grammar ratio and the fraction of replicates whose candidate period
  equals the unperturbed one.
- **Interpretation.** Persistence of a structure under i.i.d. observation
  noise (a binary symmetric channel).
- **Limitations.** Only one noise model; period agreement inherits the
  period detector's weaknesses.

## convergence

- **Definition.** Signature = the 16 highest-coverage Re-Pair rules with
  expansion length ≥ 6; overlap = Jaccard index of signature sets between
  datasets; reported within replicate groups and across generators.
- **Limitations.** **Exact-string comparison is phase-sensitive**, so it
  under-reports convergence for periodic sources (exp-0001 H8). A
  rotation- or substring-aware comparison is needed and must be
  pre-registered before use.

## References

Shannon (1948); Cover & Thomas, *Elements of Information Theory* (2006);
Lempel & Ziv (1976); Kaspar & Schuster (1987); Crutchfield & Feldman,
*Regularities unseen, randomness observed* (2003); Goh & Barabási,
*Burstiness and memory in complex systems* (2008); Larsson & Moffat,
*Off-line dictionary-based compression* (2000); Theiler et al., *Testing
for nonlinearity in time series: the method of surrogate data* (1992);
Milo et al., *Network motifs* (2002); Tarjan (1972); Lind & Marcus,
*Symbolic Dynamics and Coding* (1995).
