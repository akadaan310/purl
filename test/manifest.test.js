// Bridge manifest v3 (STASIS-3 phase 4): the committed manifest is consistent with its declared
// sources (circle/components.json, circle/PROJECTION-MATRIX.json). Regenerate: npm run bridge:manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const J = (f) => JSON.parse(readFileSync(new URL(`../circle/${f}`, import.meta.url), 'utf8'));
const M = J('bridge-manifest.json'), C = J('components.json'), PM = J('PROJECTION-MATRIX.json');
const FIELDS = ['name', 'repository', 'branch', 'commit', 'protocol', 'role', 'input_kinds', 'output_kinds', 'operations', 'safe_operations', 'mutating_operations',
  'constitutional_artifact', 'nomenclature_artifact', 'test_suite', 'research_status', 'projection_boundaries', 'known_information_loss', 'security_boundary', 'deployment', 'reconstruction_method'];

test('every component carries every XXIV field, with provenance', () => {
  assert.equal(M.format, 'bridge-manifest/3');
  assert.deepEqual(M.components.map((c) => c.name), C.components.map((c) => c.name));
  for (const c of M.components) {
    for (const f of FIELDS) assert.ok(f in c, `${c.name}.${f}`);
    assert.ok(c.provenance.generated.length && c.provenance.declared.length);
  }
});

test('declared projection boundaries exist in the measured matrix', () => {
  const ids = new Set([...PM.measured, ...PM.declared].map((b) => b.id));
  for (const c of C.components) for (const id of c.projection_boundaries) assert.ok(ids.has(id), `${c.name}: ${id}`);
});

test('safe and mutating operations partition the extracted operations', () => {
  for (const c of M.components) {
    if (!c.operations) { assert.equal(c.safe_operations, null); continue; }
    assert.equal(c.safe_operations.length + c.mutating_operations.length, c.operations.length, c.name);
  }
  // the method rule has a known exception, which must be stated where the boundary is declared
  const g = M.components.find((c) => c.name === 'golden-surface');
  if (g.operations?.some((o) => o.path === '/ws')) assert.match(g.security_boundary, /GET \/ws/);
});

test('declared artifact paths exist', () => {
  for (const c of M.components) for (const a of [...c.constitutional_artifact, ...c.nomenclature_artifact]) assert.ok(a.exists, `${c.name}: ${a.path}`);
});
