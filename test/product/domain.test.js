import test from 'node:test';
import assert from 'node:assert/strict';
import { PurlService } from '../../service/domain.js';
import { FileRepository } from '../../service/repository.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A tiny transactional test repository exercises the same synchronous
// transaction contract as the durable repository adapters without I/O.
class TestRepository {
  data = { principals: {}, programs: {}, executions: {}, artifacts: {}, audit: [] };
  revision = 0;
  async read() { return structuredClone({ revision: this.revision, data: this.data }); }
  async transaction(mutator) {
    const data = structuredClone(this.data);
    const result = mutator(data);
    assert.ok(!(result instanceof Promise), 'repository transaction must not perform async side effects');
    this.data = data;
    this.revision++;
    return structuredClone(result);
  }
}
const source = 'input number | math.add 2 | math.multiply 3';
async function setup() {
  const repository = new TestRepository();
  const service = new PurlService({ repository, baseUrl: 'https://purl.example' });
  const session = (await service.handle('POST', '/api/session', { label: 'Owner', kind: 'agent', admin: true })).body;
  return { repository, service, token: session.token, principal: session.principal };
}
async function create(ctx, extra = {}) {
  const result = await ctx.service.handle('POST', '/api/programs', { title: 'Math', language: 'purl', source, visibility: 'public', input_schema: { type: 'number' }, output_schema: { type: 'number' }, tests: [{ input: 4, expected: 18 }], ...extra }, { token: ctx.token });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.program;
}
async function mutate(ctx, program, operation, body = {}, options = {}) {
  return ctx.service.handle('POST', `/api/programs/${program.id}/${operation}`, { expected_version: program.version, ...body }, { token: ctx.token, ...options });
}
test('sessions hash bearer secrets and reject forged authority; GET never mutates', async () => {
  const ctx = await setup();
  assert.equal(ctx.principal.admin, undefined);
  const program = await create(ctx, { visibility: 'private' });
  const before = (await ctx.repository.read()).revision;
  assert.equal((await ctx.service.handle('GET', `/api/programs/${program.id}`)).status, 404);
  assert.equal((await ctx.service.handle('GET', '/api/programs', null, { token: ctx.principal.id })).status, 401);
  assert.equal((await ctx.service.handle('GET', `/api/programs/${program.id}`, null, { token: ctx.token })).status, 200);
  assert.equal((await ctx.repository.read()).revision, before);
  assert.ok(!JSON.stringify((await ctx.repository.read()).data).includes(ctx.token));
  const outsider = await ctx.service.handle('POST', '/api/session', { kind: 'agent', label: 'Forged owner', id: ctx.principal.id, admin: true });
  assert.equal((await ctx.service.handle('POST', `/api/programs/${program.id}/source`, { expected_version: program.version, source }, { token: outsider.body.token })).status, 403);
});
test('compile, tested immutable build, durable run, publish, artifact and replay', async () => {
  const ctx = await setup();
  let program = await create(ctx);
  let result = await mutate(ctx, program, 'compile');
  assert.equal(result.status, 200, JSON.stringify(result.body)); program = result.body.program;
  result = await mutate(ctx, program, 'build');
  assert.equal(result.body.build.status, 'passed', JSON.stringify(result.body)); program = result.body.program;
  const buildId = result.body.build.id;
  result = await mutate(ctx, program, 'run', { input: 4, seed: 7 });
  assert.equal(result.status, 202, JSON.stringify(result.body)); program = result.body.program;
  const executionId = result.body.execution.id;
  assert.equal(result.body.execution.status, 'queued');
  const restarted = new PurlService({ repository: ctx.repository, baseUrl: 'https://purl.example' });
  assert.ok(await restarted.workOnce({ workerId: 'restart-worker' }));
  const execution = (await restarted.handle('GET', `/api/executions/${executionId}`)).body.execution;
  assert.equal(execution.status, 'succeeded', JSON.stringify(execution));
  assert.equal(execution.value, 18);
  assert.equal(execution.build_id, buildId);
  assert.equal(execution.input, 4);
  assert.equal(execution.seed, 7);
  assert.ok(execution.environment.environment_id);
  assert.ok(execution.receipt.deterministic);
  assert.equal((await restarted.handle('GET', `/api/artifacts/${execution.artifacts[0]}`)).body.artifact.value, 18);
  result = await mutate(ctx, program, 'publish');
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal((await ctx.service.handle('GET', `/api/releases/${result.body.release.id}`)).body.release.build_id, buildId);
  assert.equal((await ctx.service.handle('GET', `/api/programs/${program.id}/replay`)).body.valid, true);
});
test('request-bound durable idempotency rechecks live revoked grants and stale versions', async () => {
  const ctx = await setup();
  let program = await create(ctx);
  const contributor = (await ctx.service.handle('POST', '/api/session', { kind: 'agent', label: 'Contributor' })).body;
  let result = await mutate(ctx, program, 'grants', { principal_id: contributor.principal.id, rights: ['read', 'edit', 'build', 'run'] });
  assert.equal(result.status, 201); program = result.body.program;
  const grantId = result.body.grant.id;
  const requestBody = { expected_version: program.version, source: 'input number | math.add 9' };
  result = await ctx.service.handle('POST', `/api/programs/${program.id}/source`, requestBody, { token: contributor.token, idempotencyKey: 'same-request' });
  assert.equal(result.status, 200); program = result.body.program;
  const restarted = new PurlService({ repository: ctx.repository });
  const replay = await restarted.handle('POST', `/api/programs/${program.id}/source`, requestBody, { token: contributor.token, idempotencyKey: 'same-request' });
  assert.equal(replay.status, 200); assert.equal(replay.body.program.version, program.version);
  assert.equal((await restarted.handle('POST', `/api/programs/${program.id}/source`, { ...requestBody, source }, { token: contributor.token, idempotencyKey: 'same-request' })).status, 409);
  assert.equal((await mutate(ctx, program, 'source', { expected_version: 1, source })).status, 409);
  result = await mutate(ctx, program, 'revoke', { grant_id: grantId }); program = result.body.program;
  assert.equal((await restarted.handle('POST', `/api/programs/${program.id}/source`, requestBody, { token: contributor.token, idempotencyKey: 'same-request' })).status, 403);
  assert.ok(!JSON.stringify((await ctx.repository.read()).data).includes(contributor.token));
});
test('worker denies a queued execution after its grant is revoked', async () => {
  const ctx = await setup(); let program = await create(ctx);
  let result = await mutate(ctx, program, 'build'); program = result.body.program;
  const guest = (await ctx.service.handle('POST', '/api/session', { label: 'Guest' })).body;
  result = await mutate(ctx, program, 'grants', { principal_id: guest.principal.id, rights: ['read', 'run'] }); program = result.body.program;
  const grantId = result.body.grant.id;
  result = await ctx.service.handle('POST', `/api/programs/${program.id}/run`, { expected_version: program.version, input: 4 }, { token: guest.token });
  assert.equal(result.status, 202); program = result.body.program;
  const id = result.body.execution.id;
  await mutate(ctx, program, 'revoke', { grant_id: grantId });
  await ctx.service.workOnce({ workerId: 'authority-check' });
  const execution = (await ctx.service.handle('GET', `/api/executions/${id}`)).body.execution;
  assert.equal(execution.status, 'denied'); assert.equal(execution.error.code, 'authority_revoked');
});
test('expired durable leases recover without duplicate completion', async () => {
  const ctx = await setup(); let program = await create(ctx);
  let result = await mutate(ctx, program, 'build'); program = result.body.program;
  result = await mutate(ctx, program, 'run', { input: 4 }); const id = result.body.execution.id;
  await ctx.repository.transaction((data) => { const job = data.executions[id]; job.status = 'running'; job.attempts = 1; job.lease = { worker_id: 'dead-worker', claim_id: 'dead-claim', expires_at: '2000-01-01T00:00:00.000Z' }; });
  await new PurlService({ repository: ctx.repository }).workOnce({ workerId: 'recovery' });
  const execution = (await ctx.service.handle('GET', `/api/executions/${id}`)).body.execution;
  assert.equal(execution.status, 'succeeded'); assert.equal(execution.attempts, 2);
  assert.equal(await ctx.service.workOnce({ workerId: 'again' }), null);
  assert.equal(Object.keys((await ctx.repository.read()).data.artifacts).length, 1);
});
test('checkpoint/proposal/commit/fork/diff reconstruct continuation with no inherited grants', async () => {
  const ctx = await setup(); let program = await create(ctx);
  let result = await mutate(ctx, program, 'checkpoint', { summary: 'Math validated', next: ['publish'], evidence: ['test/product/domain.test.js'] }); program = result.body.program;
  const checkpoint = result.body.checkpoint;
  result = await mutate(ctx, program, 'propose', { summary: 'Increment by one', source: 'input number | math.add 1' }); program = result.body.program;
  result = await mutate(ctx, program, 'commit', { proposal_id: result.body.proposal.id });
  assert.equal(result.status, 200, JSON.stringify(result.body)); program = result.body.program;
  const continuation = (await ctx.service.handle('GET', `/api/programs/${program.id}/continuity`)).body;
  assert.equal(continuation.checkpoint.id, checkpoint.id); assert.ok(continuation.next_operations.length);
  assert.ok((await ctx.service.handle('GET', `/api/programs/${program.id}/diff?from=1&to=${program.version}`)).body.changes.length);
  result = await mutate(ctx, program, 'fork', { title: 'Forked math' });
  assert.equal(result.status, 201); assert.equal(result.body.program.lineage.program_id, program.id);
  assert.equal(result.body.program.owner, ctx.principal.id); assert.deepEqual(result.body.program.grants, []);
  assert.equal((await ctx.service.handle('GET', `/api/programs/${program.id}/replay`)).body.valid, true);
});
test('game atomically validates players, turn races, winners and replay', async () => {
  const ctx = await setup(); let program = await create(ctx, { kind: 'game' });
  const opponent = (await ctx.service.handle('POST', '/api/session', { label: 'Opponent' })).body;
  let result = await ctx.service.handle('POST', `/api/programs/${program.id}/join`, { expected_version: program.version }, { token: opponent.token });
  assert.equal(result.status, 200); program = result.body.program;
  const race = await Promise.all([mutate(ctx, program, 'move', { cell: 0 }), mutate(ctx, program, 'move', { cell: 1 })]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]); program = race.find((r) => r.status === 200).body.program;
  assert.equal((await mutate(ctx, program, 'move', { cell: 3 })).status, 409);
  for (const [cell, token] of [[3, opponent.token], [1, ctx.token], [4, opponent.token], [2, ctx.token]]) {
    result = await ctx.service.handle('POST', `/api/programs/${program.id}/move`, { expected_version: program.version, cell }, { token });
    assert.equal(result.status, 200, JSON.stringify(result.body)); program = result.body.program;
  }
  assert.equal(program.state.winner, 'X');
  assert.equal((await ctx.service.handle('POST', `/api/programs/${program.id}/move`, { expected_version: program.version, cell: 8 }, { token: opponent.token })).status, 409);
  assert.equal((await new PurlService({ repository: ctx.repository }).handle('GET', `/api/programs/${program.id}/replay`)).body.valid, true);
});
test('unlisted resources are reachable by URL, private artifacts remain private, schemas reject bad data', async () => {
  const ctx = await setup(); let program = await create(ctx, { visibility: 'unlisted' });
  assert.equal((await ctx.service.handle('GET', '/api/programs')).body.items.some((p) => p.id === program.id), false);
  assert.equal((await ctx.service.handle('GET', `/api/programs/${program.id}`)).status, 200);
  let result = await mutate(ctx, program, 'build'); program = result.body.program;
  assert.equal((await mutate(ctx, program, 'run', { input: 'oops' })).status, 422);
  const privateProgram = await create(ctx, { visibility: 'private' });
  result = await mutate(ctx, privateProgram, 'build');
  result = await mutate(ctx, result.body.program, 'run', { input: 4 });
  await ctx.service.workOnce({ workerId: 'private-worker' });
  const execution = (await ctx.service.handle('GET', `/api/executions/${result.body.execution.id}`, null, { token: ctx.token })).body.execution;
  assert.equal((await ctx.service.handle('GET', `/api/artifacts/${execution.artifacts[0]}`)).status, 404);
});
test('authored code execution and publication fail closed without a verified isolated adapter', async () => {
  const ctx = await setup(); let program = await create(ctx, { language: 'javascript', source: 'return input + 1;', tests: [{ input: 1, expected: 2 }] });
  let result = await mutate(ctx, program, 'build'); assert.equal(result.body.build.status, 'blocked'); program = result.body.program;
  assert.equal((await mutate(ctx, program, 'run', { input: 1 })).status, 422);
  assert.equal((await mutate(ctx, program, 'publish')).status, 422);
});
test('seed mission contains the full directive and navigable typed graph; manifests expose no tokens', async () => {
  const ctx = await setup(); await ctx.service.seed();
  const before = (await ctx.repository.read()).revision;
  const meta = await ctx.service.handle('GET', '/.well-known/purl');
  assert.equal(meta.body.protocol, 'PURL/0.2');
  const missionId = meta.body.mission.id;
  const mission = (await ctx.service.handle('GET', `/api/programs/${missionId}`)).body.program;
  assert.ok(mission.state.directive.includes('FULL PRODUCT GOD SEED'));
  assert.ok(mission.state.graph.nodes.length >= 35);
  assert.ok(mission.state.graph.nodes.every((node) => node.completion_predicate && node.tests && node.href));
  const manifest = (await ctx.service.handle('GET', `/api/programs/${missionId}/manifest`)).body;
  assert.ok(manifest.continuation); assert.ok(manifest.operations.some((o) => o.name === 'checkpoint'));
  assert.equal((await ctx.repository.read()).revision, before);
  assert.ok(!JSON.stringify(meta.body).includes(ctx.token));
  assert.ok(mission.state.amendment.includes('Proceed immediately without Oracle credentials'));
  assert.ok(mission.builds.every((build) => build.status === 'passed'));
  const seedGame = (await ctx.service.handle('GET', '/api/programs/tic-tac-toe')).body.program;
  const firstJoin = await mutate(ctx, seedGame, 'join');
  assert.equal(firstJoin.status, 200); assert.equal(firstJoin.body.program.state.players.X, ctx.principal.id);
});

