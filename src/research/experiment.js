// Experiment runner. Given a definition (datasets, analysis configuration,
// pre-registered hypotheses with machine-evaluable criteria) and materialised
// datasets, produce an experiment record whose sections keep the epistemic
// categories apart. The runner never writes interpretations or conclusions.
import { hashOf, roundDeep, canonicalize } from '../core/canonical.js';
import { rng, hashSeed } from './rng.js';
import { symbolicSummary, conditionalEntropy, lz76, autocorrelation, dominantPeriod, entropy, counts, changes } from './measures.js';
import { temporalSummary, intervals, burstiness, memoryCoefficient } from './temporal.js';
import { transitionGraph } from './graph.js';
import { repair, grammarSignature, jaccard, motifs, boundaryAgreement } from './grammar.js';
import { shuffle, markovSurrogate, bitflip, relabel, rescaleTimes, exponentialIntervals, surrogateTest } from './surrogates.js';
import { invocationBoundaries } from './projection.js';

export const RECORD_SCHEMA = 'purl.experiment-record/0.1';

export const TRANSFORMATIONS = [
  { id: 'counts', name: 'symbol counts and proportions', ref: 'docs/research/MEASURES.md#counts' },
  { id: 'H1', name: 'Shannon entropy of the marginal distribution', ref: 'docs/research/MEASURES.md#entropy' },
  { id: 'transition-matrix', name: 'first-order transition counts and ML matrix', ref: 'docs/research/MEASURES.md#transition-matrix' },
  { id: 'changes', name: 'symbol change count, rate and direction', ref: 'docs/research/MEASURES.md#changes' },
  { id: 'run-lengths', name: 'run-length distribution per symbol', ref: 'docs/research/MEASURES.md#run-lengths' },
  { id: 'entropy-profile', name: 'block entropies H_L and conditional entropies h_L', ref: 'docs/research/MEASURES.md#entropy-profile' },
  { id: 'lz76', name: 'Lempel–Ziv 1976 complexity (normalised)', ref: 'docs/research/MEASURES.md#lz76' },
  { id: 'acf', name: 'sample autocorrelation and candidate period', ref: 'docs/research/MEASURES.md#autocorrelation' },
  { id: 'lag-mi', name: 'lagged mutual information', ref: 'docs/research/MEASURES.md#mutual-information' },
  { id: 'temporal', name: 'interval statistics, burstiness, memory, Fano factor, finite differences', ref: 'docs/research/MEASURES.md#temporal' },
  { id: 'graph', name: 'order-m empirical transition graph, SCCs, closed classes, periods, stationary distributions, cycles', ref: 'docs/research/MEASURES.md#transition-graph' },
  { id: 'repair', name: 'Re-Pair grammar compression', ref: 'docs/research/MEASURES.md#grammar' },
  { id: 'motifs', name: 'L-gram motifs vs i.i.d. and Markov-1 expectations', ref: 'docs/research/MEASURES.md#motifs' },
  { id: 'surrogates', name: 'Monte-Carlo surrogate tests', ref: 'docs/research/MEASURES.md#surrogates' },
  { id: 'invariance', name: 'invariance under relabelling and time rescaling', ref: 'docs/research/MEASURES.md#invariance' },
  { id: 'perturbation', name: 'persistence under symbol flips', ref: 'docs/research/MEASURES.md#perturbation' },
  { id: 'convergence', name: 'Jaccard overlap of grammar signatures across independent datasets', ref: 'docs/research/MEASURES.md#convergence' },
];

