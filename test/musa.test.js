// MUSA → bridge: MUSA contributes specification (luna-agent/protocols/url-machine.md), not
// running code the bridge calls. This test checks the bridge's executable SEURL against that
// text and against the seurl halt page, so a change on either side is detected.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, VERBS } from '../src/circle/seurl.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = resolve(HERE, '..', '..', 'MUSA', 'luna-agent', 'protocols', 'url-machine.md');
const HALT = resolve(HERE, '..', '..', 'seurl', 'index.html');

describe('MUSA url-machine.md ↔ circle SEURL', { skip: existsSync(SPEC) && existsSync(HALT) ? false : 'needs ../MUSA and ../seurl' }, () => {
  const spec = existsSync(SPEC) ? readFileSync(SPEC, 'utf8') : '';

  test('the verb set equals §3 of url-machine.md and the seurl halt page', () => {
    const s3 = [...spec.split('## 3.')[1].split('## 4.')[0].matchAll(/^- ([A-Z]+)\(/gm)].map((m) => m[1]);
    const halt = readFileSync(HALT, 'utf8').match(/START\s+SWITCH\s+WRITE\s+COMMIT\s+BUILD\s+TALK\s+PERTURB/)[0].split(/\s+/);
    assert.deepEqual([...s3].sort(), [...VERBS].sort());
    assert.deepEqual(halt, VERBS);
  });

  test('every transition of §4 is executable as written', () => {
    // lines may chain: A --V1--> B --V2--> C; split each into (from, verb, to) triples
    const lines = [];
    for (const line of spec.split('## 4.')[1].split('## 5.')[0].split('\n')) {
      const parts = line.split(/\s+--([A-Z]+)(?:\([^)]*\))?-->\s+/);
      for (let i = 0; i + 2 < parts.length; i += 2) lines.push([null, parts[i].trim().replace(/\(.*\)$/, '').split(/\s+/).pop(), parts[i + 1], parts[i + 2].trim().split(/\s+\(/)[0]]);
    }
    assert.ok(lines.length >= 5, `parsed ${lines.length} transitions`);
    const reach = { IDLE: '', BOUND: '/START/map/eca/90/8/state/5', WRITING: '/START/map/eca/90/8/state/5/WRITE/next', COMMITTED: '/START/map/eca/90/8/state/5/WRITE/next/COMMIT' };
    const arg = { START: '/map/eca/90/8/state/5', SWITCH: '/map/eca/30/8/state/1', WRITE: '/next', PERTURB: '/0', TALK: '/acsp/ABC', COMMIT: '', BUILD: '' };
    const checked = [];
    for (const [, from, verb, to] of lines) {
      const froms = from === 'any' ? ['IDLE', 'BOUND', 'WRITING'] : [from];
      for (const f of froms) {
        if (f === 'IDLE' && verb === 'PERTURB') continue; // PERTURB needs an address: documented interpretation (seurl.js)
        const s = run(`${reach[f]}/${verb}${arg[verb]}`);
        const reached = s.would_reach ?? s.state;
        const targets = to.trim() === 'any' ? [f] : to.split('|').map((x) => x.trim().replace(/\(.*\)$/, ''));
        assert.ok(targets.includes(reached), `${f} --${verb}--> expected ${targets}, got ${reached}`);
        checked.push(`${f}-${verb}`);
      }
    }
    assert.ok(checked.includes('WRITING-COMMIT') && checked.includes('COMMITTED-BUILD'));
  });

  test('interpretations beyond the text are explicit, not silent', () => {
    // WRITING --WRITE--> WRITING is not in §4; the circle allows it and says so in seurl.js.
    assert.ok(!/WRITING\s+--WRITE-->/.test(spec));
    assert.equal(run('/START/a/WRITE/b/WRITE/c').state, 'WRITING');
    assert.match(readFileSync(join(HERE, '..', 'src', 'circle', 'seurl.js'), 'utf8'), /interpretation: WRITING --WRITE--> WRITING/);
  });
});
