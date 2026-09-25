// Enforces the dependency rule in ARCHITECTURE.md: Layer 1 and Layer 2 never
// import each other or Layer 0; core imports only the standard library.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const ALLOWED = { core: ['core'], continuity: ['core', 'continuity'], research: ['core', 'research'], transport: ['core', 'continuity', 'research', 'transport'], client: ['core', 'continuity', 'client'] };

test('layer import rule', () => {
  const violations = [];
  for (const layer of Object.keys(ALLOWED)) {
    for (const file of readdirSync(join(SRC, layer)).filter((f) => f.endsWith('.js'))) {
      const text = readFileSync(join(SRC, layer, file), 'utf8');
      for (const [, spec] of text.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        if (!spec) continue;
        if (spec.startsWith('node:')) continue;
        if (!spec.startsWith('.')) { violations.push(`${layer}/${file}: third-party import ${spec}`); continue; }
        const target = spec.startsWith('./') ? layer : spec.split('/')[1];
        if (!ALLOWED[layer].includes(target)) violations.push(`${layer}/${file} imports ${spec}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
