import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entropy, lz76, transitionCounts, transitionMatrix, runLengths, entropyProfile, autocorrelation, dominantPeriod, lagMutualInformation, conditionalEntropy, changes } from '../src/research/measures.js';
import { burstiness, memoryCoefficient, fanoFactor, differences, intervals } from '../src/research/temporal.js';
import { transitionGraph } from '../src/research/graph.js';
import { repair, jaccard, motifs, boundaryAgreement } from '../src/research/grammar.js';
import { shuffle, markovSurrogate, surrogateTest, relabel } from '../src/research/surrogates.js';
import { rng } from '../src/research/rng.js';
import { generate } from '../src/research/generators.js';
import { EVENT_KINDS, projectEvents, invocationBoundaries } from '../src/research/projection.js';
import { PRIMITIVES } from '../src/continuity/reducer.js';
import { evaluate, evaluateHypotheses } from '../src/research/experiment.js';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('entropy of known distributions', () => {
  close(entropy([1, 1]), 1);
  close(entropy([1, 1, 1, 1]), 2);
  close(entropy([5, 0]), 0);
  close(entropy([1, 3]), 0.8112781244591328);
});

test('LZ76 reproduces the Lempel–Ziv (1976) textbook example (0·001·10·100·1000·101 → 6)', () => {
  assert.equal(lz76([...'0001101001000101'].map(Number)).c, 6);
  assert.equal(lz76([0, 0, 0, 0, 0, 0, 0, 0]).c, 2);
  const random = generate({ generator: 'iid', params: { n: 4096, p1: 0.5 }, seed: 3 }).symbols;
  assert.ok(lz76(random).normalized > 0.9, 'random sequences normalise near 1');
});

test('transition matrix, changes and runs on a hand-checked sequence', () => {
  const x = [0, 0, 1, 1, 1, 0, 1];
  assert.deepEqual(transitionCounts(x, 2), [[1, 2], [1, 2]]); // 0→0, 0→1 ×2, 1→0, 1→1 ×2
  assert.deepEqual(transitionMatrix([[1, 2], [0, 0]]), [[1 / 3, 2 / 3], null]);
  assert.deepEqual(changes(x, 2), { count: 3, per_step: 3 / 6, directed: { '0->1': 2, '1->0': 1 } });
  const rl = runLengths(x);
  assert.equal(rl.runs, 4);
  assert.deepEqual(rl.bySymbol[1].distribution, { 1: 1, 3: 1 });
});

test('entropy profile: periodic sequence has zero conditional entropy once the period is covered', () => {
  const x = Array.from({ length: 400 }, (_, i) => [0, 0, 1][i % 3]);
  const p = entropyProfile(x, 2, 4);
  close(p[0].H, entropy([2, 1]), 1e-2);
  assert.ok(p[2].h < 1e-9);
  assert.equal(p[3].reliable, true);
});

test('lag2copy: invisible to the first-order transition matrix, visible to h_3', () => {
  const x = generate({ generator: 'lag2copy', params: { n: 8000, eps: 0.05 }, seed: 11 }).symbols;
  const P = transitionMatrix(transitionCounts(x, 2));
  close(P[0][0], 0.5, 0.03);
  close(conditionalEntropy(x, 2), 1, 0.01);
  close(conditionalEntropy(x, 3), 0.2864, 0.03); // H_b(0.05)
  close(lagMutualInformation(x, 2, 2), 1 - 0.2864, 0.03);
});

test('autocorrelation finds the period of a noiseless periodic sequence', () => {
  const x = generate({ generator: 'periodic', params: { n: 1024, pattern: '00101101' }, seed: 1 }).symbols;
  assert.equal(dominantPeriod(autocorrelation(x, 32), x.length).period, 8);
  const iid = generate({ generator: 'iid', params: { n: 1024 }, seed: 1 }).symbols;
  assert.ok(Math.abs(autocorrelation(iid, 1)[0]) < 0.1);
});

test('temporal measures: burstiness −1 for a regular clock, ≈0 for Poisson; Fano, differences', () => {
  close(burstiness([1, 1, 1, 1]), -1);
  const t = generate({ generator: 'iid', params: { n: 20000 }, timer: 'poisson', timer_params: { rate: 2 }, seed: 5 }).times;
  close(burstiness(intervals(t)), 0, 0.03);
  close(memoryCoefficient(intervals(t)), 0, 0.03);
  close(fanoFactor([2, 2, 2]), 0);
  assert.deepEqual(differences([1, 4, 9, 16], 2), [2, 2]);
});

test('transition graph: SCCs, closed classes, periods and boundary artefacts', () => {
  const g = transitionGraph([0, 1, 0, 1, 0, 1], { order: 1 });
  assert.deepEqual(g.analysis.closed_classes.map((c) => [c.members, c.period]), [[['0', '1'], 2]]);
  close(g.analysis.closed_classes[0].stationary['0'], 0.5, 1e-6);
  const h = transitionGraph([0, 0, 0, 1], { order: 1 });
  const sink = h.analysis.closed_classes.find((c) => c.members[0] === '1');
  assert.equal(sink.boundary_artifact, true, 'a sink seen only at the end of observation is flagged');
  assert.deepEqual(h.analysis.transient, ['0']);
  const o2 = transitionGraph([0, 1, 1, 0, 1, 1, 0], { order: 2, labels: ['0', '1'] });
  assert.deepEqual(o2.nodes.map((n) => n.id), ['01', '10', '11']);
  assert.ok(o2.analysis.cycles.some((c) => c.length === 3));
});

