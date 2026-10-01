// The circle: SEURL (pure) and the end-to-end bridge against real neighbour processes.
// Integration tests need ../substrateIO and ../NetGovComEduGovOrgEduGovComNet (with
// node_modules); they are skipped, with the reason, when those are absent.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, parseMoves, SeurlError } from '../src/circle/seurl.js';
import { startCircle, killTree } from '../scripts/circle-lib.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUBSTRATE_DIR = process.env.SUBSTRATE_DIR ?? resolve(HERE, '..', '..', 'substrateIO');
const ACSP_DIR = process.env.ACSP_DIR ?? resolve(HERE, '..', '..', 'NetGovComEduGovOrgEduGovComNet');
const HAVE = existsSync(join(SUBSTRATE_DIR, 'tools', 'purl_server.py')) && existsSync(join(ACSP_DIR, 'node_modules', 'tsx'));

describe('SEURL finite move language', () => {
  test('a path is a program; state is a function of the path', () => {
    const s = run('/START/map/eca/90/8/state/5/WRITE/next/PERTURB/0');
    assert.equal(s.state, 'WRITING');
    assert.equal(s.current_address, '/map/eca/90/8/state/5/next/flip/0');
    assert.deepEqual(s.program.map((p) => p.verb), ['WRITE', 'PERTURB']);
  });
  test('mutations are prepared, never reached, by evaluation', () => {
    const s = run('/START/map/eca/90/8/state/5/WRITE/next/COMMIT/BUILD/TALK/acsp/ABC');
    assert.equal(s.state, 'WRITING');
    assert.equal(s.would_reach, 'BUILT');
    assert.deepEqual(s.prepared.map((p) => p.verb), ['COMMIT', 'BUILD', 'TALK']);
  });
  test('the vocabulary is closed', () => {
    assert.throws(() => run('/START/map/eca/90/8/JUMP/x'), (e) => e instanceof SeurlError && e.code === 'unknown_verb');
    assert.throws(() => parseMoves('/map/eca/90/8'), (e) => e.code === 'no_verb');
  });
  test('the transition system of url-machine.md §4 is enforced', () => {
    const illegal = ['/WRITE/next', '/START/map/eca/90/8/COMMIT', '/START/a/WRITE/b/SWITCH/c', '/START/a/BUILD', '/START/a/WRITE/b/COMMIT/WRITE/c', '/PERTURB/0'];
    for (const p of illegal) assert.throws(() => run(p), (e) => e.code === 'illegal_move', p);
    assert.equal(run('/START/a/SWITCH/b').bound, '/b');
    assert.equal(run('/TALK/acsp/X').state, 'IDLE');
  });
  test('arguments are checked', () => {
    assert.throws(() => run('/START'), (e) => e.code === 'missing_address');
    assert.throws(() => run('/START/a/PERTURB/x'), (e) => e.code === 'bad_perturbation');
    assert.throws(() => run('/START/a/WRITE/b/COMMIT/TALK/irc/x'), (e) => e.code === 'unknown_talk_target');
  });
});

