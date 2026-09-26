// Re-run exp-0002 (without timing, which is outside the output hash) and
// compare with the committed record, section by section.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeComposition } from './composition-experiment.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'experiments', 'exp-0002');

export async function reproduceComposition() {
  const committed = JSON.parse(readFileSync(join(DIR, 'record.json'), 'utf8'));
  const { record } = await executeComposition({ timing: false });
  const a = committed.reproducibility;
  const b = record.reproducibility;
  console.log(`exp-0002: committed ${a.output_hash}`);
  console.log(`exp-0002: rerun     ${b.output_hash}`);
  for (const k of Object.keys({ ...a.section_hashes, ...b.section_hashes })) {
    console.log(`  ${a.section_hashes[k] === b.section_hashes[k] ? 'same     ' : 'DIFFERENT'} ${k}`);
  }
  const ok = a.output_hash === b.output_hash;
  console.log(ok ? 'REPRODUCED — every hashed observation, transformation and hypothesis outcome matches.' : 'DIVERGED — see the sections marked DIFFERENT (observations.handoff_outcomes is null when the ACSP checkout is unavailable).');
  if (!ok) console.log(`environment then: ${JSON.stringify(committed.environment)} now: ${JSON.stringify(record.environment)}`);
  return ok ? 0 : 1;
}