test('Re-Pair compresses repetition, is deterministic, and never interprets', () => {
  const x = [...'abcabcabcabc'].map((c) => 'abc'.indexOf(c));
  const g = repair(x, { k: 3, labels: ['a', 'b', 'c'] });
  assert.ok(g.compression_ratio < 1);
  assert.ok(g.rules.some((r) => r.expansion === 'abcabc' || r.expansion === 'abc'));
  assert.deepEqual(repair(x, { k: 3 }), repair(x, { k: 3 }));
  assert.equal(g.semantic_interpretation, null);
  const iid = generate({ generator: 'iid', params: { n: 512 }, seed: 9 }).symbols;
  assert.ok(repair(iid).compression_ratio > repair(generate({ generator: 'periodic', params: { n: 512, pattern: '0110' }, seed: 9 }).symbols).compression_ratio);
});

test('motifs report expectations under stated null models', () => {
  const m = motifs([0, 1, 0, 1, 0, 1, 0, 1], 2, 2, 2);
  assert.equal(m[0].motif, '01');
  close(m[0].expected_iid, 7 * 0.25);
  assert.ok(m[0].ratio_markov1 > 0);
});

test('surrogates: shuffle preserves counts; Markov surrogate preserves transition structure; p-values in (0,1]', () => {
  const r = rng(1);
  const x = generate({ generator: 'markov', params: { n: 5000, P: [[0.9, 0.1], [0.3, 0.7]] }, seed: 2 }).symbols;
  assert.deepEqual([...shuffle(x, r)].sort(), [...x].sort());
  const y = markovSurrogate(x, 2, r);
  close(transitionMatrix(transitionCounts(y, 2))[0][0], 0.9, 0.03);
  const t = surrogateTest((s) => conditionalEntropy(s, 2), x, shuffle, 19, r);
  assert.equal(t.p, 1 / 20);
  assert.deepEqual(relabel([0, 1, 1], [1, 0]), [1, 0, 0]);
});

test('seeded generators are reproducible', () => {
  const spec = { generator: 'markov', params: { n: 100, P: [[0.5, 0.5], [0.5, 0.5]] }, timer: 'bursty', seed: 42 };
  assert.deepEqual(generate(spec), generate(spec));
});

test('projection alphabet matches the Layer 1 primitive list; boundaries come from invocations', () => {
  assert.deepEqual(EVENT_KINDS, Object.keys(PRIMITIVES));
  const events = [
    { kind: 'genesis', at: '2026-01-01T00:00:00Z', actor: 'p_1', invocation: 'i_1' },
    { kind: 'append', at: '2026-01-01T00:00:02Z', actor: 'p_1', invocation: 'i_2' },
    { kind: 'grant', at: '2026-01-01T00:00:02Z', actor: 'p_1', invocation: 'i_2' },
    { kind: 'assign', at: '2026-01-01T00:00:02Z', actor: 'p_2', invocation: 'i_2' },
  ];
  const k = projectEvents(events, 'kind');
  assert.deepEqual(k.symbols, [0, 2, 3, 5]);
  assert.deepEqual(k.times, [0, 2, 2, 2]);
  assert.deepEqual(projectEvents(events, 'authority').symbols, [0, 0, 1, 1]);
  assert.deepEqual(projectEvents(events, 'actor_change').symbols, [0, 0, 0, 1]);
  assert.deepEqual(invocationBoundaries(k.invocations), [1]);
  assert.deepEqual(boundaryAgreement([1, 3], [1], 4), { predicted: 2, reference: 1, precision: 0.5, recall: 1, random_precision_baseline: 1 / 3 });
  assert.equal(jaccard(['a', 'b'], ['b', 'c']), 1 / 3);
});

test('hypothesis criteria evaluate to supported / not_supported / indeterminate', () => {
  const out = { a: { p: 0.01, h: 0.3 }, b: { j: 0.9 }, c: { j: 0.2 } };
  assert.equal(evaluate({ path: 'a.p', op: '<=', value: 0.05 }, out).result, true);
  assert.equal(evaluate({ all: [{ path: 'a.p', op: '<=', value: 0.05 }, { path: 'a.h', op: 'approx', value: 0.29, tolerance: 0.02 }] }, out).result, true);
  assert.equal(evaluate({ path: 'b.j', op: '>=', ref: 'c.j', offset: 0.3 }, out).result, true);
  assert.equal(evaluate({ path: 'missing.x', op: '<', value: 1 }, out).result, null);
  const [h] = evaluateHypotheses([{ id: 'H', statement: 's', criterion: { path: 'a.p', op: '>', value: 0.05 } }], out);
  assert.equal(h.status, 'not_supported');
  assert.equal(h.category, 'hypothesis');
});
