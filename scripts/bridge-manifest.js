// npm run bridge:manifest — generate circle/bridge-manifest.json from git, the route table and
// the committed records. Generated, never hand-edited: run it again to reconstruct it.
// It contains no secrets: only commit ids, paths, names and hashes.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, SDK_VERSION } from '../src/circle/bridge.js';
import { CIRCLE_PROTOCOL } from '../src/circle/server.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = resolve(ROOT, '..');
const g = (d, ...a) => { try { return execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' }).trim(); } catch { return null; } };
const sha = (f) => 'sha256:' + createHash('sha256').update(readFileSync(f)).digest('hex');
const J = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));

const REPOS = {
  seurl: { role: 'program / transition notation (halt page); executable FSM lives in purl src/circle/seurl.js', protocol: 'SEURL move words (url-machine.md)' },
  purl: { role: 'records (PURL/0.1) + the bridge layer (src/circle)', protocol: 'PURL/0.1; circle/0' },
  NetGovComEduGovOrgEduGovComNet: { role: 'ACSP continuity', protocol: 'ACSP/0.1 (deployed); 0.1+program-001 and 0.2 on branches' },
  substrateIO: { role: 'values, terms, executions, projections, observations, registries', protocol: 'substrate-purl/0 (provisional)' },
  'golden-surface': { role: 'embodied client: phone, relay, bus, Najwa', protocol: 'relay HTTP/WS' },
  MUSA: { role: 'specification sources and prototypes (outside the bridge)', protocol: '—' },
};
const repos = {};
for (const [name, meta] of Object.entries(REPOS)) {
  const d = join(P, name);
  if (!existsSync(join(d, '.git'))) { repos[name] = { ...meta, available: false }; continue; }
  const remotes = (g(d, 'branch', '-r') ?? '').split('\n').map((x) => x.trim()).filter((x) => x && !x.includes('->'));
  repos[name] = { ...meta, url: g(d, 'remote', 'get-url', 'origin'), default_branch: ((g(d, 'ls-remote', '--symref', 'origin', 'HEAD') ?? '').match(/refs\/heads\/(\S+)\s+HEAD/) ?? [])[1] ?? null,
    research_branch: g(d, 'branch', '--show-current'), head: g(d, 'rev-parse', '--short', 'HEAD'),
    branches: Object.fromEntries(remotes.map((b) => [b.replace('origin/', ''), g(d, 'rev-parse', '--short', b)])) };
}