test('verified account exchange maps stable principals and never trusts client account claims', async () => {
  const ctx = await setup();
  assert.equal((await ctx.service.handle('POST', '/api/auth/session', { access_token: 'provider' })).status, 503);
  const service = new PurlService({ repository: ctx.repository, verifyHuman: async (token) => {
    if (token !== 'real-provider-session') throw new Error('no');
    return { id: 'verified-provider-subject', issuer: 'https://identity.example', label: 'Member' };
  } });
  assert.equal((await service.handle('POST', '/api/auth/session', { access_token: 'forged', id: ctx.principal.id, admin: true })).status, 401);
  const a = await service.handle('POST', '/api/auth/session', {}, { token: 'real-provider-session' });
  const b = await service.handle('POST', '/api/auth/session', { access_token: 'real-provider-session', owner: ctx.principal.id });
  assert.equal(a.status, 201); assert.equal(a.body.principal.id, b.body.principal.id);
  assert.equal(a.body.principal.identity_verified, true); assert.equal(a.body.principal.admin, undefined);
  assert.equal((await service.handle('GET', '/api/session', null, { token: a.body.token })).status, 200);
  assert.equal((await service.handle('GET', '/api/session', null, { token: b.body.token })).status, 200);
  const privateProgram = await create(ctx, { visibility: 'private' });
  assert.equal((await service.handle('GET', `/api/programs/${privateProgram.id}`, null, { token: a.body.token })).status, 404);
  const state = JSON.stringify((await ctx.repository.read()).data);
  assert.ok(!state.includes('real-provider-session')); assert.ok(!state.includes(a.body.token)); assert.ok(!state.includes(b.body.token));
});

