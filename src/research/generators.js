// Synthetic sources with KNOWN structure. They exist to calibrate the
// measures: if a measure cannot distinguish sources whose structure we built
// in, its output on unknown data means little.
import { rng as makeRng } from './rng.js';

export const GENERATORS = {
  /** i.i.d. Bernoulli(p1). No sequential structure by construction. */
  iid: ({ n, p1 = 0.5 }, r) => Array.from({ length: n }, () => r.bernoulli(p1)),

  /** First-order Markov chain with transition matrix P (rows sum to 1). */
  markov: ({ n, P, x0 = 0 }, r) => {
    const x = [x0];
    while (x.length < n) x.push(r.choice(P[x.at(-1)]));
    return x;
  },

  /** x_t = x_{t-2}, flipped with probability eps. Independent of x_{t-1}: invisible at order 1. */
  lag2copy: ({ n, eps = 0.05 }, r) => {
    const x = [r.bernoulli(0.5), r.bernoulli(0.5)];
    while (x.length < n) x.push(x.at(-2) ^ r.bernoulli(eps));
    return x;
  },

  /** A repeating pattern with independent symbol flips (binary) at rate `flip`. */
  periodic: ({ n, pattern, flip = 0 }, r) => {
    const p = [...pattern].map(Number);
    return Array.from({ length: n }, (_, i) => p[i % p.length] ^ r.bernoulli(flip));
  },
};

export const TIMERS = {
  /** Poisson process: i.i.d. exponential intervals. Burstiness ≈ 0. */
  poisson: ({ n, rate = 1 }, r) => cumulative(Array.from({ length: n - 1 }, () => r.exponential(rate))),

  /** Regular clock with Gaussian-ish jitter (sum of uniforms), intervals kept positive. */
  periodic: ({ n, dt = 1, jitter = 0 }, r) => cumulative(Array.from({ length: n - 1 }, () => Math.max(dt * 0.01, dt + jitter * (r.next() + r.next() + r.next() - 1.5) * 2))),

  /** Two-state Markov-modulated Poisson process: fast bursts separated by slow gaps. */
  bursty: ({ n, fast = 10, slow = 0.1, stayBurst = 0.9, stayGap = 0.5 }, r) => {
    let inBurst = true;
    const dts = [];
    for (let i = 0; i < n - 1; i++) {
      dts.push(r.exponential(inBurst ? fast : slow));
      inBurst = inBurst ? r.next() < stayBurst : r.next() >= stayGap;
    }
    return cumulative(dts);
  },
};

function cumulative(dts) {
  const t = [0];
  for (const d of dts) t.push(t.at(-1) + d);
  return t;
}

/** Materialise a dataset spec {generator, params, timer, timer_params, seed}. */
export function generate(spec) {
  const r = makeRng(spec.seed);
  const symbols = GENERATORS[spec.generator](spec.params, r.fork('symbols'));
  const times = spec.timer ? TIMERS[spec.timer]({ n: symbols.length, ...(spec.timer_params ?? {}) }, r.fork('times')) : symbols.map((_, i) => i);
  return { symbols, times, alphabet: ['0', '1'], units: spec.timer ? 's' : 'index' };
}