describe('the circle end to end (substrate + PURL + ACSP, real processes)', { skip: HAVE ? false : `needs ${SUBSTRATE_DIR} and ${ACSP_DIR} with node_modules` }, () => {
  let c;
  let first;
  let acspResource;
  const purlDataDir = mkdtempSync(join(tmpdir(), 'circle-purl-'));
  const get = async (p, accept = 'application/json') => { const r = await fetch(c.base + p, { headers: { Accept: accept } }); return { status: r.status, doc: accept.includes('json') ? await r.json() : await r.text() }; };
  const post = async (p, body) => { const r = await fetch(c.base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, doc: await r.json() }; };
  const acsp = async (p, init) => (await fetch(c.acspBase + p, init)).json();

  before(async () => {
    c = await startCircle({ substrateDir: SUBSTRATE_DIR, acspDir: ACSP_DIR, purlDataDir, substratePort: 28765, acspPort: 28787 });
    // The test acts as the human owner of a fresh ACSP resource (the circle never creates or owns ACSP resources).
    const intent = await acsp('/new?format=json&session_id=owner-human&title=circle%20test');
    const created = await acsp('/r', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(intent.request) });
    acspResource = created.resource_id;
    c.cfg.acspTestResource = acspResource;
  }, { timeout: 180000 });
  after(async () => { await c?.close(); for (const ch of first?.children ?? []) killTree(ch); });

  test('a fresh participant learns the environment from the entry URL alone', async () => {
    const { status, doc } = await get('/');
    assert.equal(status, 200);
    assert.deepEqual(doc.verbs, ['START', 'SWITCH', 'WRITE', 'COMMIT', 'BUILD', 'TALK', 'PERTURB']);
    assert.ok(doc.constitution.content_id.startsWith('sha256:'));
    assert.ok(doc.moves.some((m) => m.rel === 'constitution'));
    const html = await get('/', 'text/html');
    assert.match(html.doc, /<a href="\/constitution">/);
  });

  test('SEURL -> typed term -> value; ill-typed programs are refused by the substrate', async () => {
    const { doc } = await get('/seurl/START/map/eca/90/8/state/5/WRITE/next');
    assert.equal(doc.state, 'WRITING');
    assert.equal(doc.value.value.x, 136);
    assert.ok(doc.term.derivation_id);
    const bad = await get('/seurl/START/map/eca/90/8/WRITE/cycle/0');
    assert.equal(bad.doc.error.code, 'ill_typed');
    assert.equal(bad.doc.error.substrate.code, 'unknown_operation');
  });

  test('SEURL -> PURL -> ACSP -> SubstrateIO -> checkpoint -> resume after restart', async () => {
    const v0 = (await acsp(`/r/${acspResource}?action=status&format=json`)).version;
    const r = await post(`/seurl/START/map/eca/90/8/state/5/WRITE/next/PERTURB/0/WRITE/damage/16/COMMIT/BUILD/TALK/acsp/${acspResource}?session=e2e-1&agent=test`);
    assert.equal(r.status, 201, JSON.stringify(r.doc.error));
    const [commit, build, talk] = r.doc.steps;
    assert.equal(commit.stage, 'committed');
    assert.equal(build.stage, 'BUILT');
    assert.equal(build.build.records.length, 4);
    assert.equal(talk.stage, 'submitted');
    assert.match(talk.proposal_id, /^P-\d+$/);
    assert.equal(talk.observation.epistemic_status, 'SIMULATED');
    // ACSP: exactly one new event, a pending proposal; nothing committed.
    const st = await acsp(`/r/${acspResource}?action=status&format=json`);
    assert.equal(st.version, v0 + 1);
    const res = await acsp(`/r/${acspResource}.json`);
    const prop = res.proposals.find((p) => p.id === talk.proposal_id);
    assert.equal(prop.status, 'pending');
    assert.equal(prop.requested_by.identity_assurance, 'asserted');
    assert.equal(res.knowledge.items.length, 0);
    // PURL: the scroll's own log replays independently.
    const sid = commit.scroll.id;
    const scroll = (await get(`/scrolls/${sid}`)).doc;
    assert.deepEqual(scroll.talks.map((t) => t.stage), ['submitted']);
    const verify = await (await fetch(`${c.purlBase}/r/${sid}/verify`, { headers: { Accept: 'application/purl+json' } })).json();
    assert.equal(verify.valid, true);
    // Checkpoint, then resume from a NEW circle process over the same PURL store.
    const cp = await post(`/checkpoints?session=e2e-1&scroll=${sid}&acsp_resource=${acspResource}&next=run%20conformance`);
    assert.equal(cp.status, 201);
    first = c;
    await c.close({ children: false });
    c = await startCircle({ substrateBase: `http://127.0.0.1:28765`, acspBase: `http://127.0.0.1:28787`, purlDataDir, acspOrigin: 'harness', acspResource });
    c.cfg.acspTestResource = acspResource;
    // a restarted circle registers a new PURL principal; resume needs only reads
    const resumed = (await get(`/resume/${cp.doc.id}`)).doc;
    assert.equal(resumed.intact, true);
    assert.equal(resumed.active_scroll, sid);
    assert.equal(resumed.constitution_changed, false);
    assert.equal(resumed.next, 'run conformance');
    assert.ok(resumed.scrolls.every((s) => s.changed_since === false));
    // the restarted circle is the same PURL principal (token kept beside the store), so it can extend the scroll
    const rebuilt = await post(`/scrolls/${sid}/build?session=e2e-later`);
    assert.equal(rebuilt.status, 201, JSON.stringify(rebuilt.doc.error));
    assert.deepEqual(rebuilt.doc.build.records.map((r) => r.rerun), ['reproduced', 'reproduced', 'reproduced', 'reproduced']);
  }, { timeout: 120000 });

  test('constitutional conformance: no clause FAILED; statuses are derived', async () => {
    const r = await post('/conformance/runs?session=conformance-1');
    assert.equal(r.status, 201, JSON.stringify(r.doc.error));
    const failed = r.doc.clauses.filter((k) => k.status === 'FAILED');
    assert.deepEqual(failed, [], JSON.stringify(failed, null, 1));
    const by = Object.fromEntries(r.doc.clauses.map((k) => [k.id, k.status]));
    assert.equal(by['K-01'], 'TESTED');
    assert.equal(by['K-08'], 'TESTED');
    assert.equal(by['K-05'], 'EXTERNAL');
    assert.equal(by['K-18'], 'CONFLICTING');
    assert.equal((await get('/conformance')).doc.run, r.doc.run);
  }, { timeout: 120000 });

  test('aliases are measured recurrences, never auto-named', async () => {
    for (const s of ['a', 'b']) await post(`/seurl/START/map/eca/110/6/state/${s === 'a' ? 1 : 2}/WRITE/next/WRITE/next/WRITE/orbit/COMMIT?session=alias-${s}`);
    const { doc } = await get('/aliases');
    const cand = doc.candidates.find((x) => x.sequence === 'next/next/orbit');
    assert.ok(cand, JSON.stringify(doc.candidates));
    assert.equal(cand.stage, 'observed_recurrence');
    assert.ok(cand.recurrence >= 2);
  }, { timeout: 60000 });

  test('SDK: self-description, prompt contract, programs as objects, transitions', async () => {
    const sdk = (await get('/sdk')).doc;
    assert.ok(sdk.routes.some((r) => r.path === '/sdk'));
    assert.ok(Object.keys(sdk.provenance.files).includes('src/circle/bridge.js'));
    assert.equal((await get('/prompts/classify?p=' + encodeURIComponent('just chatting'))).doc.kind, 'conversation');
    const c = (await post('/prompts/classify', { operation: { method: 'GET', href: '/v/map/eca/90/8' }, expected_transition: 'none', test: 'kind map', completion_condition: 'value present' })).doc;
    assert.equal(c.kind, 'program');
    const bad = (await post('/prompts/classify', { operation: { method: 'DELETE', href: '/x' }, expected_transition: 'a', test: 'b', completion_condition: 'c' })).doc;
    assert.equal(bad.kind, 'invalid_program');
    // program -> program, with build_id and lineage; the source is untouched
    const src = await post('/seurl/START/map/eca/90/8/state/5/WRITE/next/COMMIT?session=sdk-test');
    const prep = (await get(`/programs/transform?source=${src.doc.scroll.id}&t=extend&p=orbit`)).doc;
    assert.equal(prep.result.typed.ok, true);
    assert.notEqual(prep.result.content_id, prep.source.content_id);
    const commit = await post(`/programs/transform?source=${src.doc.scroll.id}&t=extend&p=orbit&session=sdk-test`);
    assert.equal(commit.status, 201);
    assert.equal(commit.doc.build_id, prep.build_id); // build_id is a function of source, transformer, params: same prepare and commit
    const ill = await post(`/programs/transform?source=${src.doc.scroll.id}&t=extend&p=cycle/0&session=sdk-test`);
    assert.equal(ill.status, 422);
    const cl = (await get(`/programs/closure?source=${src.doc.scroll.id}&depth=1`)).doc;
    assert.ok(cl.closure_fraction >= 0 && cl.closure_fraction <= 1, String(cl.closure_fraction));
    const dead = (await get('/programs/closure?source=/seurl/START/map/eca/30/8&depth=1')).doc; // a map binds no state: state transformers cannot apply
    assert.equal(dead.closure_fraction, 0);
    const cov = (await get('/transitions/coverage')).doc;
    const sys = cov.matrix.map((m) => m.system);
    for (const s of ['purl-event', 'substrate-execution', 'seurl-move', 'acsp-event']) assert.ok(sys.includes(s), s);
    assert.equal(cov.matrix.find((m) => m.system === 'substrate-execution').actor, 0); // the instrument records no actor: a measured loss
  }, { timeout: 120000 });

  test('test surface and observatory derive from records; failures stay', async () => {
    const runs = (await get('/tests')).doc.runs;
    assert.ok(runs.length >= 1);
    const t = (await get(`/tests/${runs[0].run}/get_sweep_changes_nothing`)).doc;
    assert.ok(t.hash.startsWith('sha256:') && t.expected_transition && t.provenance.constitution);
    const o = (await get('/observatory')).doc;
    assert.ok(o.transitions.length > 0 && o.current_constitution.content_id);
    assert.equal((await get('/stases/1')).doc.id, 'STASIS-1');
    assert.match((await get('/observatory', 'text/html')).doc, /http-equiv="refresh"/); // a live terminal for a human watcher
  });

  test('NAI-CI primitives over circle URLs; foreign URLs refused', async () => {
    const legal = (await get('/naici/legal?url=' + encodeURIComponent('/seurl/START/map/eca/90/8/state/5'))).doc;
    assert.ok(legal.legal.some((m) => m.rel === 'WRITE'));
    const tr = (await get('/naici/trace?url=' + encodeURIComponent('/seurl/START/map/eca/90/8/state/5/WRITE/next'))).doc;
    assert.deepEqual(tr.transitions.map((t) => t.verb), ['START', 'WRITE']);
    assert.equal((await get('/naici/surface?url=https://www.google.com/')).doc.error.code, 'foreign_url');
  });
});

