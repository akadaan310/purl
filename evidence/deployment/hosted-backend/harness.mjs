#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { awaitExecution, canonical, canonicalBase, client, hash, output, recorder, transport, without } from './common.mjs';

const checks = [];
const check = recorder(checks);
const http = client(join(output, 'raw-http.jsonl'));
const report = { schema: 'purl.hosted-backend-dogfood/1', status: 'RUNNING', started_at: new Date().toISOString(), execution_class: 'LIVE_HOSTED_SUPABASE_WITH_LOCAL_PRODUCTION_CONFIGURED_API_AND_WORKER', transport, canonical_base: canonicalBase, railway_deployed: false, sandbox: 'disabled', credential_handling: 'Fresh bearer remains only in harness memory; response tokens redacted; no environment or server credential access', checks, targets: {} };

async function perform(program, operation, body = {}) {
  const result = await http.request('POST', `/api/programs/${program.id}/${operation}`, { expected_version: program.version, ...body }, true);
  check(`${program.title}: ${operation} succeeds`, result.status === ({ run: 202, publish: 201 }[operation] ?? 200), { status: result.status, error: result.body.error ?? null });
  return result.body;
}
async function inspectResult(label, program, execution) {
  check(`${label}: worker succeeds durably`, execution.status === 'succeeded', { execution_id: execution.id, status: execution.status, error: execution.error });
  check(`${label}: immutable receipt hash and captured input verify`, execution.receipt.content_id === hash(without(execution.receipt)) && execution.input_id === hash(execution.input) && execution.receipt.input_id === execution.input_id && execution.receipt.build_content_id === execution.build_content_id && execution.receipt.environment_id === execution.environment_id && execution.receipt.runtime_environment_id === execution.runtime_environment_id && execution.receipt.deterministic === true);
  const artifactResponse = await http.request('GET', `/api/artifacts/${execution.artifacts[0]}`);
  check(`${label}: durable artifact JSON fetch succeeds`, artifactResponse.status === 200);
  const artifact = artifactResponse.body.artifact;
  const core = without(artifact, ['content_id', 'storage']);
  check(`${label}: immutable artifact content hash and receipt binding verify`, hash(core) === artifact.content_id && execution.receipt.artifact_content_id === artifact.content_id && canonical(artifact.value) === canonical(execution.value));
  check(`${label}: private Storage descriptor matches canonical artifact bytes`, artifact.storage?.id === artifact.content_id && artifact.storage?.size === Buffer.byteLength(canonical(core)) && artifact.storage?.key?.includes(artifact.content_id.slice(7)), { storage: artifact.storage, validation_scope: 'API artifact plus descriptor; actual private Storage byte fetch is separate server-side evidence' });
  await writeFile(join(output, `${label}-artifact.json`), `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
  const replay = await http.request('GET', `/api/programs/${program.id}/replay`);
  check(`${label}: program and execution deterministic replay pass`, replay.status === 200 && replay.body.valid === true && replay.body.executions.some((item) => item.execution_id === execution.id && item.valid === true));
  return artifact;
}
async function publicSnapshots(label, id, executionId, releaseId, checkpointId, artifactId) {
  const paths = { program: `/api/programs/${id}`, execution: `/api/executions/${executionId}`, release: `/api/releases/${releaseId}`, continuity: `/api/programs/${id}/continuity`, artifact: `/api/artifacts/${artifactId}` };
  const fingerprints = {};
  for (const [name, path] of Object.entries(paths)) {
    const result = await http.request('GET', path);
    check(`${label}: final public ${name} is accessible`, result.status === 200);
    fingerprints[name] = hash(result.body);
  }
  return { program_id: id, execution_id: executionId, release_id: releaseId, checkpoint_id: checkpointId, artifact_id: artifactId, paths, fingerprints };
}

try {
  await http.initialize();
  const health = await http.request('GET', '/healthz');
  check('production-configured API reports actual Supabase persistence', health.status === 200 && health.body.persistence === 'supabase', { health: health.body });
  const metadata = await http.request('GET', '/.well-known/purl');
  check('authored execution stays disabled', metadata.status === 200 && metadata.body.capabilities.arbitrary_code_execution === false);
  check('canonical URLs identify allocated Railway hostname without transport use', metadata.body.endpoints.programs === `${canonicalBase}/api/programs`, { allocation_only: true });
  const session = await http.request('POST', '/api/session', { kind: 'agent', label: 'Hosted persistence dogfood verifier' });
  check('fresh claimed agent session is created without identity escalation', session.status === 201 && session.body.principal.kind === 'agent' && session.body.principal.identity_verified === false);
  http.setToken(session.body.token);
  report.principal_id = session.body.principal.id;
  const created = await http.request('POST', '/api/programs', { title: 'Hosted arithmetic persistence4to18', kind: 'program', language: 'purl', visibility: 'public', source: 'input number | math.add 2 | math.multiply 3', input_schema: { type: 'number' }, output_schema: { type: 'number' }, tests: [{ input: 4, expected: 18 }, { input: 0, expected: 6 }] }, true);
  check('public pure arithmetic program is persisted', created.status === 201 && created.body.program.url.startsWith(`${canonicalBase}/p/`));
  let math = created.body.program;
  let result = await perform(math, 'build'); math = result.program;
  check('arithmetic build and both declared tests pass', result.build.status === 'passed' && result.build.tests_passed && result.build.tests.length === 2 && result.build.tests.every((test) => test.passed));
  result = await perform(math, 'run', { input: 4, seed: 7 }); math = result.program;
  const mathExecution = await awaitExecution(http, result.execution.id);
  check('arithmetic computes4to18', mathExecution.value === 18);
  const mathArtifact = await inspectResult('arithmetic', math, mathExecution);
  result = await perform(math, 'publish'); math = result.program;
  const mathRelease = result.release;
  result = await perform(math, 'checkpoint', { summary: 'Hosted Supabase arithmetic build, queued execution, deterministic replay and Storage-backed result validated; input4 produces18.', evidence: [mathArtifact.id, mathExecution.id], next: ['Read immutable release and recheck after process restart'] }); math = result.program;
  const mathCheckpoint = result.checkpoint;
  report.targets.arithmetic = await publicSnapshots('arithmetic', math.id, mathExecution.id, mathRelease.id, mathCheckpoint.id, mathArtifact.id);
  report.targets.arithmetic.storage = mathArtifact.storage;

  const seed = await http.request('GET', '/api/programs/godseed-mission');
  check('complete seeded mission exists in hosted document', seed.status === 200 && seed.body.program.state.graph.nodes.length === 52 && seed.body.program.state.graph.edges.length === 65 && seed.body.program.source === 'input json | mission.inspect');
  const fork = await http.request('POST', '/api/programs/godseed-mission/fork', { expected_version: seed.body.program.version, title: 'Hosted God Seed persistence inspector', visibility: 'public' }, true);
  check('fresh principal forks public pure mission with isolated authority', fork.status === 201 && fork.body.program.owner === report.principal_id && fork.body.program.grants.length === 0 && fork.body.program.visibility === 'public');
  let mission = fork.body.program;
  result = await perform(mission, 'build'); mission = result.program;
  check('mission inspector build passes', result.build.status === 'passed' && result.build.tests_passed);
  result = await perform(mission, 'run', { input: mission.state, seed: 0 }); mission = result.program;
  const missionExecution = await awaitExecution(http, result.execution.id);
  check('mission inspector computes52nodes65edges and preserves evidence limits', missionExecution.value?.total_nodes === 52 && missionExecution.value?.dependency_edges === 65 && missionExecution.value?.verified === false && missionExecution.value?.completion === 'NOT_RUN');
  const missionArtifact = await inspectResult('mission', mission, missionExecution);
  result = await perform(mission, 'checkpoint', { summary: 'Hosted Supabase mission inspector executed52nodes65dependency edges; requirement completion remains NOT_RUN and unverified.', evidence: [missionArtifact.id, missionExecution.id], next: ['Verify persistence after API/worker restart', 'Review real requirement evidence in dependency order'] }); mission = result.program;
  const missionCheckpoint = result.checkpoint;
  result = await perform(mission, 'publish'); mission = result.program;
  report.targets.mission = await publicSnapshots('mission', mission.id, missionExecution.id, result.release.id, missionCheckpoint.id, missionArtifact.id);
  report.targets.mission.storage = missionArtifact.storage;
  report.targets.mission.value = missionExecution.value;
  const seedAfter = await http.request('GET', '/api/programs/godseed-mission');
  check('seeded mission remains unchanged by fresh agent work', hash(seed.body) === hash(seedAfter.body));
  report.status = 'PASS'; report.restart_verification = 'AWAITING_ROOT_PROCESS_RESTART';
  report.storage_byte_fetch = 'PENDING_SEPARATE_SERVER_SIDE_FETCH: no public private-Storage byte-fetch route exists';
} catch (error) {
  report.status = 'FAIL'; report.error = { message: error.message, stack: error.stack };
} finally {
  report.completed_at = new Date().toISOString();
  report.summary = { checks: checks.length, passed: checks.filter((item) => item.status === 'PASS').length, failed: checks.filter((item) => item.status === 'FAIL').length };
  await writeFile(join(output, 'report.json'), `${JSON.stringify(http.redact(report), null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, ...report.summary, report: 'evidence/deployment/hosted-backend/report.json', restart_verification: report.restart_verification, error: report.error?.message ?? null }));
  if (report.status !== 'PASS') process.exitCode = 1;
}
