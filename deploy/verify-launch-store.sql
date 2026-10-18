\set ON_ERROR_STOP on
-- Runs only against the disposable local PostgreSQL created by the harness.
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',message; end if; end $$;
create function pg_temp.rejected(command text, expected text) returns void language plpgsql as $$
begin
  begin execute command; exception when others then
    if sqlerrm = expected then return; end if;
    raise exception 'Expected %, received %',expected,sqlerrm;
  end;
  raise exception 'Expected rejection: %',expected;
end $$;
select pg_temp.assert(public.purl_launch_read('pure','none') is null,'absent read');
select pg_temp.assert(not exists(select from public.purl_launch_scopes where scope='pure'),'read is pure');
select public.purl_launch_commit('sql-a','[{"key":"one","expectedVersion":0,"value":{"status":"pending"}}]', 'retry','payload','pearl');
select pg_temp.assert((public.purl_launch_commit('sql-a','[{"key":"one","expectedVersion":0,"value":{"status":"pending"}}]', 'retry','payload','pearl')->>'duplicate')::boolean,'idempotency retry');
select pg_temp.rejected($q$select public.purl_launch_commit('sql-a','[{"key":"one","expectedVersion":0,"value":{}}]','retry','payload','pearl')$q$,'idempotency_conflict');
select pg_temp.rejected($q$select public.purl_launch_commit('sql-a','[{"key":"two","expectedVersion":0,"value":{}},{"key":"one","expectedVersion":0,"value":{}}]')$q$,'version_conflict');
select pg_temp.assert(public.purl_launch_read('sql-a','two') is null,'multi-row rollback');
select pg_temp.rejected($q$select public.purl_launch_commit('sql-b','[{"key":"two","expectedVersion":0,"value":{}}]',null,null,'pearl')$q$,'handle_conflict');
select pg_temp.assert(public.purl_launch_read('sql-b','two') is null,'handle conflict rollback');
select pg_temp.assert(not exists(select from public.purl_launch_scopes where scope='sql-b'),'scope creation rollback');
select public.purl_launch_commit('sql-a','[{"key":"one","expectedVersion":1,"value":null}]',null,null,'renamed');
select pg_temp.assert(public.purl_launch_read('sql-a','one') = '{"key":"one","version":2,"value":null}'::jsonb,'tombstone version');
select pg_temp.assert(public.purl_launch_resolve_handle('pearl') = '{"subject":"sql-a","handle":"renamed"}'::jsonb,'retained alias');
select pg_temp.assert(public.purl_launch_list('sql-a','',200) = '[]'::jsonb,'no active tombstones');
select pg_temp.rejected($q$select public.purl_launch_commit('bad','[{"key":"x","expectedVersion":0,"value":{"__proto__":{}}}]')$q$,'invalid_input');
select pg_temp.rejected($q$select public.purl_launch_list('sql-a','',201)$q$,'invalid_input');
select pg_temp.rejected($q$select public.purl_launch_commit('sql-a',jsonb_build_array(jsonb_build_object('key','large','expectedVersion',0,'value',repeat('x',262144))))$q$,'row_limit');
select pg_temp.rejected($q$select public.purl_launch_commit('bad','[{"key":"huge-number","expectedVersion":0,"value":1e1000}]')$q$,'invalid_input');
-- Test server-side bounds directly, bypassing the JS input checks entirely.
select public.purl_launch_commit('quota',(
  select jsonb_agg(jsonb_build_object('key','q'||i,'expectedVersion',0,'value',repeat('x',262142))) from generate_series(0,31) i
))->'revision' as quota_revision;
select public.purl_launch_commit('quota',(
  select jsonb_agg(jsonb_build_object('key','q'||i,'expectedVersion',0,'value',repeat('x',262142))) from generate_series(32,39) i
))->'revision' as quota_revision;
select pg_temp.rejected($q$select public.purl_launch_commit('quota','[{"key":"overflow","expectedVersion":0,"value":1}]')$q$,'tenant_quota');
select pg_temp.assert(public.purl_launch_read('quota','overflow') is null,'quota rollback');
select public.purl_launch_commit('quota','[{"key":"q0","expectedVersion":1,"value":null},{"key":"overflow","expectedVersion":0,"value":1}]')->'revision' as freed_quota_revision;
select pg_temp.rejected($q$select public.purl_launch_commit('bad',(select jsonb_agg(jsonb_build_object('key','q'||i,'expectedVersion',0,'value',true)) from generate_series(0,32) i))$q$,'invalid_input');
select pg_temp.rejected($q$select public.purl_launch_commit('bad','[{"key":"same","expectedVersion":0,"value":1},{"key":"same","expectedVersion":0,"value":2}]')$q$,'invalid_input');
select pg_temp.rejected($q$select public.purl_launch_commit('bad','[{"key":"x","expectedVersion":-1,"value":1}]')$q$,'invalid_input');
select public.purl_launch_commit('scan-a','[{"key":"job:%_one","expectedVersion":0,"value":{"status":"pending"}},{"key":"job:other","expectedVersion":0,"value":{"status":"done"}}]');
select public.purl_launch_commit('scan-b','[{"key":"job:%_two","expectedVersion":0,"value":{"status":"pending"}}]');
select pg_temp.assert(jsonb_array_length(public.purl_launch_list('scan-a','job:%_',200))=1,'prefix metacharacters literal');
select pg_temp.assert(jsonb_array_length(public.purl_launch_scan('job:%_',array['pending'],200))=2,'cross-scope status scan');
select pg_temp.assert(jsonb_array_length(public.purl_launch_scan('job:%_',array['done'],200))=0,'status filter');
begin;
select public.purl_launch_commit('rollback','[{"key":"aborted","expectedVersion":0,"value":true}]');
rollback;
select pg_temp.assert(public.purl_launch_read('rollback','aborted') is null,'transaction rollback');
set enable_seqscan=off;
explain (costs off) select key from public.purl_launch_records where scope='scan-a' and value<>'null'::jsonb and key like 'job:%';
explain (costs off) select key from public.purl_launch_records where status=any(array['pending']) and value<>'null'::jsonb and key like 'job:%';
reset enable_seqscan;
-- Large metadata fixtures are built locally in SQL to verify the authority
-- without thousands of HTTP round trips. Counters match the fixture rows.
select public.purl_launch_commit('meta-records','[{"key":"t0","expectedVersion":0,"value":null}]');
insert into public.purl_launch_records(scope,key,version,value,active_bytes)
select 'meta-records','t'||i,1,'null'::jsonb,0 from generate_series(1,4095) i;
update public.purl_launch_scopes set record_count=4096 where scope='meta-records';
select pg_temp.rejected($q$select public.purl_launch_commit('meta-records','[{"key":"extra","expectedVersion":0,"value":null}]')$q$,'metadata_quota');
select pg_temp.assert(public.purl_launch_read('meta-records','extra') is null,'tombstone record cap rollback');
select public.purl_launch_commit('meta-records','[{"key":"t0","expectedVersion":1,"value":null}]');
select public.purl_launch_commit('meta-retries','[{"key":"counter","expectedVersion":0,"value":0}]','real','payload');
insert into public.purl_launch_idempotency(scope,key,payload_hash,fingerprint,result,metadata_bytes)
select 'meta-retries','fixture'||i,'payload',repeat('a',64),'{}'::jsonb,200 from generate_series(1,1023) i;
update public.purl_launch_scopes set idempotency_count=1024,retry_bytes=(select sum(metadata_bytes) from public.purl_launch_idempotency where scope='meta-retries') where scope='meta-retries';
select pg_temp.rejected($q$select public.purl_launch_commit('meta-retries','[{"key":"counter","expectedVersion":1,"value":1}]','overflow','payload')$q$,'metadata_quota');
select pg_temp.assert((public.purl_launch_read('meta-retries','counter')->>'version')::integer=1,'idempotency cap rollback');
select pg_temp.assert((public.purl_launch_commit('meta-retries','[{"key":"counter","expectedVersion":0,"value":0}]','real','payload')->>'duplicate')::boolean,'replay at capacity');
select public.purl_launch_commit('meta-handles','[{"key":"counter","expectedVersion":0,"value":0}]',null,null,'alias-limit-0');
insert into public.purl_launch_handles(name,scope) select 'alias-limit-'||i,'meta-handles' from generate_series(1,1023) i;
update public.purl_launch_scopes set handle_count=1024 where scope='meta-handles';
select pg_temp.rejected($q$select public.purl_launch_commit('meta-handles','[{"key":"counter","expectedVersion":1,"value":1}]',null,null,'alias-limit-overflow')$q$,'metadata_quota');
select pg_temp.assert(public.purl_launch_resolve_handle('alias-limit-overflow') is null,'alias cap rollback');
select public.purl_launch_commit('meta-handles','[{"key":"counter","expectedVersion":1,"value":1}]',null,null,'alias-limit-0');
select pg_temp.assert(not exists(select from pg_proc where pronamespace='public'::regnamespace and proname like 'purl_launch_%' and prosecdef),'all functions security invoker');
select pg_temp.assert(not exists(select from pg_class where relnamespace='public'::regnamespace and relname like 'purl_launch_%' and relkind='r' and not relrowsecurity),'RLS enabled');
do $$ declare role_name text; fn record; tbl record;
begin
  foreach role_name in array array['anon','authenticated'] loop
    for fn in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'purl_launch_%' loop
      perform pg_temp.assert(not has_function_privilege(role_name,fn.oid,'EXECUTE'),'function denied '||role_name);
    end loop;
    for tbl in select oid from pg_class where relnamespace='public'::regnamespace and relname like 'purl_launch_%' and relkind='r' loop
      perform pg_temp.assert(not has_table_privilege(role_name,tbl.oid,'SELECT,INSERT,UPDATE,DELETE'),'table denied '||role_name);
    end loop;
    begin
      execute format('set local role %I',role_name);
      perform public.purl_launch_read('sql-a','one');
      raise exception 'Unauthorised read permitted';
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
set role service_role;
select public.purl_launch_commit('service','[{"key":"ok","expectedVersion":0,"value":true}]');
select public.purl_launch_erase('sql-a');
reset role;
select pg_temp.assert(public.purl_launch_read('sql-a','one') is null,'erased');
select pg_temp.assert(public.purl_launch_resolve_handle('pearl') is null,'aliases erased');
select pg_temp.assert(not exists(select from public.purl_launch_idempotency where scope='sql-a'),'idempotency erased');
select 'PASS: SQL atomic rollback, tombstones, handle aliases, privacy erasure, invoker/RLS and denied roles' as verification;
