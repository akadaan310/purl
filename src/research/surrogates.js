// Surrogate data and perturbations. A structure is attributed to the data only
// if it survives comparison with surrogates that preserve some properties and
// destroy others:
//   shuffle   — preserves symbol counts; destroys all order.
//   markov1   — preserves (in expectation) the first-order transition matrix; destroys higher order.
//   exponential intervals — Poisson null for timing.
// Perturbations test persistence: bit flips, relabelling, time rescaling, jitter.

export function shuffle(x, r) {
  const y = x.slice();
  for (let i = y.length - 1; i > 0; i--) {
    const j = r.int(i + 1);
    [y[i], y[j]] = [y[j], y[i]];
  }
  return y;
}

export function markovSurrogate(x, k, r) {
  const T = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i + 1 < x.length; i++) T[x[i]][x[i + 1]]++;
  const P = T.map((row) => {
    const s = row.reduce((a, b) => a + b, 0);
    return s ? row.map((c) => c / s) : null;
  });
  const marg = new Array(k).fill(0);
  for (const s of x) marg[s] += 1 / x.length;
  const y = [x[0]];
  while (y.length < x.length) y.push(r.choice(P[y.at(-1)] ?? marg));
  return y;
}

export function bitflip(x, eps, r, k = 2) {
  return x.map((s) => (r.next() < eps ? (k === 2 ? 1 - s : (s + 1 + r.int(k - 1)) % k) : s));
}

export const relabel = (x, perm) => x.map((s) => perm[s]);
export const rescaleTimes = (t, c) => t.map((v) => v * c);

export function exponentialIntervals(dt, r) {
  const m = dt.reduce((a, b) => a + b, 0) / dt.length;
  return dt.map(() => r.exponential(1 / m));
}

/**
 * Compare a statistic with its distribution over N surrogates.
 * p = (1 + #{surrogate at least as extreme}) / (N + 1) — the standard Monte-Carlo rank p-value.
 */
export function surrogateTest(stat, x, make, N, r, tail = 'less') {
  const observed = stat(x);
  const vals = [];
  for (let i = 0; i < N; i++) vals.push(stat(make(x, r)));
  const extreme = vals.filter((v) => (tail === 'less' ? v <= observed : v >= observed)).length;
  const m = vals.reduce((a, b) => a + b, 0) / N;
  const s = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / N);
  return { observed, tail, surrogates: N, mean: m, sd: s, min: Math.min(...vals), max: Math.max(...vals), p: (1 + extreme) / (N + 1), z: s ? (observed - m) / s : null };
}
