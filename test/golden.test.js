// Golden Surface → circle conformance, at the bridge level (§18 of the bridge directive).
// Runs golden-surface's real relay (relay/relay.py, fresh tokens, temporary store) and its own
// FakePhone, then drives it through the circle's GoldenAdapter. Skipped, with the reason,
// when ../golden-surface or python aiohttp is unavailable.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoldenAdapter } from '../src/circle/adapters.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GS = process.env.GOLDEN_DIR ?? resolve(HERE, '..', '..', 'golden-surface');
const HAVE = existsSync(join(GS, 'relay', 'relay.py')) && spawnSync('python3', ['-c', 'import aiohttp']).status === 0;
const PORT = 28590;
const tok = () => randomBytes(18).toString('base64url');
const T = { R: tok(), N: tok(), APP: tok(), WATCHER: tok() };

describe('Golden Surface boundary (relay + FakePhone)', { skip: HAVE ? false : `needs ${GS} and python aiohttp` }, () => {
  let relay;
  let phone;
  const base = `http://127.0.0.1:${PORT}`;
  const env = { ...process.env, GOLDEN_PORT: String(PORT), GOLDEN_TOKEN_R: T.R, GOLDEN_TOKEN_N: T.N, GOLDEN_TOKEN_APP: T.APP, GOLDEN_TOKEN_WATCHER: T.WATCHER,
    GOLDEN_DB: join(mkdtempSync(join(tmpdir(), 'gs-db-')), 'golden.db') };
  const steps = [];
  const rec = async (name, p) => { const r = await p; steps.push({ name, status: r.status ?? null, url: r.url ?? null, body: r.json ?? null }); return r; };

  before(async () => {
    relay = spawn('python3', ['relay/relay.py'], { cwd: GS, env, stdio: 'ignore', detached: true });
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
    phone = spawn('python3', [join(HERE, '..', 'scripts', 'golden-fakephone.py'), GS, base, T.APP, '60'], { stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    await new Promise((r) => phone.stdout.once('data', r));
  }, { timeout: 60000 });
  after(() => { for (const p of [phone, relay]) { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* gone */ } } });

  test('own tab: create, open a circle URL, read (permitted)', async () => {
    const g = new GoldenAdapter(base, T.R);
    const nt = await rec('newtab', g.cmd('newtab', {}));
    assert.equal(nt.status, 200);
    const tab = nt.json.tab;
    assert.equal((await rec('open', g.cmd('open', { tab, url: 'http://127.0.0.1:8484/sdk' }))).status, 200);
    const rd = await rec('read', g.cmd('read', { tab }));
    assert.equal(rd.status, 200);
    assert.equal(rd.json.data.url, 'http://127.0.0.1:8484/sdk');
    // seurl:// is handled explicitly: refused by the phone side on main (routing seam), never silently loaded
    const s = await rec('open seurl://', g.cmd('open', { tab, url: 'seurl://golden/map' }));
    assert.equal(s.status, 422);
  });

  test("pilot's tab: driving refused, reading permitted (visibility > control)", async () => {
    const g = new GoldenAdapter(base, T.R);
    assert.equal((await rec('drive pilot tab', g.cmd('open', { tab: 'abed1', url: 'http://127.0.0.1:8484/' }))).status, 403);
    assert.equal((await rec('read pilot tab', g.cmd('read', { tab: 'abed1' }))).status, 200);
  });

  test('no authority without a token; no token ever leaves in a URL or a body', async () => {
    const none = await new GoldenAdapter(base, null).cmd('read', { tab: 'abed1' });
    assert.equal(none.available, false);
    const wrong = await new GoldenAdapter(base, 'not-a-seat').cmd('read', { tab: 'abed1' });
    assert.ok([401, 403].includes(wrong.status), String(wrong.status));
    const text = JSON.stringify(steps);
    for (const t of Object.values(T)) assert.ok(!text.includes(t), 'a seat token leaked into a URL or response');
  });

  test('the relay carries only permitted metadata in shared state', async () => {
    const r = await fetch(base + '/state', { headers: { Authorization: `Bearer ${T.N}` } });
    const st = await r.json();
    const keys = new Set(st.tabs.flatMap((t) => Object.keys(t)));
    for (const k of keys) assert.ok(['id', 'owner', 'url', 'title', 'signedIn', 'locked'].includes(k), `unexpected tab field ${k}`);
    assert.ok(!JSON.stringify(st).match(/password|cookie|token/i));
  });
});
