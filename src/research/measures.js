// Measurements on symbol sequences over a finite alphabet {0..k-1}.
// Definitions, assumptions, units and limitations: docs/research/MEASURES.md.
// These are measurements. None of them is a measure of "intelligence" or "meaning".

const log2 = Math.log2;

export function counts(x, k) {
  const c = new Array(k).fill(0);
  for (const s of x) c[s]++;
  return c;
}

/** Shannon entropy in bits of a count vector (plug-in / maximum-likelihood estimator). */
export function entropy(countVec) {
  const n = countVec.reduce((a, b) => a + b, 0);
  if (!n) return 0;
  let h = 0;
  for (const c of countVec) if (c) h -= (c / n) * log2(c / n);
  return h;
}

export function transitionCounts(x, k) {
  const C = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i + 1 < x.length; i++) C[x[i]][x[i + 1]]++;
  return C;
}

/** Row-normalised maximum-likelihood transition matrix; rows with no observations are null. */
export function transitionMatrix(C) {
  return C.map((row) => {
    const s = row.reduce((a, b) => a + b, 0);
    return s ? row.map((c) => c / s) : null;
  });
}

/** Symbol changes: how often x_{i+1} ≠ x_i, and in which direction. */
export function changes(x, k) {
  const C = transitionCounts(x, k);
  let total = 0;
  const directed = {};
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) if (a !== b && C[a][b]) {
    directed[`${a}->${b}`] = C[a][b];
    total += C[a][b];
  }
  return { count: total, per_step: x.length > 1 ? total / (x.length - 1) : 0, directed };
}

export function runLengths(x) {
  const runs = [];
  for (let i = 0; i < x.length; ) {
    let j = i;
    while (j < x.length && x[j] === x[i]) j++;
    runs.push({ symbol: x[i], length: j - i });
    i = j;
  }
  const bySymbol = {};
  for (const r of runs) {
    const b = (bySymbol[r.symbol] ??= { runs: 0, total: 0, max: 0, distribution: {} });
    b.runs++;
    b.total += r.length;
    b.max = Math.max(b.max, r.length);
    b.distribution[r.length] = (b.distribution[r.length] ?? 0) + 1;
  }
  for (const b of Object.values(bySymbol)) b.mean = b.total / b.runs;
  return { runs: runs.length, bySymbol };
}

export function blockCounts(x, L) {
  const m = new Map();
  for (let i = 0; i + L <= x.length; i++) {
    const key = x.slice(i, i + L).join(',');
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

export const blockEntropy = (x, L) => (L === 0 ? 0 : entropy([...blockCounts(x, L).values()]));

/**
 * Block entropies H_L and conditional entropies h_L = H_L − H_{L−1} (the entropy
 * of the next symbol given the previous L−1). h_L is non-increasing in L for a
 * stationary source and converges to the entropy rate. `reliable` is false when
 * the number of possible blocks k^L exceeds (n−L+1)/10 — plug-in estimates are
 * then biased low.
 */
export function entropyProfile(x, k, maxL = 6) {
  const out = [];
  let prev = 0;
  for (let L = 1; L <= maxL; L++) {
    const H = blockEntropy(x, L);
    out.push({ L, H, h: H - prev, reliable: k ** L * 10 <= x.length - L + 1 });
    prev = H;
  }
  return out;
}

/** h_L alone (conditional entropy of next symbol given previous L−1), in bits/symbol. */
export const conditionalEntropy = (x, L) => blockEntropy(x, L) - blockEntropy(x, L - 1);

/** Lempel–Ziv (1976) complexity, Kaspar–Schuster algorithm; normalised by n / log_k n. */
export function lz76(x, k = 2) {
  const n = x.length;
  if (n < 2) return { c: n, normalized: n ? 1 : 0 };
  let c = 1, l = 1, i = 0, kk = 1, kmax = 1;
  for (;;) {
    if (x[i + kk - 1] === x[l + kk - 1]) {
      kk++;
      if (l + kk > n) { c++; break; }
    } else {
      if (kk > kmax) kmax = kk;
      i++;
      if (i === l) {
        c++;
        l += kmax;
        if (l + 1 > n) break;
        i = 0; kk = 1; kmax = 1;
      } else kk = 1;
    }
  }
  return { c, normalized: (c * (Math.log(n) / Math.log(Math.max(k, 2)))) / n };
}

/** Sample autocorrelation r(τ) for τ = 1..maxLag (biased estimator, denominator n·var). */
export function autocorrelation(x, maxLag = 32) {
  const n = x.length;
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const d = x.map((v) => v - mean);
  const v0 = d.reduce((a, b) => a + b * b, 0);
  const r = [];
  for (let tau = 1; tau <= Math.min(maxLag, n - 1); tau++) {
    let s = 0;
    for (let i = 0; i + tau < n; i++) s += d[i] * d[i + tau];
    r.push(v0 ? s / v0 : 0);
  }
  return r;
}

/**
 * Candidate period: the lag ≥ 2 that is a local maximum of r(τ) with the largest r,
 * provided r exceeds the approximate 95% white-noise band 2/√n. Null otherwise.
 * Assumes numeric symbols (meaningful for binary; arbitrary for categorical).
 */
export function dominantPeriod(acf, n) {
  const band = 2 / Math.sqrt(n);
  let best = null;
  for (let i = 1; i < acf.length; i++) {
    const lag = i + 1;
    const left = acf[i - 1];
    const right = i + 1 < acf.length ? acf[i + 1] : -Infinity;
    if (acf[i] > left && acf[i] >= right && acf[i] > band && (!best || acf[i] > best.r)) best = { lag, r: acf[i] };
  }
  return { period: best?.lag ?? null, r: best?.r ?? null, band };
}

/** Mutual information I(X_t ; X_{t+lag}) in bits (plug-in). Works for categorical symbols. */
export function lagMutualInformation(x, lag, k) {
  const joint = Array.from({ length: k }, () => new Array(k).fill(0));
  const n = x.length - lag;
  if (n <= 0) return 0;
  for (let i = 0; i < n; i++) joint[x[i]][x[i + lag]]++;
  const pa = joint.map((row) => row.reduce((a, b) => a + b, 0) / n);
  const pb = joint[0].map((_, j) => joint.reduce((a, row) => a + row[j], 0) / n);
  let mi = 0;
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
    const p = joint[a][b] / n;
    if (p) mi += p * log2(p / (pa[a] * pb[b]));
  }
  return Math.max(0, mi);
}

/** Every symbolic measure for one sequence, in one object. */
export function symbolicSummary(x, k, { maxL = 6, maxLag = 32 } = {}) {
  const c = counts(x, k);
  const C = transitionCounts(x, k);
  const acf = autocorrelation(x, maxLag);
  return {
    n: x.length,
    counts: c,
    proportions: c.map((v) => v / x.length),
    entropy_H1: entropy(c),
    transition_counts: C,
    transition_matrix: transitionMatrix(C),
    changes: changes(x, k),
    run_lengths: runLengths(x).bySymbol,
    entropy_profile: entropyProfile(x, k, maxL),
    lz76: lz76(x, k),
    autocorrelation: acf,
    period: dominantPeriod(acf, x.length),
    lag_mutual_information: [1, 2, 3, 4].map((lag) => ({ lag, bits: lagMutualInformation(x, lag, k) })),
  };
}
