#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
purl_launch_name="purl-launch-verify-$$"
purl_launch_db="$purl_launch_name-db"
purl_launch_rest="$purl_launch_name-rest"
purl_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"
}
purl_cleanup() {
  purl_docker rm -f "$purl_launch_rest" "$purl_launch_db" >/dev/null 2>&1 || true
  purl_docker network rm "$purl_launch_name" >/dev/null 2>&1 || true
}
trap purl_cleanup EXIT HUP INT TERM
purl_docker network create "$purl_launch_name" >/dev/null
purl_docker run --detach --name "$purl_launch_db" --network "$purl_launch_name" --network-alias database -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17.7-bookworm@sha256:86e0b703649d7a792bd9243ee28afc9d8f7c6b2b5638077c9d6882d4d472bbfd >/dev/null
purl_attempt=0
until purl_docker exec "$purl_launch_db" pg_isready -U postgres >/dev/null 2>&1; do
  purl_attempt=$((purl_attempt+1)); [ "$purl_attempt" -lt 30 ] || exit 1; sleep 1
done
purl_docker exec -i "$purl_launch_db" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login password 'disposable-local-test';
grant anon, authenticated, service_role to authenticator;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table storage.objects(bucket_id text,name text);
alter table storage.objects enable row level security;
SQL
for purl_migration in supabase/migrations/*.sql; do
  purl_docker exec -i "$purl_launch_db" psql -U postgres -v ON_ERROR_STOP=1 < "$purl_migration"
done
purl_docker exec -i "$purl_launch_db" psql -U postgres -v ON_ERROR_STOP=1 < deploy/verify-launch-store.sql
# A genuine database process restart verifies committed rows survive, using the same container volume.
purl_docker restart "$purl_launch_db" >/dev/null
purl_attempt=0
until purl_docker exec "$purl_launch_db" pg_isready -U postgres >/dev/null 2>&1; do
  purl_attempt=$((purl_attempt+1)); [ "$purl_attempt" -lt 30 ] || exit 1; sleep 1
done
purl_docker exec "$purl_launch_db" psql -U postgres -v ON_ERROR_STOP=1 -c "do \$\$ begin if public.purl_launch_read('service','ok')->'value' is distinct from 'true'::jsonb then raise exception 'restart lost data'; end if; end \$\$;"
purl_docker run --detach --name "$purl_launch_rest" --network "$purl_launch_name" -p 127.0.0.1::3000 \
  -e PGRST_DB_URI=postgres://authenticator:disposable-local-test@database:5432/postgres \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_DB_SCHEMAS=public \
  -e PGRST_JWT_SECRET=purl-disposable-local-verification-secret-0001 \
  postgrest/postgrest:v13.0.4@sha256:a312f4b2e48530a01fc26f5310d547d6c26d087858360e164522e415723a7732 >/dev/null
purl_launch_port="$(purl_docker port "$purl_launch_rest" 3000/tcp | sed 's/.*://')"
PURL_VERIFY_LAUNCH_PORT="$purl_launch_port" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { jwt } from './deploy/verify-rest.js';
import { SupabaseLaunchStore } from './service/launch/store.js';
const target=`http://127.0.0.1:${process.env.PURL_VERIFY_LAUNCH_PORT}`;
let ready=false;
for(let i=0;i<60;i++) {try{if((await fetch(target)).status<500){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
assert.ok(ready,'PostgREST ready');
const gateway=createServer(async(req,res)=>{
  try {
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const response=await fetch(`${target}${req.url.replace(/^\/rest\/v1/,'')}`,{method:req.method,headers:{authorization:req.headers.authorization||'','content-type':'application/json'},body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
    res.writeHead(response.status,{'content-type':'application/json'});res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(502);res.end();}
});
gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
const url=`http://127.0.0.1:${gateway.address().port}`;
try {
  const child=spawn(process.execPath,['--test','test/launch/store.test.js'],{stdio:'inherit',env:{...process.env,PURL_TEST_LAUNCH_URL:url,PURL_TEST_LAUNCH_KEY:jwt('service_role')}});
  const [code]=await once(child,'exit');assert.equal(code,0,'real SQL adapter contract tests');
  for(const role of ['anon','authenticated']) {
    for(const name of ['read','commit','erase']) {
      const response=await fetch(`${url}/rest/v1/rpc/purl_launch_${name}`,{method:'POST',headers:{authorization:`Bearer ${jwt(role)}`,'content-type':'application/json'},body:JSON.stringify(name==='read'?{p_scope:'service',p_key:'ok'}:name==='erase'?{p_scope:'service'}:{p_scope:'service',p_changes:[{key:'attack',expectedVersion:0,value:true}]})});
      assert.ok([401,403,404].includes(response.status),`${role} ${name} denied: ${response.status}`);
    }
    const response=await fetch(`${url}/rest/v1/purl_launch_records?select=*`,{headers:{authorization:`Bearer ${jwt(role)}`}});assert.ok([401,403,404].includes(response.status),`${role} table denied`);
  }
  console.log('PASS: real PostgreSQL17.7/PostgREST13.0.4 adapter, concurrent CAS/handle conflicts, role denial and database restart');
}finally{await new Promise(r=>gateway.close(r));}
JS
