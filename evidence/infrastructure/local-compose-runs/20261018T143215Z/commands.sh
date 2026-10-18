#!/bin/bash
set -euo pipefail
set -x
cd /workspace/purl
purl_compose_run=evidence/infrastructure/local-compose-runs/20261018T143215Z
export PURL_DEV_PORT=18080
purl_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
purl_compose() {
  purl_docker compose -p purl-dev-verify -f compose.dev.yaml "$@"
}
trap 'purl_compose down' EXIT
node -e 'console.log(JSON.stringify({event:"compose_verification_start",at:new Date().toISOString(),project:"purl-dev-verify",port:18080}))'
purl_docker image inspect purl:local --format '{{.Id}}'
purl_docker volume inspect purl-dev-verify_purl-development --format '{{.Name}} {{.CreatedAt}}'
purl_compose up -d --no-build
purl_compose ps --format json > "$purl_compose_run/compose-ps.jsonl"
cat "$purl_compose_run/compose-ps.jsonl"
purl_api_id="$(purl_compose ps -q api)"
purl_worker_id="$(purl_compose ps -q worker)"
test -n "$purl_api_id"
test -n "$purl_worker_id"
test "$purl_api_id" != "$purl_worker_id"
purl_docker inspect --format '{"id":{{json .Id}},"name":{{json .Name}},"hostname":{{json .Config.Hostname}},"user":{{json .Config.User}},"path":{{json .Path}},"args":{{json .Args}},"image":{{json .Image}},"read_only":{{json .HostConfig.ReadonlyRootfs}},"network_mode":{{json .HostConfig.NetworkMode}}}' "$purl_api_id" "$purl_worker_id" > "$purl_compose_run/containers.jsonl"
cat "$purl_compose_run/containers.jsonl"
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const directory = 'evidence/infrastructure/local-compose-runs/20261018T143215Z';
const base = 'http://127.0.0.1:18080';
let health;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(2000) });
    if (response.ok) { health = await response.json(); break; }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 250));
}
assert.equal(health?.status, 'ok');
assert.equal(health.persistence, 'development-file');
await writeFile(`${directory}/health-response.json`, JSON.stringify(health, null, 2) + '\n');
const response = await fetch(`${base}/api/executions/execution_fd1a209d49c8585511288e11`);
assert.equal(response.status, 200);
const body = await response.json();
await writeFile(`${directory}/execution-response.json`, JSON.stringify(body, null, 2) + '\n');
assert.equal(body.execution.id, 'execution_fd1a209d49c8585511288e11');
assert.equal(body.execution.status, 'succeeded');
assert.equal(body.execution.value, 18);
console.log(JSON.stringify({ event: 'retained_execution', at: new Date().toISOString(), status: 'PASS', execution_id: body.execution.id, execution_status: body.execution.status, value: body.execution.value, health }));
JS
purl_docker exec "$purl_api_id" node deploy/healthcheck.js
purl_docker exec "$purl_worker_id" node deploy/healthcheck.js
purl_docker exec "$purl_api_id" node -e 'const assert=require("node:assert/strict");const o={role:process.env.PURL_ROLE,hostname:require("node:os").hostname(),uid:process.getuid(),sandbox_enabled:process.env.PURL_SANDBOX_ENABLED,sandbox_verified:process.env.PURL_SANDBOX_VERIFIED};assert.equal(o.role,"api");assert.equal(o.hostname,"purl-api-development");assert.equal(o.uid,1000);assert.equal(o.sandbox_enabled,"0");assert.equal(o.sandbox_verified,"0");console.log(JSON.stringify(o))' > "$purl_compose_run/api-runtime.json"
purl_docker exec "$purl_worker_id" node -e 'const assert=require("node:assert/strict");const o={role:process.env.PURL_ROLE,hostname:require("node:os").hostname(),uid:process.getuid(),sandbox_enabled:process.env.PURL_SANDBOX_ENABLED,sandbox_verified:process.env.PURL_SANDBOX_VERIFIED,heartbeat:JSON.parse(require("node:fs").readFileSync("/tmp/purl-worker-heartbeat.json","utf8"))};assert.equal(o.role,"worker");assert.equal(o.hostname,"purl-worker-development");assert.equal(o.uid,1000);assert.equal(o.sandbox_enabled,"0");assert.equal(o.sandbox_verified,"0");assert.equal(o.heartbeat.status,"running");console.log(JSON.stringify(o))' > "$purl_compose_run/worker-runtime.json"
cat "$purl_compose_run/api-runtime.json" "$purl_compose_run/worker-runtime.json"
purl_compose down
trap - EXIT
purl_docker volume inspect purl-dev-verify_purl-development --format '{{.Name}} {{.CreatedAt}}'
node -e 'console.log(JSON.stringify({event:"compose_verification_end",at:new Date().toISOString(),status:"PASS",cleanup:"docker compose down without -v; named volume retained"}))'