// ---- components (XXIV): declared fields from circle/components.json, the rest generated ----------
const GLOB = (pat) => { const [dir, f] = [dirname(pat), pat.split('/').pop()]; const re = new RegExp('^' + f.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
  return existsSync(join(P, dir)) ? readdirSync(join(P, dir)).filter((x) => re.test(x)).sort() : []; };
const src = (f) => (existsSync(join(P, f)) ? readFileSync(join(P, f), 'utf8') : null);
// regex route literal -> path template: ^\/r\/([..]+)\/(a|b)$ -> /r/{id}/a, /r/{id}/b
const tmpl = (re) => {
  let out = [re.replace(/^\^/, '').replace(/\$$/, '').replace(/\\\//g, '/')];
  for (;;) {
    const i = out[0].indexOf('('); if (i < 0) break;
    out = out.flatMap((t) => { const k = t.indexOf('('), e = t.indexOf(')', k); const body = t.slice(k + 1, e);
      return /^[a-z_]+(\|[a-z_]+)+$/.test(body) ? body.split('|').map((a) => t.slice(0, k) + a + t.slice(e + 1)) : [t.slice(0, k) + '{id}' + t.slice(e + 1)]; });
  }
  return out.map((t) => t.replace(/\{id\}(.*)\{id\}/, '{id}$1{name}'));
};
const EXTRACT = {
  'circle-ROUTES': () => ROUTES.map((r) => ({ method: r.method, path: r.path })),
  'purl/src/transport/server.js': (t) => [
    ...[...t.matchAll(/path === '([^']+)' && (isGet|req\.method === '(\w+)')/g)].map((m) => ({ method: m[3] ?? 'GET', path: m[1] })),
    ...[...t.matchAll(/\(m = \/(\^[^\n]*?\$)\/\.exec\(path\)\)( && isGet)?\)/g)].flatMap((m) => tmpl(m[1]).map((p) => ({ method: m[2] ? 'GET' : 'POST', path: p }))),
  ],
  'substrateIO/tools/purl_server.py': (t) => [
    ...[...t.matchAll(/method == "(\w+)" and \(?path ?(==|\.startswith\() ?"([^"]+)"|path == "([^"]+)" and method == "(\w+)"/g)]
      .map((m) => (m[4] ? { method: m[5], path: m[4] } : { method: m[1], path: m[2] === '==' ? m[3] : m[3] + '{id}' })),
    ...(/if method == "GET":\s+return P\.get\(path\)/.test(t) ? [{ method: 'GET', path: '<value address> (resolve)' }] : []),
    ...(/if method == "POST":\s+return 201, store\.record\(path\)/.test(t) ? [{ method: 'POST', path: '<value address> (record execution)' }] : []),
  ],
  'NetGovComEduGovOrgEduGovComNet/src/transport/handler.ts': (t) => {
    const at = (re) => t.search(re); const get0 = at(/async function handleGet/), post0 = at(/async function handlePost/), end = at(/function withCapabilityUrls/);
    const ops = [];
    for (const m of t.matchAll(/path === '([^']+)'/g)) ops.push({ method: m.index > post0 && m.index < end ? 'POST' : 'GET', path: m[1] });
    if (/ROUTES\.resource\.exec\(path\)/.test(t)) ops.push({ method: 'GET', path: '/r/{id}' });
    for (const m of t.slice(get0, post0).matchAll(/action === '([a-z_]+)'/g)) ops.push({ method: 'GET', path: `/r/{id}?action=${m[1]}` });
    if (/action\.startsWith\('prepare_'\)/.test(t)) ops.push({ method: 'GET', path: '/r/{id}?action=prepare_* (prepares an intent; performs nothing)' });
    for (const m of t.slice(get0, post0).matchAll(/case '([a-z_]+)'/g)) ops.push({ method: 'GET', path: `/r/{id}/${m[1]}` });
    if (/\\\/operations\$\//.test(t.slice(post0, end))) ops.push({ method: 'POST', path: '/r/{id}/operations' });
    return ops;
  },
  'golden-surface/relay/relay.py': (t) => [...t.matchAll(/web\.(get|post|put|delete)\("([^"]+)"/g)].map((m) => ({ method: m[1].toUpperCase(), path: m[2] })),
};
const uniq = (ops) => [...new Map(ops.map((o) => [o.method + ' ' + o.path, o])).values()];
const MATRIX = existsSync(join(ROOT, 'circle/PROJECTION-MATRIX.json')) ? J('circle/PROJECTION-MATRIX.json') : { measured: [], declared: [] };
const DEPLOY = (repo) => manifestDeployments.filter((d) => d.repo === repo);
const manifestDeployments = [
  { url: 'https://acsp-one.vercel.app', repo: 'NetGovComEduGovOrgEduGovComNet', branch: 'claude/agent-continuity-protocol-doi4bn', commit: '9fcf2e1', mapping: 'Vercel git metadata', protocol: 'ACSP/0.1' },
  { url: 'https://seurl.vercel.app', repo: 'seurl', commit: null, mapping: 'content hash = index.html @620ff95 (no git metadata)' },
  { url: 'https://lunar-foundry.vercel.app', repo: 'luna-foundry', branch: 'claude/golden-surface-locked-tabs-yf57of', commit: '6a260ef', mapping: 'Vercel git metadata' },
  { url: 'http://40.64.120.87:8490', repo: 'golden-surface', commit: null, mapping: 'NOT MAPPABLE (unreachable from the build environment)' },
];
const COMP = J('circle/components.json');
const components = COMP.components.map((c) => {
  const d = join(P, c.repository);
  let ops = null, opsNote;
  if (c.routes_from.kind === 'none') opsNote = c.routes_from.reason;
  else if (c.routes_from.kind === 'circle-ROUTES') ops = EXTRACT['circle-ROUTES']();
  else { const t = src(c.routes_from.file); ops = t == null ? null : uniq(EXTRACT[c.routes_from.file](t)); opsNote = t == null ? 'source absent' : `extracted by regex from ${c.routes_from.file}; completeness not proven`; }
  const artifact = (f) => { const [path] = f.split('#'); return { path: f, exists: existsSync(join(P, path)), content_id: existsSync(join(P, path)) ? sha(join(P, path)) : null }; };
  const boundaries = c.projection_boundaries.map((id) => { const m = MATRIX.measured.find((x) => x.id === id) ?? MATRIX.declared.find((x) => x.id === id);
    return m ? { id, from: m.from, to: m.to, edge: m.edge, ...(m.n != null ? { n: m.n, loss_bits: m.loss_H_source_given_output_bits, spurious_bits: m.H_output_given_source_bits } : { lost: m.lost, status: m.status }) } : { id, missing: true }; });
  const [tdir, tpat] = [dirname(c.test_suite.files), c.test_suite.files];
  return {
    name: c.name, repository: c.repository, scope: c.scope,
    branch: g(d, 'branch', '--show-current'), commit: g(d, 'rev-parse', '--short', 'HEAD'),
    protocol: c.protocol, role: c.role, input_kinds: c.input_kinds, output_kinds: c.output_kinds,
    operations: ops, operations_note: opsNote ?? 'circle route table (src/circle/bridge.js ROUTES)',
    safe_operations: ops?.filter((o) => o.method === 'GET' || o.method === 'HEAD').map((o) => `${o.method} ${o.path}`) ?? null,
    mutating_operations: ops?.filter((o) => !['GET', 'HEAD'].includes(o.method)).map((o) => `${o.method} ${o.path}`) ?? null,
    constitutional_artifact: c.constitutional_artifact.map(artifact), nomenclature_artifact: c.nomenclature_artifact.map(artifact),
    test_suite: { command: c.test_suite.command, files: GLOB(tpat).map((f) => `${tdir}/${f}`) },
    research_status: c.research_status, projection_boundaries: boundaries,
    known_information_loss: boundaries.filter((b) => b.loss_bits > 0 || b.lost?.length).map((b) => `${b.id} ${b.from} -> ${b.to}: ` + (b.loss_bits != null ? `${b.loss_bits} bits` : b.lost.join(', '))),
    security_boundary: c.security_boundary, deployment: DEPLOY(c.repository), reconstruction_method: c.reconstruction_method,
    provenance: { generated: ['branch', 'commit', 'operations', 'safe_operations', 'mutating_operations', 'constitutional_artifact.exists/content_id', 'nomenclature_artifact.exists/content_id', 'test_suite.files', 'projection_boundaries (values)', 'known_information_loss', 'deployment'],
      declared: ['name', 'repository', 'scope', 'protocol', 'role', 'input_kinds', 'output_kinds', 'routes_from', 'artifact paths', 'test_suite.command', 'research_status', 'projection_boundaries (ids)', 'security_boundary', 'reconstruction_method'], declared_in: 'circle/components.json',
      safe_rule: 'safe = GET/HEAD by method; exceptions are listed in security_boundary (e.g. GET /ws upgrade)' },
  };
});

const records = (dir) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)).sort() : []);
const manifest = {
  format: 'bridge-manifest/3', generated_at: new Date().toISOString(), generator: 'scripts/bridge-manifest.js',
  secrets: 'none: commit ids, paths, names and hashes only',
  start_here: ['circle/CURRENT-STATE.md', 'circle/BRIDGE-RECONSTRUCTION.md', 'circle/BRIDGE-CONTRACT.md', 'GET / (circle entry)', 'GET /sdk'],
  protocols: { circle: CIRCLE_PROTOCOL, sdk: SDK_VERSION, purl: 'PURL/0.1', substrate: 'substrate-purl/0 (provisional)', acsp: 'ACSP/0.1', seurl: 'seurl move words (MUSA url-machine.md)' },
  components,
  repositories: repos,
  deployments: manifestDeployments,
  entrypoints: { circle: 'npm run circle (purl)', substrate: 'python3 -m tools.purl_server (substrateIO)', acsp_local: 'npm run serve:local (ACSP)', relay: 'python3 relay/relay.py (golden-surface)' },
  operations: ROUTES,
  schemas: ['addressed-transition', 'prompt-contract', 'test-artifact', 'perturbation', 'program-transformation'].map((n) => `/sdk/schemas/${n}`),
  edges: [
    { from: 'SEURL', to: 'substrate', kinds: ['PARSE', 'RESOLVE'], via: 'adapter.substrate GET /term, GET <addr>' },
    { from: 'SEURL', to: 'PURL', kinds: ['RECORD', 'FORK'], via: 'COMMIT; ?parent=' },
    { from: 'PURL', to: 'substrate', kinds: ['EXECUTE', 'RECORD'], via: 'BUILD' },
    { from: 'PURL', to: 'ACSP', kinds: ['PUBLISH'], via: 'TALK (propose only)' },
    { from: 'ACSP', to: 'substrate', kinds: ['OBSERVE', 'PROJECT'], via: 'P-ACSP-EV-1' },
    { from: 'ACSP', to: 'circle view', kinds: ['PROJECT'], via: 'GET /acsp/r/{id}' },
    { from: 'program', to: 'program', kinds: ['BUILD'], via: '/programs/transform (build_id)' },
    { from: 'git', to: 'circle', kinds: ['PROJECT'], via: '/git/{repo}/{commit}' },
    { from: 'Golden Surface', to: 'circle', kinds: ['ADDRESS', 'RESOLVE'], via: 'relay /cmd open/read (FakePhone-tested)' },
    { from: 'MUSA', to: 'circle', kinds: ['ADDRESS'], via: 'url-machine.md as specification (test/musa.test.js)' },
    { from: 'circle', to: 'nomenclature', kinds: ['RECORD'], via: 'substrateIO registry commits' },
    { from: 'checkpoint', to: 'session', kinds: ['RECONSTRUCT', 'REPLAY'], via: '/resume/{id}; checkpoint snapshot' },
    { from: 'scroll', to: 'perturbation record', kinds: ['PERTURB', 'OBSERVE'], via: 'PERTURB step + damage' },
  ],
  adapters: ['adapter.substrate', 'adapter.acsp', 'adapter.golden-surface'],
  projections: ['P-ACSP-EV-1 (substrateIO)', 'addressed transition (bridge.js P.*)', 'scroll → ACSP TOK (scrollTok)', 'ACSP resource → /acsp/r/{id}', 'git commit → transition'],
  test_suites: {
    purl: 'node --test test/ (core + circle + golden + musa)', substrateIO: 'python3 -m unittest discover -s tests -t . ; python3 -m tools.validate',
    acsp: 'npx vitest run ; npx tsx harness/cli.ts --base-url <local>', golden_surface: 'tests/*.py against a relay', conformance: 'POST /conformance/runs',
    differential: 'npm run bridge:differential', cold: 'npm run bridge:cold',
  },
  constitution: { clauses: 'circle/constitution/constitution-v1.json', content_id: sha(join(ROOT, 'circle/constitution/constitution-v1.json')), enforcement: sha(join(ROOT, 'circle/constitution/enforcement.json')), sdk: sha(join(ROOT, 'circle/constitution/sdk-constitution.json')) },
  historical_states: J('circle/stases.json').stases.map((s) => ({ id: s.id, label: s.label, commits: s.commits, checkpoint: s.checkpoint ?? null })),
  records: { e2e: records('circle/experiments/e2e'), cold: records('circle/cold'), differential: records('circle/differential'), fresh_agent: records('circle/experiments/fresh-agent'), reconstruction: records('circle/experiments/reconstruction') },
  known_discrepancies: J('circle/reconstruction.json').discrepancies.concat([
    'STASIS-1 reconstruction claimed program-001 and 417da6c absent: disproven (branch claude/acsp-program-001-k616hw)',
    'two bridges (circle; ACSP 0.2 + PURL composition) on unmerged branches',
    'two SEURLs: move words vs seurl://golden addresses',
    'Scroll defined three-plus times (ACSP program-001, circle, luna-foundry, MUSA)',
    'ACSP program-001 and 0.2 both add migration 0003',
    'production ACSP (9fcf2e1) predates every integration',
    'ramz seal accepts a recomputed forgery (public key "golden")',
    'golden-surface engine branch has POST /bridge with a pluggable decider (agent loop in the relay)',
    'commit 41ce482 message says purl 74 tests; the suite reports 72',
  ]),
  open_problems: ['K-18 (as restated by A-002)', 'A-001..A-004 adoption', 'Q-014 cross-provider participant', 'Q-015/OP-010 status of live-service records', 'OP-B1 relay not mappable', 'OP-B2 seurl deployment without git provenance', 'OP-B3 canonical ACSP line', 'real Android WebView', 'seurl:// in the bridge vs seurl://golden', 'SDK-1 router enumeration gap', 'C-046 constitutional recursion untested', 'live ACSP TALK never performed'],
};
writeFileSync(join(ROOT, 'circle', 'bridge-manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log('bridge-manifest.json:', Object.keys(manifest.repositories).length, 'repos,', manifest.operations.length, 'routes');
