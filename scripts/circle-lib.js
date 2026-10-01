// Starts the circle with its neighbours. Used by `npm run circle` and by the tests.
//
// PURL/0.1 runs in-process (this repository). The substrate and ACSP are separate
// programs in separate repositories: given *_BASE they are used as they are; given
// *_DIR they are spawned (python3 -m tools.purl_server; npx tsx scripts/serve-local.ts).
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPurlServer } from '../src/transport/server.js';
import { Store } from '../src/continuity/store.js';
import { createCircleServer } from '../src/circle/server.js';
import { runConformance } from '../src/circle/conformance.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const listen = (server, port) => new Promise((res) => server.listen(port, '127.0.0.1', () => res(server.address().port)));

async function waitFor(url, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (r.status < 500) return true; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${url}`);
}

/** npx/tsx spawn grandchildren: kill the whole process group, not only the direct child. */
export function killTree(child) {
  try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
}

function parseRepos(v) {
  if (!v) return null;
  return Object.fromEntries(v.split(',').map((x) => x.split('=')).filter((x) => x.length === 2));
}

/** Sibling repositories next to this one, if they exist (read-only git access for /git and /transitions). */
function defaultRepos() {
  const out = { purl: ROOT };
  for (const n of ['substrateIO', 'NetGovComEduGovOrgEduGovComNet', 'seurl', 'golden-surface', 'MUSA']) {
    const d = join(ROOT, '..', n);
    if (existsSync(join(d, '.git'))) out[n] = d;
  }
  return out;
}

function commitOf(dir) {
  try { return execFileSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; }
}

export async function startCircle(o = {}) {
  const children = [];
  const servers = [];
  const env = { ...process.env, ...o.env };

  let substrateBase = o.substrateBase ?? env.SUBSTRATE_BASE;
  const substrateDir = o.substrateDir ?? env.SUBSTRATE_DIR;
  if (!substrateBase && substrateDir) {
    const port = o.substratePort ?? 18765;
    const store = o.substrateStore ?? env.SUBSTRATE_STORE ?? mkdtempSync(join(tmpdir(), 'circle-substrate-'));
    children.push(spawn('python3', ['-m', 'tools.purl_server', '--port', String(port), '--store', store], { cwd: substrateDir, stdio: 'ignore', detached: true }));
    substrateBase = `http://127.0.0.1:${port}`;
    await waitFor(substrateBase + '/');
  }
  let acspBase = o.acspBase ?? env.ACSP_BASE;
  const acspDir = o.acspDir ?? env.ACSP_DIR;
  if (!acspBase && acspDir) {
    const port = o.acspPort ?? 18787;
    children.push(spawn('npx', ['tsx', 'scripts/serve-local.ts', '--port', String(port)], { cwd: acspDir, stdio: 'ignore', detached: true }));
    acspBase = `http://127.0.0.1:${port}`;
    await waitFor(acspBase + '/.well-known/acsp', 120000);
  }

  const purlStore = new Store({ dataDir: o.purlDataDir ?? env.PURL_DATA_DIR ?? null });
  const purlServer = createPurlServer({ store: purlStore });
  const purlPort = await listen(purlServer, o.purlPort ?? 0);
  servers.push(purlServer);
  const purlBase = `http://127.0.0.1:${purlPort}`;

  // The circle's PURL principal is its identity on PURL. With a persistent PURL store it is kept
  // next to that store (mode 0600) so a restarted circle is the same principal. Never logged.
  const dataDir = o.purlDataDir ?? env.PURL_DATA_DIR ?? null;
  const tokenFile = dataDir ? join(dataDir, 'circle-principal.token') : null;
  const purlToken = env.CIRCLE_PURL_TOKEN ?? (tokenFile && existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : null);

  const recon = JSON.parse(readFileSync(join(ROOT, 'circle', 'reconstruction.json'), 'utf8'));
  const cfg = {
    purlBase, substrateBase, acspBase,
    goldenBase: o.goldenBase ?? env.GOLDEN_BASE, goldenToken: o.goldenToken ?? env.GOLDEN_TOKEN_R,
    acspOrigin: o.acspOrigin ?? env.ACSP_ORIGIN ?? (acspDir ? 'harness' : 'service'),
    acspTestResource: o.acspTestResource ?? null,
    acspResource: o.acspResource ?? env.ACSP_RESOURCE ?? null,
    commits: { purl: commitOf(ROOT), substrateIO: substrateDir ? commitOf(substrateDir) : null, acsp: acspDir ? commitOf(acspDir) : null },
    unresolved: [...recon.discrepancies, ...(o.unresolved ?? [])],
    runConformance,
    gitRepos: o.gitRepos ?? parseRepos(env.GIT_REPOS) ?? defaultRepos(),
    currentTask: o.currentTask ?? env.CIRCLE_TASK ?? null,
    purlToken,
    onPrincipal: (t) => { if (tokenFile) writeFileSync(tokenFile, t + '\n', { mode: 0o600 }); },
  };
  const { server, circle } = createCircleServer(cfg);
  const port = await listen(server, o.port ?? 0);
  servers.push(server);
  cfg.publicBase = `http://127.0.0.1:${port}`;

  return {
    base: cfg.publicBase, purlBase, substrateBase, acspBase, circle, cfg,
    children,
    async close({ children: killChildren = true } = {}) {
      for (const s of servers) { s.closeAllConnections?.(); await new Promise((r) => s.close(r)); }
      if (killChildren) for (const c of children) killTree(c);
    },
  };
}