export function analyzeDataset(ds, cfg, seed) {
  const k = ds.alphabet.length;
  const x = ds.symbols;
  const r = rng(seed);
  const L = k === 2 ? cfg.max_block_length >= 3 ? 3 : 2 : 2; // conditioning depth that stays reliable for the alphabet size
  const out = { k, symbolic: symbolicSummary(x, k, { maxL: k === 2 ? cfg.max_block_length : 3, maxLag: cfg.max_lag }) };
  if (ds.units !== 'index') out.temporal = temporalSummary(ds.times, x);
  out.graph = { order1: transitionGraph(x, { order: 1, labels: ds.alphabet }) };
  if (k === 2) out.graph.order2 = transitionGraph(x, { order: 2, labels: ds.alphabet });
  const gx = x.slice(0, cfg.grammar_max_n);
  const g = repair(gx, { k, labels: ds.alphabet });
  out.grammar = { ...g, rules: g.rules.slice().sort((a, b) => b.coverage - a.coverage).slice(0, 12), boundaries: undefined, signature: grammarSignature(g, cfg.signature ?? {}) };
  out.motifs = motifs(x, k, 3, 8);

  const hL = (y) => conditionalEntropy(y, L);
  const N = cfg.surrogates;
  out.tests = {
    cond_entropy_L: L,
    cond_entropy_vs_shuffle: surrogateTest(hL, x, shuffle, N, r.fork('t1')),
    cond_entropy_vs_markov1: surrogateTest(hL, x, (y, rr) => markovSurrogate(y, k, rr), N, r.fork('t2')),
    lz76_vs_shuffle: surrogateTest((y) => lz76(y, k).normalized, x, shuffle, N, r.fork('t3')),
    grammar_ratio_vs_shuffle: surrogateTest((y) => repair(y, { k }).compression_ratio, gx, shuffle, cfg.grammar_surrogates, r.fork('t4')),
  };
  if (out.temporal) {
    const dt = intervals(ds.times);
    out.tests.burstiness_vs_poisson = surrogateTest(burstiness, dt, exponentialIntervals, N, r.fork('t5'), 'greater');
    out.tests.memory_vs_interval_shuffle = surrogateTest(memoryCoefficient, dt, shuffle, N, r.fork('t6'), 'greater');
  }

  if (ds.invocations) {
    out.bridge = {
      reference: 'invocation boundaries (events produced by one operation call)',
      grammar_segmentation: boundaryAgreement(g.boundaries, invocationBoundaries(ds.invocations.slice(0, gx.length)), gx.length),
    };
  }

  if (k === 2) {
    out.invariance = invariance(ds, cfg);
    out.perturbation = perturbation(x, cfg, r.fork('perturb'), L);
  }
  return out;
}

function invariance(ds, cfg) {
  const x = ds.symbols;
  const y = relabel(x, [1, 0]);
  const pick = (s) => ({
    proportion_of_symbol_1: counts(s, 2)[1] / s.length,
    mean_run_length_of_symbol_1: meanRun(s, 1),
    entropy_H1: entropy(counts(s, 2)),
    conditional_entropy_h3: conditionalEntropy(s, 3),
    lz76_normalized: lz76(s, 2).normalized,
    change_count: changes(s, 2).count,
    autocorrelation_lag1: autocorrelation(s, 1)[0],
    period: dominantPeriod(autocorrelation(s, cfg.max_lag), s.length).period,
  });
  const a = pick(x), b = pick(y);
  const relabelTable = Object.fromEntries(Object.keys(a).map((m) => [m, { original: a[m], relabelled: b[m], invariant: close(a[m], b[m]) }]));
  const out = { relabel: { transformation: 'swap symbols 0 ↔ 1', measures: relabelTable } };
  if (ds.units !== 'index') {
    const t2 = rescaleTimes(ds.times, 1000);
    const s1 = temporalSummary(ds.times, x);
    const s2 = temporalSummary(t2, x);
    const tm = { event_rate: [s1.event_rate, s2.event_rate], mean_interval: [s1.intervals.mean, s2.intervals.mean], burstiness: [s1.burstiness, s2.burstiness], interval_cv: [s1.intervals.cv, s2.intervals.cv], memory_coefficient: [s1.memory_coefficient, s2.memory_coefficient], change_count: [s1.changes.count, s2.changes.count], fano_factor: [s1.changes.fano_factor, s2.changes.fano_factor] };
    out.time_rescale = { transformation: 'multiply all times by 1000 (e.g. seconds → milliseconds)', measures: Object.fromEntries(Object.entries(tm).map(([m, [p, q]]) => [m, { original: p, rescaled: q, invariant: close(p, q) }])) };
  }
  return out;
}

