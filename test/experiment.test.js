import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runExperiment } from '../src/research/experiment.js';
import { loadProtocolSchemas } from '../src/core/schema.js';
import { materialise } from '../scripts/lib/datasets.js';

const def = {
  id: 'exp-9999',
  title: 'reproducibility fixture',
  question: 'does the runner reproduce?',
  seed: 7,
  analysis: { max_block_length: 4, max_lag: 16, surrogates: 9, grammar_surrogates: 3, grammar_max_n: 256, perturbation_levels: [0.05], perturbation_replicates: 2 },
  datasets: {
    a: { generator: 'markov', params: { n: 256, P: [[0.9, 0.1], [0.3, 0.7]] }, timer: 'poisson', seed: 1 },
    b: { generator: 'iid', params: { n: 256 }, seed: 2 },
    w: { source: 'purl-workload', params: { invocations: 40 }, projection: 'kind', seed: 3 },
  },
  replicate_groups: { g: ['a', 'b'] },
  hypotheses: [{ id: 'H', statement: 'markov data beat shuffles', criterion: { path: 'datasets.a.tests.cond_entropy_vs_shuffle.p', op: '<=', value: 0.1 } }],
};
const ctx = { timestamp: '2026-01-01T00:00:00.000Z', version: { purl: '0.1.0', record_schema: '0.1' }, environment: { node: process.version, platform: process.platform, arch: process.arch } };

test('an experiment rerun from its definition reproduces the output hash', () => {
  const r1 = runExperiment(def, materialise(def), ctx);
  const r2 = runExperiment(def, materialise(def), { ...ctx, timestamp: '2027-01-01T00:00:00.000Z' });
  assert.equal(r1.output_hash, r2.output_hash);
  assert.deepEqual(loadProtocolSchemas().validate('urn:purl:schema:experiment-record', r1), []);
  assert.deepEqual(r1.conclusions.entries, [], 'the runner never concludes');
  assert.deepEqual(r1.interpretation.entries, [], 'the runner never interprets');
  const changed = runExperiment({ ...def, seed: 8 }, materialise(def), ctx);
  assert.notEqual(changed.output_hash, r1.output_hash, 'a different analysis seed changes surrogate draws');
});

test('the committed exp-0001 record validates and its hypotheses were not edited after registration', () => {
  const record = JSON.parse(readFileSync(new URL('../experiments/exp-0001/record.json', import.meta.url)));
  const definition = JSON.parse(readFileSync(new URL('../experiments/exp-0001/definition.json', import.meta.url)));
  assert.deepEqual(loadProtocolSchemas().validate('urn:purl:schema:experiment-record', record), []);
  assert.deepEqual(record.configuration.hypotheses, definition.hypotheses);
});
