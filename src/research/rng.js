// Seeded pseudo-random numbers (mulberry32). Deterministic across platforms:
// uses only 32-bit integer arithmetic and one division.
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    bernoulli: (p) => (next() < p ? 1 : 0),
    exponential: (rate) => -Math.log(1 - next()) / rate,
    choice: (probs) => {
      let u = next();
      for (let i = 0; i < probs.length; i++) {
        if (u < probs[i]) return i;
        u -= probs[i];
      }
      return probs.length - 1;
    },
    /** Independent child stream, so adding a consumer does not perturb others. */
    fork: (label) => rng(hashSeed(`${seed}:${label}`)),
  };
}

export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
