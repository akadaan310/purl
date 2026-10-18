#!/usr/bin/env node
// Targeted restore verification. Uses only a disposable copy of the exported
// snapshot and its own loopback API/worker processes. No prior bearer is read.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../..');
const base = 'http://127.0.0.1:18182';
const snapshotPath = join(root, 'examples/live-session.snapshot.json');
const reportPath = join(directory, 'report.json');
const rawPath = join(directory, 'raw-http.jsonl');
const canonical = (value) => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const hash = (value) => `sha256:${createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex')}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const children = [];
const streams = [];
const freshCredentials = new Set();
const report = { schema: 'purl.snapshot-restore/1', status: 'RUNNING', started_at: new Date().toISOString(), execution_class: 'LIVE_LOCAL_HTTP_SEPARATE_NODE_API_AND_WORKER', scope: 'Disposable exported snapshot restore; no live state access; sandbox disabled', base_url: base, implementation_revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), runtime: { node: process.version, architecture: process.arch, platform: process.platform }, checks };
let temporary;
let token;

function check(name, actual, detail = {}) {
  checks.push({ name, status: actual ? 'PASS' : 'FAIL', ...detail });
  assert.ok(actual, name);
}
function redact(value, key = '') {
  if (/^(token|token_hash|token_hashes|access_token|authorization|cookie|secret)$/i.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    for (const credential of freshCredentials) if (credential && value.includes(credential)) return value.replaceAll(credential, '[REDACTED]');
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, redact(entry, name)]));
  return value;
}
async function request(method, path, body, authenticated = false, authorization = token) {
  assert.ok(path.startsWith('/') && !path.includes('127.0.0.1:8080'), 'Requests stay on disposable loopback service');
  const headers = { Accept: 'application/purl+json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authenticated) headers.Authorization = `Bearer ${authorization}`;
  const result = await fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  const json = await result.json();
  await appendFile(rawPath, `${JSON.stringify(redact({ at: new Date().toISOString(), request: { method, path, body, authenticated }, response: { status: result.status, body: json } }))}\n`);
  return { status: result.status, body: json };
}
function start(name, module, env) {
  const output = createWriteStream(join(directory, `${name}.log`), { mode: 0o600 });
  streams.push(output);
  const child = spawn(process.execPath, [module], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
  children.push(child);
  child.on('error', (error) => output.write(`${name}: ${error.message}\n`));
  return child;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const stopped = await Promise.race([new Promise((resolve) => child.once('exit', () => resolve(true))), sleep(3000).then(() => false)]);
  if (!stopped && child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await new Promise((resolve) => child.once('exit', resolve)); }
}

try {
  await mkdir(directory, { recursive: true });
  await writeFile(rawPath, '', { mode: 0o600 });
  check('frozen implementation revision', report.implementation_revision === 'd45fcc214350c8380b369ea97f0add9a6643c442');
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(18182, '127.0.0.1', resolve); });
  await new Promise((resolve) => listener.close(resolve));
  check('dedicated loopback port18182 is available', true);
  const snapshotBytes = await readFile(snapshotPath);
  const original = JSON.parse(snapshotBytes);
  const evidence = JSON.parse(await readFile(join(root, 'evidence/dogfood/live-local.json'), 'utf8'));
  const handoff = JSON.parse(await readFile(join(root, 'handoff.json'), 'utf8'));
  const recorded = evidence.godseed;
  check('dogfood and handoff identify the same published mission', recorded.program_id === handoff.executed_published_mission.program_id && recorded.execution_id === handoff.executed_published_mission.execution_id && recorded.checkpoint_id === handoff.executed_published_mission.checkpoint_id);
  check('export strips all prior principal token hashes', Object.values(original.data.principals).every((principal) => !Object.hasOwn(principal, 'token_hash') && !Object.hasOwn(principal, 'token_hashes')), { principals: Object.keys(original.data.principals).length });
  const recordedProgram = original.data.programs[recorded.program_id];
  const recordedExecution = original.data.executions[recorded.execution_id];
  const releaseId = new URL(recorded.release_url).pathname.split('/').at(-1);
  const recordedRelease = original.data.releases[releaseId];
  const recordedArtifacts = Object.fromEntries(recordedExecution.artifacts.map((id) => [id, original.data.artifacts[id]]));
  report.source = { snapshot: 'examples/live-session.snapshot.json', snapshot_bytes: snapshotBytes.length, snapshot_sha256: hash(snapshotBytes.toString()), snapshot_revision: original.revision, program_id: recorded.program_id, execution_id: recorded.execution_id, checkpoint_id: recorded.checkpoint_id, release_id: releaseId, prior_program_hash: hash(recordedProgram), prior_execution_hash: hash(recordedExecution), prior_release_hash: hash(recordedRelease), prior_artifacts_hash: hash(recordedArtifacts) };
  temporary = await mkdtemp(join(tmpdir(), 'purl-snapshot-restore-'));
  const statePath = join(temporary, 'state.json');
  await copyFile(snapshotPath, statePath);
  // Avoid inheriting configured cloud credentials. Authored execution is
  // explicitly disabled in both processes; all durable state is this copy.
  const env = { PATH: process.env.PATH, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '18182', PURL_BASE_URL: base, PURL_PERSISTENCE: 'file', PURL_DATA_FILE: statePath, PURL_SANDBOX_ENABLED: '0', PURL_SANDBOX_VERIFIED: '0', PURL_WORKER_ID: 'snapshot-restore-worker', PURL_WORKER_POLL_MS: '50', PURL_WORKER_HEARTBEAT_FILE: join(temporary, 'heartbeat.json') };
  const api = start('api', 'service/main.js', env);
  const worker = start('worker', 'service/worker.js', env);
  const deadline = Date.now() + 15000;
  let health;
  while (Date.now() < deadline) {
    if (api.exitCode !== null || worker.exitCode !== null) throw new Error('An owned service exited before readiness');
    try { health = await request('GET', '/healthz'); if (health.status === 200) break; } catch {}
    await sleep(100);
  }
  check('copied snapshot boots a separate API and worker', health?.status === 200, { persistence: health?.body?.persistence, api_pid: api.pid, worker_pid: worker.pid });
  const metadata = await request('GET', '/.well-known/purl');
  check('sandbox remains explicitly unavailable', metadata.body.capabilities.arbitrary_code_execution === false);
  const priorProgram = await request('GET', `/api/programs/${recorded.program_id}`);
  check('recorded public published mission is accessible', priorProgram.status === 200 && priorProgram.body.program.version === recordedProgram.version && priorProgram.body.program.language === 'purl');
  const priorExecution = await request('GET', `/api/executions/${recorded.execution_id}`);
  check('recorded immutable execution survives restore', priorExecution.status === 200 && priorExecution.body.execution.status === 'succeeded' && canonical(priorExecution.body.execution.value) === canonical(recorded.value));
  const priorContinuity = await request('GET', `/api/programs/${recorded.program_id}/continuity`);
  check('recorded checkpoint survives restore', priorContinuity.status === 200 && priorContinuity.body.checkpoint.id === recorded.checkpoint_id);
  const priorRelease = await request('GET', `/api/releases/${releaseId}`);
  check('recorded immutable release is accessible', priorRelease.status === 200 && priorRelease.body.release.id === releaseId && priorRelease.body.release.build_id === recorded.build_id);
  const forged = await request('GET', '/api/session', undefined, true, recordedProgram.owner);
  check('prior principal ID does not authenticate after hash stripping', forged.status === 401);
  const session = await request('POST', '/api/session', { label: 'Fresh snapshot restore verifier', kind: 'agent' });
  check('fresh agent session receives new credentials', session.status === 201 && Boolean(session.body.token) && !Object.hasOwn(original.data.principals, session.body.principal.id));
  token = session.body.token; freshCredentials.add(token);
  report.fresh_principal_id = session.body.principal.id;
  const denied = await request('POST', `/api/programs/${recorded.program_id}/source`, { expected_version: priorProgram.body.program.version, source: 'input json' }, true);
  check('fresh agent cannot edit the prior published mission', denied.status === 403);
  const forked = await request('POST', `/api/programs/${recorded.program_id}/fork`, { expected_version: priorProgram.body.program.version, title: 'Snapshot restored · fresh mission inspector' }, true);
  check('fresh agent can fork the public pure mission', forked.status === 201 && forked.body.program.id !== recorded.program_id && forked.body.program.owner === session.body.principal.id && forked.body.program.language === 'purl');
  let program = forked.body.program;
  check('fork preserves the full typed mission and clears grants', program.state.graph.nodes.length === 52 && program.state.graph.edges.length === 65 && program.grants.length === 0);
  const built = await request('POST', `/api/programs/${program.id}/build`, { expected_version: program.version }, true);
  check('restored inspector builds and its declared tests pass', built.status === 200 && built.body.build.status === 'passed' && built.body.build.tests_passed === true);
  program = built.body.program;
  const queued = await request('POST', `/api/programs/${program.id}/run`, { expected_version: program.version, input: program.state, seed: 0 }, true);
  check('fresh inspector execution is durably queued', queued.status === 202 && queued.body.execution.status === 'queued');
  const freshExecutionId = queued.body.execution.id;
  let executed;
  const executionDeadline = Date.now() + 15000;
  while (Date.now() < executionDeadline) {
    executed = await request('GET', `/api/executions/${freshExecutionId}`, undefined, true);
    if (['succeeded', 'failed', 'denied'].includes(executed.body.execution?.status)) break;
    await sleep(100);
  }
  check('separate sandbox-disabled worker completes pure inspector', executed?.status === 200 && executed.body.execution.status === 'succeeded', { worker_status: executed?.body.execution?.status, error: executed?.body.execution?.error });
  const execution = executed.body.execution;
  check('restored mission inspector computes52 nodes and65 edges', execution.value.total_nodes === 52 && execution.value.dependency_edges === 65 && execution.value.completion === 'NOT_RUN' && execution.value.verified === false, { value: execution.value });
  const artifact = await request('GET', `/api/artifacts/${execution.artifacts[0]}`, undefined, true);
  check('fresh immutable result artifact is accessible', artifact.status === 200 && canonical(artifact.body.artifact.value) === canonical(execution.value));
  const replay = await request('GET', `/api/programs/${program.id}/replay`, undefined, true);
  check('fresh fork and execution replay verify', replay.status === 200 && replay.body.valid === true && replay.body.executions.some((entry) => entry.execution_id === freshExecutionId && entry.valid === true));
  const afterProgram = await request('GET', `/api/programs/${recorded.program_id}`);
  const afterExecution = await request('GET', `/api/executions/${recorded.execution_id}`);
  const afterContinuity = await request('GET', `/api/programs/${recorded.program_id}/continuity`);
  const afterRelease = await request('GET', `/api/releases/${releaseId}`);
  check('original program HTTP representation remains unchanged', canonical(afterProgram.body) === canonical(priorProgram.body));
  check('original execution HTTP representation remains unchanged', canonical(afterExecution.body) === canonical(priorExecution.body));
  check('original checkpoint HTTP representation remains unchanged', canonical(afterContinuity.body) === canonical(priorContinuity.body));
  check('original release HTTP representation remains unchanged', canonical(afterRelease.body) === canonical(priorRelease.body));
  const finalState = JSON.parse(await readFile(statePath, 'utf8'));
  check('prior stored published program is byte-equivalent canonically', canonical(finalState.data.programs[recorded.program_id]) === canonical(recordedProgram));
  check('prior stored execution is byte-equivalent canonically', canonical(finalState.data.executions[recorded.execution_id]) === canonical(recordedExecution));
  check('prior stored release is byte-equivalent canonically', canonical(finalState.data.releases[releaseId]) === canonical(recordedRelease));
  check('prior stored artifacts remain unchanged', Object.entries(recordedArtifacts).every(([id, value]) => canonical(finalState.data.artifacts[id]) === canonical(value)));
  check('exported snapshot itself remains unchanged', (await readFile(snapshotPath)).equals(snapshotBytes));
  report.fresh = { program_id: program.id, program_visibility: program.visibility, build_id: built.body.build.id, execution_id: execution.id, artifact_ids: execution.artifacts, value: execution.value, final_revision: finalState.revision };
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = { message: error.message, stack: error.stack };
} finally {
  await Promise.all(children.map(stop));
  for (const stream of streams) await new Promise((resolve) => stream.end(resolve));
  if (temporary) { await rm(temporary, { recursive: true, force: true }); report.disposable_state_removed = true; }
  report.owned_processes_stopped = children.every((child) => child.exitCode !== null || child.signalCode !== null);
  report.completed_at = new Date().toISOString();
  report.summary = { checks: checks.length, passed: checks.filter((check) => check.status === 'PASS').length, failed: checks.filter((check) => check.status === 'FAIL').length };
  report.artifacts = { harness: 'evidence/infrastructure/snapshot-restore/harness.mjs', raw_http: 'evidence/infrastructure/snapshot-restore/raw-http.jsonl', api_log: 'evidence/infrastructure/snapshot-restore/api.log', worker_log: 'evidence/infrastructure/snapshot-restore/worker.log' };
  // Defense in depth: never emit even the newly created disposable bearer.
  const raw = await readFile(rawPath, 'utf8').catch(() => '');
  for (const credential of freshCredentials) assert.ok(!raw.includes(credential), 'No bearer token may appear in raw evidence');
  await writeFile(reportPath, `${JSON.stringify(redact(report), null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, ...report.summary, report: 'evidence/infrastructure/snapshot-restore/report.json', error: report.error?.message ?? null, owned_processes_stopped: report.owned_processes_stopped, disposable_state_removed: report.disposable_state_removed }));
  if (report.status !== 'PASS') process.exitCode = 1;
}
