#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
purl_smoke_name="purl-image-verify-$$"
purl_smoke_api="$purl_smoke_name-api"
purl_smoke_worker="$purl_smoke_name-worker"
purl_smoke_volume="$purl_smoke_name-data"
purl_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
purl_cleanup() {
  purl_docker rm -f "$purl_smoke_api" "$purl_smoke_worker" >/dev/null 2>&1 || true
  purl_docker volume rm "$purl_smoke_volume" >/dev/null 2>&1 || true
}
trap purl_cleanup EXIT HUP INT TERM
purl_docker volume create "$purl_smoke_volume" >/dev/null
purl_docker run --rm --network none --user 0 -v "$purl_smoke_volume:/data" purl:local \
  node -e 'require("fs").chownSync("/data",1000,1000)'
for purl_smoke_role in api worker; do
  purl_docker run --detach --name "$purl_smoke_name-$purl_smoke_role" \
    --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true \
    --tmpfs /tmp:rw,noexec,nosuid,size=64m,uid=1000,gid=1000 \
    -v "$purl_smoke_volume:/data" \
    -e NODE_ENV=development -e PURL_PERSISTENCE=file -e PURL_DATA_FILE=/data/state.json \
    -e PURL_ROLE="$purl_smoke_role" -e PURL_WORKER_POLL_MS=50 \
    purl:local node "service/$(if [ "$purl_smoke_role" = api ]; then echo main; else echo worker; fi).js" >/dev/null
done
purl_attempt=0
until purl_docker exec "$purl_smoke_api" node deploy/healthcheck.js; do
  purl_attempt=$((purl_attempt + 1))
  [ "$purl_attempt" -lt 30 ] || { echo 'API image did not become healthy' >&2; exit 1; }
  sleep 1
done
purl_docker exec "$purl_smoke_worker" node deploy/healthcheck.js
[ "$(purl_docker exec "$purl_smoke_api" id -u)" = 1000 ]
purl_docker exec -i "$purl_smoke_api" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:3000';
let token;
async function request(path, body) {
  const response = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  assert.ok(response.ok, `${path}: ${JSON.stringify(result)}`);
  return result;
}
token = (await request('/api/session', { label: 'Image smoke', kind: 'agent' })).token;
let { program } = await request('/api/programs', { title: 'Image arithmetic smoke', language: 'purl', source: 'input number | math.add 2 | math.multiply 3', visibility: 'public', tests: [{ input: 4, expected: 18 }] });
({ program } = await request(`/api/programs/${program.id}/build`, { expected_version: program.version }));
const { execution } = await request(`/api/programs/${program.id}/run`, { expected_version: program.version, input: 4 });
let observed;
for (let i = 0; i < 100; i++) {
  ({ execution: observed } = await request(`/api/executions/${execution.id}`));
  if (observed.status === 'succeeded') break;
  await new Promise(resolve => setTimeout(resolve, 50));
}
assert.equal(observed.status, 'succeeded');
assert.equal(observed.value, 18);
await writeFile('/data/smoke-reference.json', JSON.stringify({ execution_id: execution.id }));
console.log(JSON.stringify({ stage: 'PASS', checks: ['non-root image', 'read-only API + distinct worker', 'build/queue/execute/result'], execution_class: 'LOCAL_CONTAINER_DEVELOPMENT_FILE', value: observed.value }));
JS
purl_docker restart --time 45 "$purl_smoke_worker" "$purl_smoke_api" >/dev/null
purl_attempt=0
until purl_docker exec "$purl_smoke_api" node deploy/healthcheck.js; do
  purl_attempt=$((purl_attempt + 1))
  [ "$purl_attempt" -lt 30 ] || { echo 'Restarted API did not become healthy' >&2; exit 1; }
  sleep 1
done
purl_docker exec "$purl_smoke_worker" node deploy/healthcheck.js
purl_docker exec -i "$purl_smoke_api" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { execution_id } = JSON.parse(await readFile('/data/smoke-reference.json', 'utf8'));
const response = await fetch(`http://127.0.0.1:3000/api/executions/${execution_id}`);
assert.equal(response.status, 200);
const { execution } = await response.json();
assert.equal(execution.status, 'succeeded'); assert.equal(execution.value, 18);
console.log(JSON.stringify({ verification: 'PASS', checks: ['API + worker restart', 'persisted result recovery', 'fresh role healthchecks'], execution_class: 'LOCAL_CONTAINER_DEVELOPMENT_FILE', hosted_supabase: 'NOT_RUN' }));
JS
