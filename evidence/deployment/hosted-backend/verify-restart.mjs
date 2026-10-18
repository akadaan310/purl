#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonical, client, hash, output, recorder, transport, without } from './common.mjs';

const source = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'));
const checks = [];
const check = recorder(checks);
const http = client(join(output, 'restart-raw-http.jsonl'));
const report = { schema: 'purl.hosted-backend-restart/1', status: 'RUNNING', started_at: new Date().toISOString(), execution_class: 'LIVE_HOSTED_SUPABASE_AFTER_SEPARATE_API_WORKER_RESTART', transport, railway_deployed: false, prior_run_completed_at: source.completed_at, checks };
try {
  await http.initialize();
  check('prior hosted dogfood completed successfully', source.status === 'PASS');
  const health = await http.request('GET', '/healthz');
  check('restarted API still uses hosted Supabase persistence', health.status === 200 && health.body.persistence === 'supabase');
  const metadata = await http.request('GET', '/.well-known/purl');
  check('restarted authored execution remains disabled', metadata.body.capabilities.arbitrary_code_execution === false);
  for (const [label, target] of Object.entries(source.targets)) {
    const responses = {};
    for (const [kind, path] of Object.entries(target.paths)) {
      const response = await http.request('GET', path);
      check(`${label}: ${kind} survives API/worker restart unchanged`, response.status === 200 && hash(response.body) === target.fingerprints[kind]);
      responses[kind] = response.body;
    }
    check(`${label}: checkpoint continuity survives restart`, responses.continuity.checkpoint.id === target.checkpoint_id);
    check(`${label}: immutable release still pins completed build`, responses.release.release.build_id === responses.execution.execution.build_id);
    const artifact = responses.artifact.artifact;
    const receipt = responses.execution.execution.receipt;
    check(`${label}: durable receipt and Storage references retain integrity`, hash(without(artifact, ['content_id', 'storage'])) === artifact.content_id && hash(without(receipt)) === receipt.content_id && receipt.artifact_content_id === artifact.content_id && canonical(artifact.storage) === canonical(target.storage));
    const replay = await http.request('GET', `/api/programs/${target.program_id}/replay`);
    check(`${label}: deterministic execution replay passes after restart`, replay.status === 200 && replay.body.valid === true && replay.body.executions.some((execution) => execution.execution_id === target.execution_id && execution.valid === true));
  }
  report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.error = { message: error.message, stack: error.stack }; }
finally {
  report.completed_at = new Date().toISOString();
  report.summary = { checks: checks.length, passed: checks.filter((item) => item.status === 'PASS').length, failed: checks.filter((item) => item.status === 'FAIL').length };
  await writeFile(join(output, 'restart-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, ...report.summary, report: 'evidence/deployment/hosted-backend/restart-report.json', error: report.error?.message ?? null }));
  if (report.status !== 'PASS') process.exitCode = 1;
}
