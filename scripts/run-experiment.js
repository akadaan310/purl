// npm run experiment -- exp-0001
// Materialises datasets, writes raw data, runs the analysis, writes record.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { runExperiment } from '../src/research/experiment.js';
import { loadProtocolSchemas } from '../src/core/schema.js';
import { materialise } from './lib/datasets.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function environment() {
  let commit = null;
  try { commit = execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout */ }
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return { version: { purl: pkg.version, record_schema: '0.1', git_commit: commit }, environment: { node: process.version, platform: process.platform, arch: process.arch } };
}

export function execute(id, { write = true } = {}) {
  const dir = join(ROOT, 'experiments', id);
  const def = JSON.parse(readFileSync(join(dir, 'definition.json'), 'utf8'));
  const datasets = materialise(def);
  const rawFiles = {};
  if (write) {
    mkdirSync(join(dir, 'data'), { recursive: true });
    for (const [name, ds] of Object.entries(datasets)) {
      rawFiles[name] = `experiments/${id}/data/${name}.json`;
      writeFileSync(join(ROOT, rawFiles[name]), JSON.stringify({ category: 'observation', dataset: name, alphabet: ds.alphabet, units: ds.units, source: ds.source, symbols: ds.symbols, times: ds.times, ...(ds.invocations ? { invocations: ds.invocations } : {}), ...(ds.raw_events ? { events: ds.raw_events } : {}) }) + '\n');
    }
  } else for (const name of Object.keys(datasets)) rawFiles[name] = `experiments/${id}/data/${name}.json`;
  const { version, environment: env } = environment();
  const record = runExperiment(def, datasets, { timestamp: new Date().toISOString(), version, environment: env, rawFiles });
  const errors = loadProtocolSchemas().validate('urn:purl:schema:experiment-record', record);
  if (errors.length) throw new Error(`record does not match schema: ${JSON.stringify(errors.slice(0, 5))}`);
  return { record, dir };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const id = process.argv[2] ?? 'exp-0001';
  const t0 = Date.now();
  const { record, dir } = execute(id);
  writeFileSync(join(dir, 'record.json'), JSON.stringify(record, null, 1) + '\n');
  console.log(`${id}: ${Object.keys(record.observations.datasets).length} datasets analysed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`output_hash ${record.output_hash}`);
  for (const h of record.hypotheses) console.log(`  ${h.id.padEnd(4)} ${h.status.padEnd(14)} ${h.statement}`);
}
