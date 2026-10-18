#!/usr/bin/env node
// GET-only public migration/recovery verification. No bearer or environment read.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const output = dirname(fileURLToPath(import.meta.url));
const root = resolve(output, '../../..');
const base = 'https://purl-api-production.up.railway.app';
const phase = process.argv[2] ?? 'migration';
const runFile = promisify(execFile);
assert.ok(['migration', 'capture-native', 'after-restart'].includes(phase));
const canonical = (value) => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
const hash = (value) => `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
const without = (value, fields = ['content_id']) => Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
const checks = [];
const report = { schema: 'purl.public-migration-recovery/1', phase, status: 'RUNNING', started_at: new Date().toISOString(), execution_class: 'LIVE_PUBLIC_RAILWAY_API_SEPARATE_WORKER_HOSTED_SUPABASE', base_url: base, request_policy: 'GET only; no bearer or server credential/environment reads', checks, targets: {}, strict_historical_replay: [] };
const rawPath = join(output, `${phase}-raw-http.jsonl`);
function check(name, passed, detail = {}) { checks.push({ ...detail, name, status: passed ? 'PASS' : 'FAIL' }); assert.ok(passed, name); }
function redact(value, key = '') {
  if (/^(token|access_token|token_hash|token_hashes|authorization|secret|cookie)$/i.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
  return value;
}
async function get(path) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'));
  // curl follows the managed workspace's configured network routing. The
  // harness neither reads nor logs environment/proxy configuration.
  const marker = '\nPURL_HTTP_STATUS:';
  const result = await runFile('curl', ['--silent', '--show-error', '--max-time', '30', '--request', 'GET', '--header', 'Accept: application/purl+json', '--write-out', `${marker}%{http_code}`, `${base}${path}`], { maxBuffer: 8 * 1024 * 1024 });
  const index = result.stdout.lastIndexOf(marker);
  assert.ok(index >= 0, 'HTTP transport returned a status marker');
  const status = Number(result.stdout.slice(index + marker.length));
  const body = JSON.parse(result.stdout.slice(0, index));
  await appendFile(rawPath, `${JSON.stringify(redact({ at: new Date().toISOString(), request: { method: 'GET', path }, response: { status, body } }))}\n`);
  return { status, body };
}
async function verifyTarget(label, target, historical = true) {
  const responses = {};
  const fingerprints = {};
  for (const [name, path] of Object.entries(target.paths)) {
    const response = await get(path);
    check(`${label}: public ${name} is accessible`, response.status === 200, { http_status: response.status });
    responses[name] = response.body; fingerprints[name] = hash(response.body);
    if (target.fingerprints?.[name]) check(`${label}: ${name} fingerprint is unchanged`, fingerprints[name] === target.fingerprints[name]);
  }
  const execution = responses.execution.execution;
  const artifact = responses.artifact.artifact;
  const receipt = execution.receipt;
  check(`${label}: original execution remains succeeded`, execution.status === 'succeeded');
  check(`${label}: receipt and input content hashes verify`, receipt.content_id === hash(without(receipt)) && execution.input_id === hash(execution.input) && receipt.input_id === execution.input_id);
  check(`${label}: artifact and receipt binding verify`, artifact.content_id === hash(without(artifact, ['content_id', 'storage'])) && receipt.artifact_content_id === artifact.content_id && canonical(artifact.value) === canonical(execution.value));
  check(`${label}: persisted private Storage reference is unchanged`, canonical(artifact.storage) === canonical(target.storage ?? artifact.storage));
  check(`${label}: checkpoint and release identities survive`, responses.continuity.checkpoint.id === target.checkpoint_id && responses.release.release.id === target.release_id && responses.release.release.build_id === execution.build_id);
  const replay = await get(`/api/programs/${target.program_id}/replay`);
  check(`${label}: program history replay remains valid`, replay.status === 200 && replay.body.program_valid === true);
  const observed = replay.body.executions?.find((item) => item.execution_id === target.execution_id);
  const environment = { captured_build: execution.environment, captured_runtime: execution.runtime_environment };
  if (historical) {
    report.strict_historical_replay.push({ label, execution_id: target.execution_id, http_status: replay.status, overall_valid: replay.body.valid, program_valid: replay.body.program_valid, execution: observed, environment, interpretation: observed?.valid === true ? 'Strict historical execution replay actually passed on this public runtime.' : 'Historical immutable content is preserved, but strict execution replay rejects this current runtime. Node/runtime environment must match the captured trace; this is not a claim that old strict replay passed.' });
    check(`${label}: historical strict replay reports a concrete outcome`, observed?.valid === true || observed?.valid === false && typeof observed.problem === 'string', { strict_execution_valid: observed?.valid, problem: observed?.problem ?? null });
  } else {
    check(`${label}: native Railway Node22 runtime is captured`, String(execution.runtime_environment?.runtime_version).startsWith('v22.'), { node: execution.runtime_environment?.runtime_version });
    check(`${label}: native strict deterministic replay actually passes`, replay.body.valid === true && observed?.valid === true, { replay: observed });
  }
  return { ...target, fingerprints, captured_environment: environment, value: execution.value, strict_replay: observed };
}

try {
  await mkdir(output, { recursive: true }); await writeFile(rawPath, '', { mode: 0o600 });
  const health = await get('/healthz');
  check('public Railway API reaches hosted Supabase authority', health.status === 200 && health.body.persistence === 'supabase', { health: health.body });
  const metadata = await get('/.well-known/purl');
  check('public arbitrary authored execution remains disabled', metadata.status === 200 && metadata.body.capabilities.arbitrary_code_execution === false);
  check('public canonical address matches transport origin', metadata.body.endpoints.programs === `${base}/api/programs`);
  if (phase === 'migration') {
    const source = JSON.parse(await readFile(join(root, 'evidence/deployment/hosted-backend/report.json'), 'utf8'));
    check('historical local-control-plane hosted dogfood proof is preserved', source.status === 'PASS' && source.summary.passed === 42, { historical_evidence: 'evidence/deployment/hosted-backend/report.json', historical_runtime: 'Node24', historical_transport: source.transport });
    for (const [label, target] of Object.entries(source.targets)) report.targets[label] = await verifyTarget(label, target, true);
    report.scope = 'Original programs, executions, releases, checkpoints and artifacts migrated from local production-configured processes to public Railway using the same hosted authority. Historical strict replay outcome is recorded separately.';
  } else if (phase === 'capture-native') {
    const [programId, executionId] = process.argv.slice(3);
    assert.ok(programId?.startsWith('program_') && executionId?.startsWith('execution_'), 'Supply a frozen public program_id and execution_id');
    const p = await get(`/api/programs/${programId}`); const e = await get(`/api/executions/${executionId}`);
    check('native public program and execution exist', p.status === 200 && e.status === 200 && p.body.program.language === 'purl' && e.body.execution.program_id === programId);
    const releaseId = p.body.program.releases.at(-1); const checkpointId = p.body.program.checkpoints.at(-1)?.id; const artifactId = e.body.execution.artifacts[0];
    check('native record has a release checkpoint and artifact', Boolean(releaseId && checkpointId && artifactId));
    const target = { program_id: programId, execution_id: executionId, release_id: releaseId, checkpoint_id: checkpointId, artifact_id: artifactId, paths: { program: `/api/programs/${programId}`, execution: `/api/executions/${executionId}`, release: `/api/releases/${releaseId}`, continuity: `/api/programs/${programId}/continuity`, artifact: `/api/artifacts/${artifactId}` } };
    report.targets.native = await verifyTarget('native', target, false);
    report.scope = 'Baseline frozen native Railway Node22 public records and strict replay before process restart.';
  } else {
    const migrated = JSON.parse(await readFile(join(output, 'migration-report.json'), 'utf8'));
    check('public migration baseline completed successfully', migrated.status === 'PASS');
    for (const [label, target] of Object.entries(migrated.targets)) report.targets[label] = await verifyTarget(label, target, true);
    const native = JSON.parse(await readFile(join(output, 'capture-native-report.json'), 'utf8'));
    check('native Railway baseline completed successfully', native.status === 'PASS');
    for (const [label, target] of Object.entries(native.targets)) report.targets[label] = await verifyTarget(label, target, false);
    report.scope = 'Read after root-confirmed Railway API/worker restart; original and native public immutable record fingerprints and native strict replay checked.';
    report.restart_control_evidence = 'Root owns and confirms Railway process restart; this GET-only harness performs no deployment mutation.';
  }
  report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.error = { message: error.message, stack: error.stack }; }
finally {
  report.completed_at = new Date().toISOString();
  report.summary = { checks: checks.length, passed: checks.filter((item) => item.status === 'PASS').length, failed: checks.filter((item) => item.status === 'FAIL').length };
  await writeFile(join(output, `${phase}-report.json`), `${JSON.stringify(redact(report), null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ phase, status: report.status, ...report.summary, report: `evidence/deployment/public-recovery/${phase}-report.json`, strict_historical_replay: report.strict_historical_replay.map((item) => ({ label: item.label, valid: item.execution?.valid, problem: item.execution?.problem })), error: report.error?.message ?? null }));
  if (report.status !== 'PASS') process.exitCode = 1;
}