function perturbation(x, cfg, r, L) {
  const base = { cond_entropy: conditionalEntropy(x, L), period: dominantPeriod(autocorrelation(x, cfg.max_lag), x.length).period, grammar_ratio: repair(x.slice(0, cfg.grammar_max_n)).compression_ratio };
  const levels = cfg.perturbation_levels.map((eps) => {
    const reps = [];
    for (let i = 0; i < cfg.perturbation_replicates; i++) {
      const y = bitflip(x, eps, r.fork(`${eps}:${i}`));
      reps.push({ h: conditionalEntropy(y, L), period: dominantPeriod(autocorrelation(y, cfg.max_lag), y.length).period, g: repair(y.slice(0, cfg.grammar_max_n)).compression_ratio });
    }
    const m = (f) => reps.reduce((a, v) => a + f(v), 0) / reps.length;
    return { eps, replicates: reps.length, cond_entropy_mean: m((v) => v.h), grammar_ratio_mean: m((v) => v.g), period_values: reps.map((v) => v.period), period_agreement: reps.filter((v) => v.period === base.period).length / reps.length };
  });
  return { flip: 'each symbol independently flipped with probability eps', baseline: base, levels };
}

function meanRun(s, sym) {
  let runs = 0, total = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === sym) { total++; if (i === 0 || s[i - 1] !== sym) runs++; }
  return runs ? total / runs : 0;
}
const close = (a, b) => (a === null || b === null ? a === b : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)));

