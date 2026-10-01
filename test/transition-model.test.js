// Transition model (STASIS-3 phase 5): exact claims about the PARSE boundaries, checked over the
// declared program space used by scripts/projection-matrix.js (DERIVED: exhaustive over that space).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, parseMoves, pathOf } from '../src/circle/seurl.js';

const BOUNDS = ['/map/eca/90/8/state/5', '/map/eca/30/8/state/1', '/map/increment/3/state/2'];
const MOVES = [['WRITE', 'next'], ['WRITE', 'flip/0'], ['PERTURB', '0'], ['WRITE', 'orbit']];
const programs = [];
const rec = (p, d) => { programs.push(p); if (d === 3) return; for (const [v, a] of MOVES) rec(`${p}/${v}/${a}`, d + 1); };
for (const b of BOUNDS) rec(`/START${b}`, 0);

test('B1: program -> address loses exactly the verb label PERTURB/b vs WRITE/flip/b', () => {
  const byAddr = new Map();
  const norm = (p) => p.replace(/PERTURB\/(\d+)/g, 'WRITE/flip/$1');
  for (const p of programs) {
    const a = run(p).current_address;
    if (!byAddr.has(a)) byAddr.set(a, { raw: new Set(), norm: new Set() });
    byAddr.get(a).raw.add(p); byAddr.get(a).norm.add(norm(p));
  }
  assert.equal(programs.length, 255);
  assert.ok([...byAddr.values()].some((s) => s.raw.size > 1), 'the boundary is lossy');
  for (const [a, s] of byAddr) assert.equal(s.norm.size, 1, `collision not explained by the verb label at ${a}`);
});

// pathOf writes the '/seurl' mount prefix; parseMoves reads the move word after it (every caller strips it).
const unmount = (t) => t.slice('/seurl'.length);
test('B2: canonicalization is idempotent and erases only spelling', () => {
  for (const p of programs) {
    const c = pathOf(parseMoves(p));
    assert.equal(pathOf(parseMoves(unmount(c))), c);
    for (const v of [p + '/', p.replace('/START/', '/START//')]) assert.equal(pathOf(parseMoves(v)), c);
  }
});