test('idle workers perform no writes and artifact Storage errors never acknowledge success', async () => {
  const ctx = await setup(); const initial = ctx.repository.revision;
  assert.equal(await ctx.service.workOnce({ workerId: 'idle' }), null);
  assert.equal(ctx.repository.revision, initial);
  let program = await create(ctx); let result = await mutate(ctx, program, 'build'); program = result.body.program;
  result = await mutate(ctx, program, 'run', { input: 4 });
  ctx.repository.putArtifact = async () => { throw new Error('Storage unavailable'); };
  const failed = await ctx.service.workOnce({ workerId: 'storage-failure' });
  assert.equal(failed.status, 'failed'); assert.equal(failed.error.code, 'artifact_storage_failed'); assert.deepEqual(failed.artifacts, []);
  assert.equal(Object.keys((await ctx.repository.read()).data.artifacts).length, 0);
});

test('verified authored adapter captures its pinned image and denies changed runtime environments', async () => {
  const ctx = await setup();
  const image = `javascript@sha256:${'a'.repeat(64)}`;
  const adapter = { verified: true, id: 'isolated-test-fixture', nodeImage: image, execute: async ({ input }) => ({ value: input + 1, environment: { image, network: 'none', evidence_class: 'FIXTURE' }, logs: ['fixture execution'] }) };
  const service = new PurlService({ repository: ctx.repository, sandboxAdapter: adapter });
  const local = { ...ctx, service }; let program = await create(local, { language: 'javascript', source: 'function main(input) { return input + 1; }', tests: [{ input: 4, expected: 5 }] });
  let result = await mutate(local, program, 'build');
  assert.equal(result.body.build.status, 'passed', JSON.stringify(result.body)); program = result.body.program;
  result = await mutate(local, program, 'run', { input: 4 }); program = result.body.program;
  let job = await service.workOnce({ workerId: 'isolated-fixture' });
  assert.equal(job.status, 'succeeded'); assert.equal(job.runtime_environment.image, image); assert.equal(job.receipt.deterministic, false);
  assert.equal((await service.handle('GET', `/api/programs/${program.id}/replay`)).body.executions[0].valid, true);
  result = await mutate(local, program, 'run', { input: 4 });
  adapter.nodeImage = `javascript@sha256:${'b'.repeat(64)}`;
  job = await service.workOnce({ workerId: 'changed-image' });
  assert.equal(job.status, 'failed'); assert.equal(job.error.code, 'environment_mismatch');
});