describe('STASIS-2 checkpoint is recoverable from the committed snapshot alone', () => {
  test('content id verifies; every scroll replays; the body note survived', async () => {
    const { cpSync } = await import('node:fs');
    const { Store } = await import('../src/continuity/store.js');
    const { createPurlServer } = await import('../src/transport/server.js');
    const { PurlClient } = await import('../src/client/client.js');
    const { sha256 } = await import('../src/circle/adapters.js');
    const dir = mkdtempSync(join(tmpdir(), 'cp2-replay-'));
    cpSync(join(HERE, '..', 'circle', 'checkpoints', 'stasis-2', 'purl-store'), dir, { recursive: true });
    const srv = createPurlServer({ store: new Store({ dataDir: dir }) });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    try {
      const client = new PurlClient(`http://127.0.0.1:${srv.address().port}`);
      const cp = await client.open('/r/r_AVPVE4Y83H');
      const { content_id, ...rest } = cp.state;
      assert.equal(sha256(rest), content_id);
      assert.equal(content_id, 'sha256:5c97f6a57784f6f2c68d8c0e544ceda6914b7c2c00a75f2bc8d21b3e2bb38bb8');
      assert.match(cp.state.next, /^STASIS-3/);
      assert.equal(cp.state.acsp.resource_id, 'EWHFG2ST3J8E');
      for (const s of cp.state.scrolls) assert.ok((await client.reconstruct(`/r/${s.id}`)).all_ok, s.id);
    } finally {
      srv.closeAllConnections?.();
      await new Promise((r) => srv.close(r));
    }
  });
});

