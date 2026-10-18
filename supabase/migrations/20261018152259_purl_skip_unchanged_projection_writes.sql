-- Preserve the authoritative document CAS and atomic projection maintenance.
-- Identical entity/audit JSON does not need a new MVCC row version or index write.
-- This upgrade retains the RPC signature and privileges of the bootstrap.
begin;

create or replace function public.purl_compare_and_swap(p_document_id text, p_expected_revision bigint, p_data jsonb)
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

  insert into public.purl_entities as existing(document_id, kind, entity_id, data)
    select p_document_id, collection.kind, entity.key, entity.value
    from (values ('principal', 'principals'), ('program', 'programs'),
                 ('execution', 'executions'), ('artifact', 'artifacts')) collection(kind, key)
    cross join lateral jsonb_each(p_data -> collection.key) entity
    on conflict (document_id, kind, entity_id) do update set data = excluded.data
      where existing.data is distinct from excluded.data;
  delete from public.purl_entities entity
    where entity.document_id = p_document_id and not coalesce(
      (p_data -> case entity.kind when 'principal' then 'principals' when 'program' then 'programs'
        when 'execution' then 'executions' when 'artifact' then 'artifacts' end) ? entity.entity_id, false);

  insert into public.purl_audit as existing(document_id, ordinal, data)
    select p_document_id, item.ordinality, item.value
      from jsonb_array_elements(p_data -> 'audit') with ordinality item(value, ordinality)
    on conflict (document_id, ordinal) do update set data = excluded.data
      where existing.data is distinct from excluded.data;
  delete from public.purl_audit where document_id = p_document_id
    and ordinal > jsonb_array_length(p_data -> 'audit');
  return jsonb_build_object('committed', true, 'revision', next_revision);
end;
$function$;

revoke all on function public.purl_compare_and_swap(text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.purl_compare_and_swap(text, bigint, jsonb) to service_role;

commit;