export function convergence(analyses, replicateGroups) {
  const names = Object.keys(analyses);
  const pairs = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = names[i], b = names[j];
    if (analyses[a].k !== 2 || analyses[b].k !== 2) continue;
    const ga = groupOf(a, replicateGroups), gb = groupOf(b, replicateGroups);
    pairs.push({ a, b, same_generator: ga === gb, group: ga === gb ? ga : null, jaccard: jaccard(analyses[a].grammar.signature, analyses[b].grammar.signature) });
  }
  const mean = (arr) => {
    const v = arr.map((p) => p.jaccard).filter((j) => j !== null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const within = {};
  for (const g of Object.keys(replicateGroups)) within[g] = mean(pairs.filter((p) => p.group === g));
  return { signature: 'top grammar rules by coverage with expansion length ≥ 6', pairs, within_generator_mean: within, cross_generator_mean: mean(pairs.filter((p) => !p.same_generator)) };
}
function groupOf(name, groups) {
  for (const [g, members] of Object.entries(groups)) if (members.includes(name)) return g;
  return name;
}

// ---- hypotheses -------------------------------------------------------------------------
export function getPath(obj, path) {
  let cur = obj;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

export function evaluate(pred, outputs) {
  if (pred.all) {
    const parts = pred.all.map((p) => evaluate(p, outputs));
    return { result: parts.some((p) => p.result === null) ? null : parts.every((p) => p.result), parts };
  }
  if (pred.any) {
    const parts = pred.any.map((p) => evaluate(p, outputs));
    return { result: parts.some((p) => p.result === true) ? true : parts.some((p) => p.result === null) ? null : false, parts };
  }
  const value = getPath(outputs, pred.path);
  const target = pred.ref !== undefined ? getPath(outputs, pred.ref) + (pred.offset ?? 0) : pred.value;
  if (value === undefined || target === undefined || (typeof value === 'number' && Number.isNaN(value))) return { path: pred.path, value: value ?? null, result: null };
  const ops = {
    '<': () => value < target, '<=': () => value <= target, '>': () => value > target, '>=': () => value >= target,
    '==': () => canonicalize(value) === canonicalize(target), '!=': () => canonicalize(value) !== canonicalize(target),
    approx: () => Math.abs(value - target) <= pred.tolerance,
  };
  if (!ops[pred.op]) throw new Error(`unknown operator ${pred.op}`);
  return { path: pred.path, op: pred.op, value, target, ...(pred.tolerance !== undefined ? { tolerance: pred.tolerance } : {}), result: ops[pred.op]() };
}

export function evaluateHypotheses(hypotheses, outputs) {
  return hypotheses.map((h) => {
    const e = evaluate(h.criterion, outputs);
    return { category: 'hypothesis', id: h.id, statement: h.statement, rationale: h.rationale ?? null, criterion: h.criterion, status: e.result === true ? 'supported' : e.result === false ? 'not_supported' : 'indeterminate', evaluation: e };
  });
}

// ---- record ----------------------------------------------------------------------------
export function runExperiment(def, datasets, { timestamp, version, environment, rawFiles = {} }) {
  const cfg = def.analysis;
  const analyses = {};
  for (const [name, ds] of Object.entries(datasets)) analyses[name] = analyzeDataset(ds, cfg, hashSeed(`${def.id}:${name}:${def.seed}`));
  const cross = { convergence: convergence(analyses, def.replicate_groups ?? {}) };
  const outputs = { datasets: analyses, cross };
  const hypotheses = evaluateHypotheses(def.hypotheses, outputs);

  const observations = Object.fromEntries(Object.entries(datasets).map(([name, ds]) => [name, {
    n: ds.symbols.length,
    alphabet: ds.alphabet,
    units: ds.units,
    source: ds.source,
    raw_file: rawFiles[name] ?? null,
    raw_sha256: hashOf({ symbols: ds.symbols, times: roundDeep(ds.times, 12) }),
    preview: ds.symbols.slice(0, 64).join(''),
  }]));

  const uncertainty = {
    category: 'uncertainty',
    notes: [
      `Monte-Carlo p-values use ${cfg.surrogates} surrogates (${cfg.grammar_surrogates} for grammar); the smallest attainable p is 1/(N+1).`,
      'Plug-in entropy estimates are biased low for long blocks; entropy_profile rows with reliable=false should not be interpreted.',
      'Each hypothesis is evaluated once at alpha = 0.05 with no multiple-comparison correction; with ~10 criteria, about one false positive or negative is expected by chance.',
      'Datasets are single realisations per seed (plus the declared replicates); variability across seeds is only sampled through replicates and perturbation replicates.',
      'Floats are rounded to 10 significant digits before hashing so the output hash is stable across platforms with different last-ulp libm behaviour.',
    ],
    per_dataset: Object.fromEntries(Object.entries(analyses).map(([name, a]) => [name, { n: a.symbolic.n, unreliable_block_lengths: a.symbolic.entropy_profile.filter((r) => !r.reliable).map((r) => r.L), min_attainable_p: 1 / (cfg.surrogates + 1) }])),
  };

  const record = {
    schema: RECORD_SCHEMA,
    experiment_id: def.id,
    title: def.title,
    question: def.question,
    run: { timestamp },
    version,
    environment,
    configuration: def,
    observations: { category: 'observation', datasets: observations },
    transformations: { category: 'transformation', catalogue: TRANSFORMATIONS, outputs },
    hypotheses,
    interpretation: { category: 'interpretation', entries: [], note: 'The runner does not interpret. Human-authored interpretation, clearly attributed, lives in the experiment\'s REPORT.md.' },
    uncertainty,
    conclusions: { category: 'conclusion', entries: [], note: 'Never written by the runner.' },
  };
  record.output_hash = outputHash(record);
  return record;
}

/** Hash of everything that must reproduce: raw-data hashes, transformation outputs, hypothesis outcomes. */
export function outputHash(record) {
  return hashOf(roundDeep({
    raw: Object.fromEntries(Object.entries(record.observations.datasets).map(([k, v]) => [k, v.raw_sha256])),
    outputs: record.transformations.outputs,
    hypotheses: record.hypotheses.map((h) => [h.id, h.status]),
  }, 10));
}
