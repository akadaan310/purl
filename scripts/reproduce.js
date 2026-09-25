// npm run reproduce -- exp-0001
// Re-runs an experiment from its definition and compares against the committed record.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize, roundDeep } from '../src/core/canonical.js';
import { execute } from './run-experiment.js';

const id = process.argv[2] ?? 'exp-0001';
const { record, dir } = execute(id, { write: false });
const committed = JSON.parse(readFileSync(join(dir, 'record.json'), 'utf8'));

const rawDiff = Object.keys(committed.observations.datasets).filter((k) => committed.observations.datasets[k].raw_sha256 !== record.observations.datasets[k]?.raw_sha256);
const paths = [];
const walk = (a, b, p) => {
  if (paths.length > 20) return;
  if (canonicalize(roundDeep(a ?? null, 10)) === canonicalize(roundDeep(b ?? null, 10))) return;
  if (a && b && typeof a === 'object' && typeof b === 'object') for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], `${p}/${k}`);
  else paths.push(p);
};
walk(committed.transformations.outputs, record.transformations.outputs, '');
const ok = committed.output_hash === record.output_hash;
console.log(`${id}: committed ${committed.output_hash}`);
console.log(`${id}: rerun     ${record.output_hash}`);
console.log(ok ? 'REPRODUCED — raw data, all transformation outputs and hypothesis outcomes match.' : 'DIVERGED');
if (!ok) {
  console.log(`raw data differing: ${rawDiff.join(', ') || 'none'}`);
  console.log(`first differing output paths:\n  ${paths.join('\n  ')}`);
  console.log(`environment then: ${JSON.stringify(committed.environment)} now: ${JSON.stringify(record.environment)}`);
  process.exitCode = 1;
}