test('delegation attenuates, ancestor revocation denies descendants, and mission rejects false evidence', async () => {
  const ctx = await setup(); let program = await create(ctx);
  const middle = (await ctx.service.handle('POST', '/api/session', { label: 'Delegate' })).body;
  const leaf = (await ctx.service.handle('POST', '/api/session', { label: 'Leaf' })).body;
  let result = await mutate(ctx, program, 'grants', { principal_id: middle.principal.id, rights: ['read', 'grant', 'run'] }); program = result.body.program;
  const rootGrant = result.body.grant.id;
  result = await ctx.service.handle('POST', `/api/programs/${program.id}/grants`, { expected_version: program.version, principal_id: leaf.principal.id, rights: ['edit'] }, { token: middle.token });
  assert.equal(result.status, 403);
  result = await ctx.service.handle('POST', `/api/programs/${program.id}/grants`, { expected_version: program.version, principal_id: leaf.principal.id, rights: ['read', 'run'] }, { token: middle.token });
  assert.equal(result.status, 201); program = result.body.program;
  assert.ok(program.grants.find((grant) => grant.principal_id === leaf.principal.id).active);
  result = await mutate(ctx, program, 'revoke', { grant_id: rootGrant }); program = result.body.program;
  assert.equal(program.grants.find((grant) => grant.principal_id === leaf.principal.id).active, false);
  assert.equal((await ctx.service.handle('POST', `/api/programs/${program.id}/run`, { expected_version: program.version, input: 1 }, { token: leaf.token })).status, 403);
  await ctx.service.seed(); const mission = (await ctx.service.handle('GET', '/api/programs/godseed-mission')).body.program;
  result = await mutate(ctx, mission, 'fork'); program = result.body.program;
  assert.equal((await mutate(ctx, program, 'mission', { node_id: 'reconstruction', status: 'PASS', evidence: ['made-up'] })).status, 409);
  assert.equal((await mutate(ctx, program, 'mission', { node_id: 'mission', status: 'PASS', evidence: ['made-up'] })).status, 422);
});

