// SDK v0.3 (STASIS-3 phase 6): offline checks. The live checks are conformance
// ide_stages_change_nothing and get_sweep_changes_nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyDescriptors, IDE_STAGES } from '../src/circle/ide.js';
import { ROUTES, SDK_VERSION, SDK_GREETING, routeOf } from '../src/circle/bridge.js';

test('every circle module carries a descriptor that matches its source', async () => {
  const v = await verifyDescriptors();
  assert.ok(v.modules.length >= 6);
  for (const m of v.modules) assert.ok(m.ok, `${m.module}: ${JSON.stringify(m)}`);
});

test('greeting and version', () => {
  assert.equal(SDK_VERSION, 'circle-sdk/0.3');
  assert.match(SDK_GREETING, /^You have entered a programmable computational substrate\./);
});

test('the eight IDE stages are addressable, and the new discovery routes are GET-only', () => {
  assert.deepEqual(IDE_STAGES, ['DISCOVER', 'PARSE', 'TYPE', 'PLAN', 'BUILD', 'EXECUTE', 'OBSERVE', 'RECORD']);
  for (const s of IDE_STAGES) assert.ok(routeOf('GET', `/ide/${s.toLowerCase()}`), s);
  for (const p of ['/nomenclature', '/experiments', '/research', '/research/open', '/examples', '/code', '/ide']) {
    assert.ok(routeOf('GET', p), p);
    assert.equal(routeOf('POST', p), null, `${p} must not accept POST`);
  }
  assert.ok(ROUTES.filter((r) => /^\/(nomenclature|experiments|research|examples|code|ide)/.test(r.path)).every((r) => r.method === 'GET' && r.effect === 'pure'));
});
