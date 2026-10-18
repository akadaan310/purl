-- Local PostgreSQL verification only; a minimal Storage schema is provided by
-- verify-schema.sh. This does not exercise the hosted Storage HTTP service.
do $verify$
begin
  if (public.purl_read_document('schema-test') ->> 'revision')::bigint <> 0 then raise exception 'initial revision'; end if;
  if exists (select 1 from public.purl_documents) then raise exception 'read mutated database'; end if;
  if not exists (select 1 from storage.buckets where id = 'purl-artifacts' and not public) then raise exception 'artifact bucket not private'; end if;
  if has_table_privilege('anon', 'public.purl_documents', 'select') then raise exception 'anon document access'; end if;
  if has_function_privilege('authenticated', 'public.purl_compare_and_swap(text,bigint,jsonb)', 'execute') then raise exception 'authenticated CAS access'; end if;
  if exists (select 1 from pg_class where oid in ('public.purl_documents'::regclass, 'public.purl_entities'::regclass, 'public.purl_audit'::regclass) and not relrowsecurity) then raise exception 'RLS disabled'; end if;
end;
$verify$;

set role service_role;
do $verify$
declare result jsonb;
begin
  result := public.purl_compare_and_swap('schema-test', 0,
    '{"principals":{"person":{"label":"owner"}},"programs":{"program":{"owner":"person","visibility":"private"}},"executions":{"job":{"status":"queued"}},"artifacts":{},"audit":[{"event":"created"}]}'::jsonb);
  if result <> '{"committed":true,"revision":1}'::jsonb then raise exception 'initial CAS failed: %', result; end if;
  result := public.purl_compare_and_swap('schema-test', 0,
    '{"principals":{},"programs":{},"executions":{},"artifacts":{},"audit":[]}'::jsonb);
  if result <> '{"committed":false}'::jsonb then raise exception 'stale CAS committed'; end if;
  if (select count(*) from public.purl_entities where document_id = 'schema-test') <> 3 then raise exception 'entity projection mismatch'; end if;
  if (select count(*) from public.purl_audit where document_id = 'schema-test') <> 1 then raise exception 'audit projection mismatch'; end if;
  begin
    perform public.purl_compare_and_swap('schema-test', 1, '{}'::jsonb);
    raise exception 'invalid document accepted';
  exception when invalid_parameter_value then null;
  end;
  if (public.purl_read_document('schema-test') ->> 'revision')::bigint <> 1 then raise exception 'invalid write changed revision'; end if;
  result := public.purl_compare_and_swap('schema-test', 1,
    '{"principals":{},"programs":{},"executions":{},"artifacts":{},"audit":[]}'::jsonb);
  if result <> '{"committed":true,"revision":2}'::jsonb then raise exception 'second CAS failed'; end if;
  if exists (select 1 from public.purl_entities where document_id = 'schema-test') then raise exception 'removed entity projection retained'; end if;
  if exists (select 1 from public.purl_audit where document_id = 'schema-test') then raise exception 'removed audit projection retained'; end if;
end;
$verify$;
reset role;

-- Broad existing policies cannot expose the private artifact bucket.
insert into storage.objects(bucket_id, name) values ('purl-artifacts', 'private'), ('other-bucket', 'public');
create policy existing_broad_read on storage.objects for select to anon using (true);
grant usage on schema storage to anon;
grant select on storage.objects to anon;
set role anon;
do $verify$
begin
  if exists (select 1 from storage.objects where bucket_id = 'purl-artifacts') then raise exception 'artifact bucket exposed'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'other-bucket') then raise exception 'unrelated policy affected'; end if;
  begin
    perform public.purl_read_document('schema-test');
    raise exception 'anonymous RPC allowed';
  exception when insufficient_privilege then null;
  end;
end;
$verify$;
reset role;
select 'PASS: CAS, read purity, projections, RLS/grants, private Storage policies' as verification;
