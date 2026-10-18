#!/bin/sh
set -eu
# No host port, production project, connection credential, or external mutation.
cd "$(dirname "$0")/.."
purl_schema_container="purl-schema-verify-$$"
purl_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
trap 'purl_docker rm -f "$purl_schema_container" >/dev/null 2>&1 || true' EXIT HUP INT TERM
purl_docker run --detach --name "$purl_schema_container" --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:17.7-bookworm@sha256:86e0b703649d7a792bd9243ee28afc9d8f7c6b2b5638077c9d6882d4d472bbfd >/dev/null
purl_attempt=0
until purl_docker exec "$purl_schema_container" pg_isready -U postgres >/dev/null 2>&1; do
  purl_attempt=$((purl_attempt + 1))
  [ "$purl_attempt" -lt 30 ] || { echo 'Local PostgreSQL did not become ready' >&2; exit 1; }
  sleep 1
done
purl_docker exec -i "$purl_schema_container" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects(bucket_id text, name text);
alter table storage.objects enable row level security;
SQL
for purl_migration in supabase/migrations/*.sql; do
  purl_docker exec -i "$purl_schema_container" psql -U postgres -v ON_ERROR_STOP=1 < "$purl_migration"
done
purl_docker exec -i "$purl_schema_container" psql -U postgres -v ON_ERROR_STOP=1 < deploy/verify-schema.sql
