import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { SupabaseRepository } from '../service/repository.js';

// Test-only JWT secret for the disposable local PostgREST service. No hosted
// service or configured user credentials are consulted by this check.
export const jwtSecret = 'purl-disposable-local-verification-secret-0001';
export function jwt(role) {
  const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded({ role, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${body}.${createHmac('sha256', jwtSecret).update(body).digest('base64url')}`;
}

if (process.argv[2]) {
  const url = process.argv[2];
  let synchronizeReads = false;
  let heldReads = 0;
  let releaseReads;
  let observedConflicts = 0;
  const readBarrier = new Promise(resolve => { releaseReads = resolve; });
  const observedFetch = async (requestUrl, init) => {
    const response = await fetch(requestUrl, init);
    // Hold both real revision-0 SQL responses until both writers have read.
    // The database/CAS responses are unchanged; this makes the race repeatable.
    if (synchronizeReads && requestUrl.endsWith('/purl_read_document') && heldReads < 2) {
      heldReads++;
      if (heldReads === 2) releaseReads();
      await readBarrier;
    }
    if (requestUrl.endsWith('/purl_compare_and_swap') && response.ok && (await response.clone().json()).committed === false) observedConflicts++;
    return response;
  };
  const options = { url, serviceRoleKey: jwt('service_role'), documentId: 'rest-verification', fetch: observedFetch };
  const first = new SupabaseRepository(options);
  const second = new SupabaseRepository(options);
  assert.equal((await first.read()).revision, 0);
  synchronizeReads = true;
  await Promise.all([
    first.transaction(data => { data.audit.push({ event: 'first' }); }),
    second.transaction(data => { data.audit.push({ event: 'second' }); }),
  ]);
  const snapshot = await new SupabaseRepository(options).read();
  assert.equal(snapshot.revision, 2);
  assert.ok(observedConflicts >= 1, 'concurrent writers did not exercise a real SQL CAS conflict');
  assert.deepEqual(snapshot.data.audit.map(item => item.event).sort(), ['first', 'second']);
  await assert.rejects(first.transaction(data => { data.audit.push('aborted'); throw new Error('abort'); }), /abort/);
  assert.equal((await first.read()).revision, 2);
  const denied = await fetch(`${url}/rest/v1/rpc/purl_read_document`, {
    method: 'POST', headers: { authorization: `Bearer ${jwt('anon')}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_document_id: options.documentId }),
  });
  assert.ok([401, 403, 404].includes(denied.status), `anonymous RPC returned ${denied.status}`);
  console.log(JSON.stringify({ verification: 'PASS', backend: 'real local PostgreSQL17.7 + PostgREST13.0.4', revision: snapshot.revision, observed_sql_cas_conflicts: observedConflicts, checks: ['HTTP adapter roundtrip', 'concurrent CAS retry', 'restart/read', 'mutator abort rollback', 'anonymous RPC denied'], storage: 'NOT_RUN: no Supabase Storage service in this disposable database harness' }));
}
