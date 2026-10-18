import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { PurlService } from '../../service/domain.js';
import { MemoryRepository, SupabaseRepository, emptyData } from '../../service/repository.js';

async function queuedSnapshot() {
  const repository = new MemoryRepository();
  const service = new PurlService({ repository });
  const session = await service.handle('POST', '/api/session', { label: 'Worker poll owner' });
  const context = { token: session.body.token };
  let result = await service.handle('POST', '/api/programs', { title: 'Worker poll', source: 'input number | math.add 1' }, context);
  let program = result.body.program;
  result = await service.handle('POST', `/api/programs/${program.id}/build`, { expected_version: program.version }, context);
  program = result.body.program;
  result = await service.handle('POST', `/api/programs/${program.id}/run`, { expected_version: program.version, input: 4 }, context);
  assert.equal(result.status, 202);
  return { snapshot: await repository.read(), executionId: result.body.execution.id };
}

async function restRepository(t, initial, { afterProjection, afterRead, projectionBody, failProjection = false } = {}) {
  let snapshot = structuredClone(initial);
  const documentId = 'worker & isolated document';
  const calls = { projections: 0, reads: 0, swaps: 0, artifacts: 0 };
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer worker-server-secret');
    const url = new URL(request.url, 'http://test.local');
    const reply = (status, body) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)); };
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (url.pathname === '/rest/v1/purl_entities') {
      calls.projections++;
      assert.equal(request.method, 'GET');
      assert.equal(url.searchParams.get('document_id'), `eq.${documentId}`);
      assert.equal(url.searchParams.get('kind'), 'eq.execution');
      assert.equal(url.searchParams.get('status'), 'in.(queued,running)');
      assert.equal(url.searchParams.get('select'), 'entity_id');
      assert.equal(url.searchParams.get('limit'), '1');
      if (failProjection) return reply(503, { message: 'projection unavailable' });
      const rows = Object.entries(snapshot.data.executions).filter(([, execution]) => ['queued', 'running'].includes(execution.status)).slice(0, 1).map(([entity_id]) => ({ entity_id }));
      afterProjection?.(snapshot);
      return reply(200, projectionBody === undefined ? rows : projectionBody);
    }
    if (url.pathname === '/rest/v1/rpc/purl_read_document') {
      calls.reads++;
      assert.equal(JSON.parse(Buffer.concat(chunks)).p_document_id, documentId);
      const observed = structuredClone(snapshot);
      afterRead?.(snapshot, calls.reads);
      return reply(200, observed);
    }
    if (url.pathname === '/rest/v1/rpc/purl_compare_and_swap') {
      calls.swaps++;
      const body = JSON.parse(Buffer.concat(chunks));
      assert.equal(body.p_document_id, documentId);
      if (body.p_expected_revision !== snapshot.revision) return reply(200, { committed: false });
      snapshot = { revision: snapshot.revision + 1, data: body.p_data };
      return reply(200, { committed: true });
    }
    if (url.pathname.startsWith('/storage/v1/object/purl-artifacts/')) { calls.artifacts++; return reply(200, {}); }
    return reply(404, {});
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const repository = new SupabaseRepository({ url: `http://127.0.0.1:${server.address().port}`, serviceRoleKey: 'worker-server-secret', documentId });
  return { repository, calls, state: () => structuredClone(snapshot) };
}