test('filesystem restart preserves pending jobs, idempotency, checkpoints and execution replay', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'purl-domain-durable-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');
  const repository = new FileRepository(path);
  const service = new PurlService({ repository });
  const session = (await service.handle('POST', '/api/session', { label: 'Durable owner' })).body;
  const ctx = { repository, service, token: session.token, principal: session.principal };
  let program = await create(ctx); let result = await mutate(ctx, program, 'build'); program = result.body.program;
  const body = { expected_version: program.version, summary: 'Survive restart', next: ['run'] };
  result = await service.handle('POST', `/api/programs/${program.id}/checkpoint`, body, { token: ctx.token, idempotencyKey: 'durable-checkpoint' }); program = result.body.program;
  result = await mutate(ctx, program, 'run', { input: 4 });
  const id = result.body.execution.id;
  const freshRepository = new FileRepository(path);
  const restarted = new PurlService({ repository: freshRepository });
  const retry = await restarted.handle('POST', `/api/programs/${program.id}/checkpoint`, body, { token: ctx.token, idempotencyKey: 'durable-checkpoint' });
  assert.equal(retry.status, 200); assert.equal(retry.body.checkpoint.summary, 'Survive restart');
  await freshRepository.transaction((data) => { const execution = data.executions[id]; execution.status = 'running'; execution.attempts = 1; execution.lease = { worker_id: 'terminated', claim_id: 'terminated-claim', expires_at: '2000-01-01T00:00:00.000Z' }; });
  const completed = await restarted.workOnce({ workerId: 'restarted-worker' });
  assert.equal(completed.status, 'succeeded'); assert.equal(completed.attempts, 2);
  const thirdSession = new PurlService({ repository: new FileRepository(path) });
  assert.equal((await thirdSession.handle('GET', `/api/executions/${id}`)).body.execution.value, 18);
  const replay = (await thirdSession.handle('GET', `/api/programs/${program.id}/replay`)).body;
  assert.equal(replay.valid, true); assert.equal(replay.executions[0].valid, true);
  assert.equal((await thirdSession.handle('GET', `/api/programs/${program.id}/continuity`)).body.checkpoint.summary, 'Survive restart');
});

test('two filesystem API instances serialize racing game moves', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'purl-domain-race-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');
  const service = new PurlService({ repository: new FileRepository(path) });
  const owner = (await service.handle('POST', '/api/session', { label: 'X' })).body;
  const ctx = { service, token: owner.token };
  const program = await create(ctx, { kind: 'game' });
  const otherService = new PurlService({ repository: new FileRepository(path) });
  const race = await Promise.all([service.handle('POST', `/api/programs/${program.id}/move`, { expected_version: program.version, cell: 0 }, { token: owner.token }), otherService.handle('POST', `/api/programs/${program.id}/move`, { expected_version: program.version, cell: 1 }, { token: owner.token })]);
  assert.deepEqual(race.map((result) => result.status).sort(), [200, 409]);
  assert.equal((await otherService.handle('GET', `/api/programs/${program.id}/replay`)).body.valid, true);
});
