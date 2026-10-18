-- Additive bootstrap. The JSON document is authoritative; normalized rows are
-- transactionally maintained query/operations projections, never a second writer.
begin;

create table public.purl_documents (
  document_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

create table public.purl_entities (
  document_id text not null references public.purl_documents(document_id) on delete cascade,
  kind text not null check (kind in ('principal', 'program', 'execution', 'artifact')),
  entity_id text not null,
  data jsonb not null,
  owner_id text generated always as (data ->> 'owner') stored,
  visibility text generated always as (data ->> 'visibility') stored,
  status text generated always as (data ->> 'status') stored,
  primary key (document_id, kind, entity_id)
);

create index purl_entities_owner_idx on public.purl_entities(document_id, kind, owner_id);
create index purl_entities_visibility_idx on public.purl_entities(document_id, visibility) where kind = 'program';
create index purl_entities_execution_status_idx on public.purl_entities(document_id, status) where kind = 'execution';
create index purl_entities_data_idx on public.purl_entities using gin (data jsonb_path_ops);

create table public.purl_audit (
  document_id text not null references public.purl_documents(document_id) on delete cascade,
  ordinal bigint not null check (ordinal > 0),
  data jsonb not null,
  primary key (document_id, ordinal)
);

alter table public.purl_documents enable row level security;
alter table public.purl_entities enable row level security;
alter table public.purl_audit enable row level security;
revoke all on public.purl_documents, public.purl_entities, public.purl_audit from public, anon, authenticated;
grant select, insert, update on public.purl_documents to service_role;
grant select, insert, update, delete on public.purl_entities, public.purl_audit to service_role;

-- SECURITY INVOKER deliberately retains the caller's table/RLS permissions.
-- A read of an uninitialized document has no database side effects.
create function public.purl_read_document(p_document_id text default 'main')
returns jsonb language sql stable security invoker set search_path = ''
as $function$
  select coalesce(
    (select jsonb_build_object('revision', d.revision, 'data', d.data)
       from public.purl_documents d where d.document_id = p_document_id),
    jsonb_build_object('revision', 0, 'data',
      '{"principals":{},"programs":{},"executions":{},"artifacts":{},"audit":[]}'::jsonb)
  );
$function$;

create function public.purl_compare_and_swap(p_document_id text, p_expected_revision bigint, p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $function$
declare next_revision bigint;
begin
  if p_document_id is null or length(p_document_id) = 0 or p_expected_revision < 0
     or p_expected_revision >= 9007199254740991 then
    raise exception 'Invalid document identity or revision' using errcode = '22023';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object'
     or jsonb_typeof(p_data -> 'principals') is distinct from 'object'
     or jsonb_typeof(p_data -> 'programs') is distinct from 'object'
     or jsonb_typeof(p_data -> 'executions') is distinct from 'object'
     or jsonb_typeof(p_data -> 'artifacts') is distinct from 'object'
     or jsonb_typeof(p_data -> 'audit') is distinct from 'array' then
    raise exception 'Invalid document collections' using errcode = '22023';
  end if;

  if p_expected_revision = 0 then
    insert into public.purl_documents(document_id, revision, data)
      values (p_document_id, 1, p_data)
      on conflict (document_id) do nothing
      returning revision into next_revision;
  end if;
  if next_revision is null then
    update public.purl_documents
      set data = p_data, revision = revision + 1, updated_at = now()
      where document_id = p_document_id and revision = p_expected_revision
      returning revision into next_revision;
  end if;
  if next_revision is null then return jsonb_build_object('committed', false); end if;

  insert into public.purl_entities(document_id, kind, entity_id, data)
    select p_document_id, collection.kind, entity.key, entity.value
    from (values ('principal', 'principals'), ('program', 'programs'),
                 ('execution', 'executions'), ('artifact', 'artifacts')) collection(kind, key)
    cross join lateral jsonb_each(p_data -> collection.key) entity
    on conflict (document_id, kind, entity_id) do update set data = excluded.data;
  delete from public.purl_entities entity
    where entity.document_id = p_document_id and not coalesce(
      (p_data -> case entity.kind when 'principal' then 'principals' when 'program' then 'programs'
        when 'execution' then 'executions' when 'artifact' then 'artifacts' end) ? entity.entity_id, false);

  insert into public.purl_audit(document_id, ordinal, data)
    select p_document_id, item.ordinality, item.value
      from jsonb_array_elements(p_data -> 'audit') with ordinality item(value, ordinality)
    on conflict (document_id, ordinal) do update set data = excluded.data;
  delete from public.purl_audit where document_id = p_document_id
    and ordinal > jsonb_array_length(p_data -> 'audit');
  return jsonb_build_object('committed', true, 'revision', next_revision);
end;
$function$;

revoke all on function public.purl_read_document(text) from public, anon, authenticated;
revoke all on function public.purl_compare_and_swap(text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.purl_read_document(text) to service_role;
grant execute on function public.purl_compare_and_swap(text, bigint, jsonb) to service_role;

insert into storage.buckets(id, name, public, file_size_limit)
  values ('purl-artifacts', 'purl-artifacts', false, 52428800)
  on conflict (id) do nothing;

-- A public bucket serves downloads independently of object SELECT policies.
-- Fail closed on a preexisting public-name collision rather than silently
-- treating its objects as private or changing unrelated bucket configuration.
do $bucket_check$
begin
  if exists (select 1 from storage.buckets where id = 'purl-artifacts' and public) then
    raise exception 'Existing purl-artifacts bucket must be made private before applying this migration';
  end if;
end;
$bucket_check$;

-- Restrictive policies also deny this bucket if the host project already has
-- broader permissive policies for other buckets. Application access is mediated
-- by the backend; service_role intentionally bypasses RLS.
create policy purl_artifacts_private_select on storage.objects as restrictive for select
  to anon, authenticated using (bucket_id <> 'purl-artifacts');
create policy purl_artifacts_private_insert on storage.objects as restrictive for insert
  to anon, authenticated with check (bucket_id <> 'purl-artifacts');
create policy purl_artifacts_private_update on storage.objects as restrictive for update
  to anon, authenticated using (bucket_id <> 'purl-artifacts') with check (bucket_id <> 'purl-artifacts');
create policy purl_artifacts_private_delete on storage.objects as restrictive for delete
  to anon, authenticated using (bucket_id <> 'purl-artifacts');

commit;
