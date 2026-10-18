#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
purl_rest_name="purl-rest-verify-$$"
purl_rest_database="$purl_rest_name-db"
purl_rest_gateway="$purl_rest_name-gateway"
purl_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
purl_cleanup() {
  purl_docker rm -f "$purl_rest_gateway" "$purl_rest_database" >/dev/null 2>&1 || true
  purl_docker network rm "$purl_rest_name" >/dev/null 2>&1 || true
}
trap purl_cleanup EXIT HUP INT TERM
# Docker's internal bridge suppresses published ports. A dedicated normal bridge
# exposes only the disposable gateway on the host's loopback address.
purl_docker network create "$purl_rest_name" >/dev/null
purl_docker run --detach --name "$purl_rest_database" --network "$purl_rest_name" --network-alias database \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:17.7-bookworm@sha256:86e0b703649d7a792bd9243ee28afc9d8f7c6b2b5638077c9d6882d4d472bbfd >/dev/null
purl_attempt=0
until purl_docker exec "$purl_rest_database" pg_isready -U postgres >/dev/null 2>&1; do
  purl_attempt=$((purl_attempt + 1))
  [ "$purl_attempt" -lt 30 ] || { echo 'Local PostgreSQL did not become ready' >&2; exit 1; }
  sleep 1
done
purl_docker exec -i "$purl_rest_database" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login password 'disposable-local-test';
grant anon, authenticated, service_role to authenticator;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects(bucket_id text, name text);
alter table storage.objects enable row level security;
SQL
for purl_migration in supabase/migrations/*.sql; do
  purl_docker exec -i "$purl_rest_database" psql -U postgres -v ON_ERROR_STOP=1 < "$purl_migration"
done
purl_jwt_secret="$(node --input-type=module -e "import { jwtSecret } from './deploy/verify-rest.js'; process.stdout.write(jwtSecret)")"
purl_docker run --detach --name "$purl_rest_gateway" --network "$purl_rest_name" \
  -p 127.0.0.1::3000 \
  -e PGRST_DB_URI=postgres://authenticator:disposable-local-test@database:5432/postgres \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_DB_SCHEMAS=public -e PGRST_SERVER_PROXY_URI=http://localhost \
  -e "PGRST_JWT_SECRET=$purl_jwt_secret" \
  postgrest/postgrest:v13.0.4@sha256:a312f4b2e48530a01fc26f5310d547d6c26d087858360e164522e415723a7732 >/dev/null
purl_rest_port="$(purl_docker port "$purl_rest_gateway" 3000/tcp | sed 's/.*://')"
# Supabase routes the Data API beneath /rest/v1. A tiny local forwarding gateway
# supplies the same prefix without substituting any database or CAS responses.
PURL_VERIFY_POSTGREST_PORT="$purl_rest_port" node --input-type=module <<'JS'
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
const target = `http://127.0.0.1:${process.env.PURL_VERIFY_POSTGREST_PORT}`;
let ready = false;
for (let i = 0; i < 60; i++) {
  try { const response = await fetch(target); if (response.status < 500) { ready = true; break; } } catch {}
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (!ready) throw new Error('PostgREST did not become ready');
const gateway = createServer(async (request, response) => {
  try {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const upstream = await fetch(`${target}${request.url.replace(/^\/rest\/v1/, '')}`, {
      method: request.method,
      headers: { authorization: request.headers.authorization || '', 'content-type': 'application/json' },
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.concat(chunks),
    });
    response.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json' });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch { response.writeHead(502); response.end(); }
});
gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
const child = spawn(process.execPath, ['deploy/verify-rest.js', `http://127.0.0.1:${gateway.address().port}`], { stdio: 'inherit' });
const [code] = await once(child, 'exit');
await new Promise(resolve => gateway.close(resolve));
process.exitCode = code;
JS
