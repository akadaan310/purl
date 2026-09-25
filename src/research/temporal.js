// Temporal measures on event times t_0 ≤ t_1 ≤ … (units declared by the dataset).
// See docs/research/MEASURES.md §Temporal for definitions and caveats.

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = (a) => {
  const m = mean(a);
  return a.length ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) : NaN;
};

export const intervals = (t) => t.slice(1).map((v, i) => v - t[i]);

export function intervalStats(dt) {
  const s = [...dt].sort((a, b) => a - b);
  const m = mean(dt);
  const σ = sd(dt);
  return { n: dt.length, mean: m, sd: σ, cv: σ / m, min: s[0], median: s[Math.floor(s.length / 2)], max: s.at(-1) };
}

/** Goh & Barabási (2008) burstiness B = (σ−μ)/(σ+μ) ∈ [−1, 1]: −1 periodic, 0 Poisson, →1 bursty. */
export function burstiness(dt) {
  const m = mean(dt);
  const σ = sd(dt);
  return σ + m === 0 ? 0 : (σ - m) / (σ + m);
}

/** Goh & Barabási memory coefficient: Pearson correlation of consecutive intervals. */
export function memoryCoefficient(dt) {
  const a = dt.slice(0, -1);
  const b = dt.slice(1);
  const ma = mean(a), mb = mean(b), sa = sd(a), sb = sd(b);
  if (!sa || !sb) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / a.length / (sa * sb);
}

/** Times at which the symbol changes (the time of the later observation). */
export function changeTimes(t, x) {
  const out = [];
  for (let i = 1; i < x.length; i++) if (x[i] !== x[i - 1]) out.push(t[i]);
  return out;
}

/** Counts of events per window of width w over [t0, t1), and the rates counts/w. */
export function windowedCounts(eventTimes, w, t0, t1) {
  const nWin = Math.max(1, Math.floor((t1 - t0) / w));
  const c = new Array(nWin).fill(0);
  for (const t of eventTimes) {
    const i = Math.floor((t - t0) / w);
    if (i >= 0 && i < nWin) c[i]++;
  }
  return { counts: c, rates: c.map((v) => v / w), window: w };
}

/** Fano factor var/mean of window counts: 1 for a Poisson process, >1 clustered, <1 regular. */
export function fanoFactor(c) {
  const m = mean(c);
  return m ? sd(c) ** 2 / m : NaN;
}

/** k-th finite difference of a series (discrete analogue of a derivative; no smoothness assumed). */
export function differences(series, order = 1) {
  let s = series;
  for (let k = 0; k < order; k++) s = s.slice(1).map((v, i) => v - s[i]);
  return s;
}

export function temporalSummary(t, x, { windows = 20 } = {}) {
  const dt = intervals(t);
  const span = t.at(-1) - t[0];
  const ct = changeTimes(t, x);
  const w = span / windows;
  const wc = windowedCounts(ct, w, t[0], t[0] + w * windows);
  const d1 = differences(wc.rates, 1);
  const d2 = differences(wc.rates, 2);
  return {
    span,
    event_rate: (t.length - 1) / span,
    intervals: intervalStats(dt),
    burstiness: burstiness(dt),
    memory_coefficient: memoryCoefficient(dt),
    changes: {
      count: ct.length,
      rate: ct.length / span,
      per_event: ct.length / Math.max(1, x.length - 1),
      window_width: w,
      window_counts: wc.counts,
      fano_factor: fanoFactor(wc.counts),
      rate_first_difference_mean_abs: mean(d1.map(Math.abs)),
      rate_second_difference_mean_abs: mean(d2.map(Math.abs)),
    },
  };
}
