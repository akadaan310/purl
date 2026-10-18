#!/bin/sh
set -eu
purl_pid_name="purl-pid-reuse-$$"
purl_pid_dir="$(mktemp -d /tmp/purl-pid-reuse-XXXXXX)"
purl_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"
}
purl_cleanup() {
  purl_docker rm -f "$purl_pid_name" >/dev/null 2>&1 || true
  rm -rf "$purl_pid_dir"
}
trap purl_cleanup EXIT HUP INT TERM
cat > "$purl_pid_dir/smoke.mjs" <<'JS'
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { FileRepository } from '/app/repository.mjs';
const repository = new FileRepository('/data/state.json', { lockTimeoutMs: 500 });
assert.equal(process.pid, 1);
if (!existsSync('/data/phase.json')) {
  await repository.transaction(data => { data.audit.push('committed before restart'); });
  await repository.acquireLock();
  const [name] = await readdir(repository.lockPath);
  const owner = JSON.parse(await readFile(`${repository.lockPath}/${name}`, 'utf8'));
  assert.equal(owner.pid, 1); assert.match(owner.startTime, /^\d+$/);
  await writeFile('/data/phase.json', JSON.stringify(owner));
  setInterval(() => {}, 1000);
} else {
  const old = JSON.parse(await readFile('/data/phase.json', 'utf8'));
  const processStat = await readFile('/proc/1/stat', 'utf8');
  const current = processStat.slice(processStat.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
  assert.notEqual(old.startTime, current);
  await repository.transaction(data => { data.audit.push('recovered after PID1 restart'); });
  const snapshot = await repository.read();
  assert.equal(snapshot.revision, 2);
  assert.deepEqual(snapshot.data.audit, ['committed before restart', 'recovered after PID1 restart']);
  await writeFile('/data/done.json', JSON.stringify({ verification:'PASS', execution_class:'DISPOSABLE_LOCAL_CONTAINER', uid:process.getuid(), pid:process.pid, host:old.host, before_start_time:old.startTime, after_start_time:current, revision:snapshot.revision, audit:snapshot.data.audit }));
}
JS
chown -R 1000:1000 "$purl_pid_dir"
purl_docker run -d --name "$purl_pid_name" --hostname purl-pid-reuse --network none --read-only --user 1000 \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --mount "type=bind,src=$purl_pid_dir,dst=/data" \
  --mount type=bind,src=/workspace/purl/service/repository.js,dst=/app/repository.mjs,readonly \
  node:22.14.0-bookworm-slim@sha256:1c18d9ab3af4585870b92e4dbc5cac5a0dc77dd13df1a5905cea89fc720eb05b node /data/smoke.mjs >/dev/null
purl_attempt=0
until [ -f "$purl_pid_dir/phase.json" ]; do
  purl_attempt=$((purl_attempt + 1))
  [ "$purl_attempt" -lt 50 ] || { purl_docker logs "$purl_pid_name"; exit 1; }
  sleep 0.1
done
purl_docker kill --signal KILL "$purl_pid_name" >/dev/null
purl_docker start "$purl_pid_name" >/dev/null
purl_attempt=0
until [ -f "$purl_pid_dir/done.json" ]; do
  purl_attempt=$((purl_attempt + 1))
  [ "$purl_attempt" -lt 50 ] || { purl_docker logs "$purl_pid_name"; exit 1; }
  sleep 0.1
done
cat "$purl_pid_dir/done.json"