test('idle Supabase worker polls one projected ID without reading or rewriting the authoritative document', async t => {
  const snapshot = { revision: 0, data: emptyData() };
  snapshot.data.programs.large = { source: 'x'.repeat(300000), status: 'queued' };
  const rest = await restRepository(t, snapshot);
  assert.equal(await new PurlService({ repository: rest.repository }).workOnce({ workerId: 'idle-hosted' }), null);
  assert.deepEqual(rest.calls, { projections: 1, reads: 0, swaps: 0, artifacts: 0 });
  assert.deepEqual(rest.state(), snapshot);
});
for (const status of ['queued', 'running']) {
  test(`projected ${status} candidate is claimed and executed through the authoritative CAS transaction`, async t => {
    const { snapshot, executionId } = await queuedSnapshot();
    if (status === 'running') Object.assign(snapshot.data.executions[executionId], { status, attempts: 1, lease: { worker_id: 'expired-worker', claim_id: 'expired-claim', expires_at: '2000-01-01T00:00:00.000Z' } });
    const rest = await restRepository(t, snapshot);
    const job = await new PurlService({ repository: rest.repository }).workOnce({ workerId: 'hosted-claim' });
    assert.equal(job.status, 'succeeded');
    assert.equal(job.value, 5);
    assert.equal(job.attempts, status === 'running' ? 2 : 1);
    assert.equal(rest.calls.projections, 1);
    assert.equal(rest.calls.swaps, 2);
    assert.equal(rest.calls.reads, 3);
    assert.equal(rest.state().data.executions[executionId].status, 'succeeded');
  });
}
test('a projected running job with a live lease is never reclaimed', async t => {
  const { snapshot, executionId } = await queuedSnapshot();
  Object.assign(snapshot.data.executions[executionId], { status: 'running', attempts: 1, lease: { worker_id: 'live-worker', claim_id: 'live-claim', expires_at: new Date(Date.now() + 60000).toISOString() } });
  const rest = await restRepository(t, snapshot);
  assert.equal(await new PurlService({ repository: rest.repository }).workOnce({ workerId: 'other-worker' }), null);
  assert.equal(rest.calls.projections, 1);
  assert.equal(rest.calls.reads, 1);
  assert.deepEqual(rest.state(), snapshot);
  assert.equal(rest.calls.swaps, 0);
  assert.equal(rest.calls.artifacts, 0);
});
test('a candidate removed after the projection is rechecked atomically and produces no execution', async t => {
  const { snapshot, executionId } = await queuedSnapshot();
  const rest = await restRepository(t, snapshot, { afterRead: (state, read) => { if (read === 1) { delete state.data.executions[executionId]; state.revision++; } } });
  assert.equal(await new PurlService({ repository: rest.repository }).workOnce({ workerId: 'racing-worker' }), null);
  assert.equal(rest.calls.projections, 1);
  assert.equal(rest.calls.reads, 2);
  assert.equal(rest.calls.swaps, 1);
  assert.deepEqual(rest.state().data.executions, {});
  assert.equal(rest.calls.artifacts, 0);
});
test('authority revoked after projection still denies the authoritative claim', async t => {
  const { snapshot, executionId } = await queuedSnapshot();
  const rest = await restRepository(t, snapshot, { afterProjection: state => { state.data.principals[state.data.executions[executionId].requested_by].revoked_at = new Date().toISOString(); state.revision++; } });
  const job = await new PurlService({ repository: rest.repository }).workOnce({ workerId: 'revoked-after-query' });
  assert.equal(job.status, 'denied');
  assert.equal(job.error.code, 'authority_revoked');
  assert.equal(rest.calls.projections, 1);
  assert.equal(rest.calls.reads, 2);
  assert.equal(rest.calls.artifacts, 0);
});
for (const projectionBody of [{ entity_id: 'not-an-array' }, null, [{ entity_id: 42 }]]) {
  test(`malformed pending query response fails without loading the full document: ${JSON.stringify(projectionBody)}`, async t => {
    const rest = await restRepository(t, { revision: 0, data: emptyData() }, { projectionBody });
    await assert.rejects(new PurlService({ repository: rest.repository }).workOnce({ workerId: 'bad-projection' }), /pending execution query/i);
    assert.equal(rest.calls.reads, 0);
    assert.equal(rest.calls.swaps, 0);
  });
}
test('pending query errors fail without falling back to repeated full-document downloads', async t => {
  const rest = await restRepository(t, { revision: 0, data: emptyData() }, { failProjection: true });
  await assert.rejects(new PurlService({ repository: rest.repository }).workOnce({ workerId: 'query-failure' }), /503/);
  assert.equal(rest.calls.reads, 0);
  assert.equal(rest.calls.swaps, 0);
});
