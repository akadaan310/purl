// Grammar-based compression (Re-Pair; Larsson & Moffat 2000) and motif counts.
//
// Epistemic status of each output:
//   observed sequence     — observation
//   n-gram counts, motifs — transformation
//   grammar rules         — transformation (a compressed REPRESENTATION)
//   "grammar candidates"  — rules that recur across independent datasets: still a transformation
//   semantic interpretation — never produced here (always null).
// Compression shows redundancy relative to a model class. It does not show meaning.

/**
 * Re-Pair: repeatedly replace the most frequent adjacent pair (≥ minCount
 * non-overlapping occurrences) with a new nonterminal. Ties are broken by the
 * numerically smallest pair, so the result is deterministic.
 */
export function repair(symbols, { k = 2, minCount = 2, labels = null } = {}) {
  let seq = symbols.slice();
  const rules = [];
  let next = k;
  for (;;) {
    const cnt = new Map();
    const last = new Map();
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = seq[i], b = seq[i + 1];
      const key = a * 1_000_003 + b;
      if (a === b && last.get(key) === i - 1) continue; // don't count overlapping aaa twice
      cnt.set(key, (cnt.get(key) ?? 0) + 1);
      last.set(key, i);
    }
    let best = null, bestCount = minCount - 1;
    for (const [key, c] of cnt) if (c > bestCount || (c === bestCount && best !== null && key < best)) { best = key; bestCount = c; }
    if (best === null || bestCount < minCount) break;
    const a = Math.floor(best / 1_000_003), b = best % 1_000_003;
    const sym = next++;
    rules.push({ symbol: sym, pair: [a, b], count_at_creation: bestCount });
    const out = [];
    for (let i = 0; i < seq.length; i++) {
      if (i + 1 < seq.length && seq[i] === a && seq[i + 1] === b) { out.push(sym); i++; }
      else out.push(seq[i]);
    }
    seq = out;
  }
  const expansion = new Map();
  const expand = (s) => {
    if (s < k) return [s];
    if (expansion.has(s)) return expansion.get(s);
    const r = rules[s - k];
    const e = [...expand(r.pair[0]), ...expand(r.pair[1])];
    expansion.set(s, e);
    return e;
  };
  // Uses: occurrences in the final sequence plus occurrences inside other rules, propagated top-down.
  const uses = new Map();
  for (const s of seq) if (s >= k) uses.set(s, (uses.get(s) ?? 0) + 1);
  for (let i = rules.length - 1; i >= 0; i--) {
    const u = uses.get(rules[i].symbol) ?? 0;
    for (const c of rules[i].pair) if (c >= k) uses.set(c, (uses.get(c) ?? 0) + u);
  }
  const fmt = (arr) => arr.map((s) => (labels ? labels[s] : s)).join(labels && labels.some((l) => l.length > 1) ? '·' : '');
  const described = rules.map((r) => {
    const e = expand(r.symbol);
    const u = uses.get(r.symbol) ?? 0;
    return { symbol: `R${r.symbol - k}`, pair: r.pair.map((p) => (p < k ? fmt([p]) : `R${p - k}`)), expansion: fmt(e), length: e.length, uses: u, coverage: u * e.length, count_at_creation: r.count_at_creation };
  });
  const size = seq.length + 2 * rules.length;
  // Spans of top-level symbols in the original sequence: the grammar's segmentation.
  const boundaries = [];
  let pos = 0;
  for (const s of seq) { pos += expand(s).length; boundaries.push(pos); }
  boundaries.pop();
  return {
    n: symbols.length,
    rules: described,
    rule_count: rules.length,
    final_length: seq.length,
    grammar_size: size,
    compression_ratio: symbols.length ? size / symbols.length : 1,
    boundaries,
    semantic_interpretation: null,
  };
}

/** Top rules by coverage (uses × length) with expansion length ≥ minLength: a comparable signature. */
export function grammarSignature(g, { top = 16, minLength = 6 } = {}) {
  return [...g.rules].filter((r) => r.length >= minLength).sort((a, b) => b.coverage - a.coverage || (a.expansion < b.expansion ? -1 : 1)).slice(0, top).map((r) => r.expansion);
}

export function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return null;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Most frequent L-grams with expected counts under (a) i.i.d. symbols with the
 * observed frequencies and (b) the observed first-order Markov chain. A motif
 * is "over-represented" only relative to a stated null model.
 */
export function motifs(x, k, L = 3, top = 8) {
  const n = x.length;
  const p = new Array(k).fill(0);
  for (const s of x) p[s]++;
  for (let i = 0; i < k; i++) p[i] /= n;
  const T = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i + 1 < n; i++) T[x[i]][x[i + 1]]++;
  const rows = T.map((r) => r.reduce((a, b) => a + b, 0));
  const counts = new Map();
  for (let i = 0; i + L <= n; i++) {
    const key = x.slice(i, i + L).join('');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const windows = n - L + 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, top)
    .map(([key, c]) => {
      const s = [...key].map(Number);
      const iid = windows * s.reduce((a, v) => a * p[v], 1);
      let mk = windows * p[s[0]];
      for (let i = 1; i < s.length; i++) mk *= rows[s[i - 1]] ? T[s[i - 1]][s[i]] / rows[s[i - 1]] : 0;
      return { motif: key, count: c, expected_iid: iid, expected_markov1: mk, ratio_iid: iid ? c / iid : null, ratio_markov1: mk ? c / mk : null };
    });
}

/** Precision/recall of predicted boundary positions against reference boundaries. */
export function boundaryAgreement(predicted, reference, n) {
  const R = new Set(reference);
  const hits = predicted.filter((b) => R.has(b)).length;
  const baseline = n > 1 ? reference.length / (n - 1) : 0; // precision of boundaries placed at random
  return { predicted: predicted.length, reference: reference.length, precision: predicted.length ? hits / predicted.length : null, recall: reference.length ? hits / reference.length : null, random_precision_baseline: baseline };
}
