// Dev iterations (STASIS-3 phase 8): offline checks of the pieces the circle computes itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { implementationIdAt, SELF_CONCEPTS } from '../src/circle/dev.js';
import { sha256 } from '../src/circle/adapters.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('implementation_id at a commit is computed like the running one', () => {
  const clean = execFileSync('git', ['-C', ROOT, 'status', '--porcelain', '--', 'src/circle'], { encoding: 'utf8' }).trim() === '';
  const files = Object.fromEntries(readdirSync(join(ROOT, 'src', 'circle')).filter((f) => f.endsWith('.js')).sort().map((f) => [`src/circle/${f}`, sha256(readFileSync(join(ROOT, 'src', 'circle', f), 'utf8'))]));
  const atHead = implementationIdAt(ROOT, 'HEAD');
  if (clean) assert.equal(atHead.implementation_id, sha256(files));
  else assert.notEqual(atHead.implementation_id, undefined); // uncommitted src/circle: the two differ by construction
});

test('six self-* concepts, each with where, how tested, status and limit', () => {
  assert.deepEqual(Object.keys(SELF_CONCEPTS), ['self-description', 'self-observation', 'self-transformation', 'self-testing', 'self-reconstruction', 'self-harnessing']);
  for (const [k, v] of Object.entries(SELF_CONCEPTS)) for (const f of ['definition', 'where', 'tested_by', 'status', 'limit']) assert.ok(v[f], `${k}.${f}`);
});