describe('final checkpoint is recoverable from the committed snapshot alone', () => {
  test('content id verifies and every scroll log replays (no live services)', async () => {
    const { cpSync } = await import('node:fs');
    const { Store } = await import('../src/continuity/store.js');
    const { createPurlServer } = await import('../src/transport/server.js');
    const { PurlClient } = await import('../src/client/client.js');
    const { sha256 } = await import('../src/circle/adapters.js');
    const dir = mkdtempSync(join(tmpdir(), 'cp-replay-'));
    cpSync(join(HERE, '..', 'circle', 'checkpoints', 'final', 'purl-store'), dir, { recursive: true });
    const srv = createPurlServer({ store: new Store({ dataDir: dir }) });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    try {
      const client = new PurlClient(`http://127.0.0.1:${srv.address().port}`);
      const cp = await client.open('/r/r_HMGMD46GSD');
      const { content_id, ...rest } = cp.state;
      assert.equal(sha256(rest), content_id);
      assert.equal(content_id, 'sha256:ef5ed564093e1d0078c03d95ddac7c3f772a4c9506872ce279326a7ce6e13d2e');
      for (const s of cp.state.scrolls) {
        const rec = await client.reconstruct(`/r/${s.id}`);
        assert.ok(rec.all_ok, s.id);
      }
    } finally {
      srv.closeAllConnections?.();
      await new Promise((r) => srv.close(r));
    }
  });
});

describe('STASIS-3 checkpoint is recoverable from the committed snapshot alone', () => {
  test('content id verifies; every scroll replays; the next note survived', async () => {
    const { cpSync } = await import('node:fs');
    const { Store } = await import('../src/continuity/store.js');
    const { createPurlServer } = await import('../src/transport/server.js');
    const { PurlClient } = await import('../src/client/client.js');
    const { sha256 } = await import('../src/circle/adapters.js');
    const dir = mkdtempSync(join(tmpdir(), 'cp3-replay-'));
    cpSync(join(HERE, '..', 'circle', 'checkpoints', 'stasis-3', 'purl-store'), dir, { recursive: true });
    const srv = createPurlServer({ store: new Store({ dataDir: dir }) });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    try {
      const client = new PurlClient(`http://127.0.0.1:${srv.address().port}`);
      const cp = await client.open('/r/r_D4RSRCHB3G');
      const { content_id, ...rest } = cp.state;
      assert.equal(sha256(rest), content_id);
      assert.equal(content_id, 'sha256:15f339af547ce28cd5c618de75b83dd0f78150a27d92354fb1d83528addd6cec');
      assert.match(cp.state.next, /^STASIS-4/);
      assert.equal(cp.state.acsp.resource_id, 'DM7GQJR9RJP4');
      for (const s of cp.state.scrolls) assert.ok((await client.reconstruct(`/r/${s.id}`)).all_ok, s.id);
    } finally {
      srv.closeAllConnections?.();
      await new Promise((r) => srv.close(r));
    }
  });
});
