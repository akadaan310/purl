-- Additive, independent authority for consumer launch data. The legacy document
-- and its projection are deliberately untouched. Roll back by stopping new
-- consumers first, then dropping only these purl_launch_* functions/tables.
begin;

create function public.purl_launch_valid_text(p_value text, p_max integer)
returns boolean language sql immutable security invoker set search_path = '' as $$
select coalesce(p_value <> '' and octet_length(p_value) <= p_max
  and p_value !~ '[[:cntrl:]]' and p_value not in ('__proto__','constructor','prototype'),false)
$$;

-- Validate the entire JSON tree and count compact JSON bytes. Reject prototype
-- keys at every depth, including values nested inside arrays.
create function public.purl_launch_json_size(p_value jsonb, p_depth integer default 0)
returns bigint language plpgsql immutable security invoker set search_path = '' as $$
declare total bigint; item record; part jsonb; kind text := jsonb_typeof(p_value);
begin
  if p_value is null or p_depth > 64 then raise exception using errcode='PT400',message='invalid_input'; end if;
  if kind='object' then
    total := 2;
    for item in select key,value from jsonb_each(p_value) loop
      if item.key in ('__proto__','constructor','prototype') then raise exception using errcode='PT400',message='invalid_input'; end if;
      total := total + octet_length(to_jsonb(item.key)::text) + 1 + public.purl_launch_json_size(item.value,p_depth+1) + 1;
    end loop;
    if p_value <> '{}'::jsonb then total := total-1; end if;
  elsif kind='array' then
    total := 2;
    for part in select value from jsonb_array_elements(p_value) loop
      total := total + public.purl_launch_json_size(part,p_depth+1) + 1;
    end loop;
    if p_value <> '[]'::jsonb then total := total-1; end if;
  else
    if kind='number' then
      begin perform (p_value #>> '{}')::double precision;
      exception when numeric_value_out_of_range then raise exception using errcode='PT400',message='invalid_input'; end;
    end if;
    total := octet_length(p_value::text);
  end if;
  return total;
end $$;

create table public.purl_launch_scopes (
  scope text primary key check (public.purl_launch_valid_text(scope,256)),
  revision bigint not null default 0 check (revision>=0),
  active_bytes bigint not null default 0 check (active_bytes between 0 and 10485760),
  canonical_handle text,
  record_count integer not null default 0 check (record_count between 0 and 4096),
  handle_count integer not null default 0 check (handle_count between 0 and 1024),
  idempotency_count integer not null default 0 check (idempotency_count between 0 and 1024),
  retry_bytes bigint not null default 0 check (retry_bytes between 0 and 2097152)
);
create table public.purl_launch_records (
  scope text not null references public.purl_launch_scopes(scope) on delete cascade,
  key text not null check (public.purl_launch_valid_text(key,512)),
  version bigint not null check (version between 1 and 9007199254740991),
  value jsonb not null,
  active_bytes bigint not null check (active_bytes between 0 and 262144),
  status text generated always as (case when jsonb_typeof(value->'status')='string' and octet_length(value->>'status')<=64 then value->>'status' end) stored,
  primary key (scope,key)
);
create table public.purl_launch_handles (
  name text primary key check (name ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' and name not in ('constructor','prototype')),
  scope text not null references public.purl_launch_scopes(scope) on delete cascade
);
create table public.purl_launch_idempotency (
  scope text not null references public.purl_launch_scopes(scope) on delete cascade,
  key text not null check (public.purl_launch_valid_text(key,256)),
  payload_hash text not null check (public.purl_launch_valid_text(payload_hash,256)),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  result jsonb not null,
  metadata_bytes bigint not null check (metadata_bytes between 1 and 2097152),
  primary key (scope,key)
);
create index purl_launch_records_scope_prefix on public.purl_launch_records (scope,key text_pattern_ops) where value <> 'null'::jsonb;
create index purl_launch_records_pending_prefix on public.purl_launch_records (status,key text_pattern_ops,scope) where value <> 'null'::jsonb;
create index purl_launch_records_global_prefix on public.purl_launch_records (key text_pattern_ops,scope) where value <> 'null'::jsonb;
create index purl_launch_handles_owner on public.purl_launch_handles(scope);

create function public.purl_launch_read(p_scope text,p_key text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not public.purl_launch_valid_text(p_scope,256) or not public.purl_launch_valid_text(p_key,512) then raise exception using errcode='PT400',message='invalid_input'; end if;
  select jsonb_build_object('key',key,'version',version,'value',value) into result from public.purl_launch_records where scope=p_scope and key=p_key;
  return result;
end $$;
create function public.purl_launch_list(p_scope text,p_prefix text default '',p_limit integer default 200)
returns jsonb language plpgsql stable security invoker set search_path = '' set plan_cache_mode = 'force_custom_plan' as $$
begin
  if not public.purl_launch_valid_text(p_scope,256) or p_prefix is null or octet_length(p_prefix)>512 or p_prefix ~ '[[:cntrl:]]' or p_limit is null or p_limit not between 1 and 200 then raise exception using errcode='PT400',message='invalid_input'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('key',r.key,'version',r.version,'value',r.value) order by r.key collate "C"),'[]'::jsonb) from (
    select key,version,value from public.purl_launch_records where scope=p_scope and value <> 'null'::jsonb
    and key like replace(replace(replace(p_prefix,'\','\\'),'%','\%'),'_','\_')||'%' escape '\'
    order by key collate "C" limit p_limit
  ) r);
end $$;
create function public.purl_launch_scan(p_prefix text default '',p_statuses text[] default null,p_limit integer default 200)
returns jsonb language plpgsql stable security invoker set search_path = '' set plan_cache_mode = 'force_custom_plan' as $$
begin
  if p_prefix is null or octet_length(p_prefix)>512 or p_prefix ~ '[[:cntrl:]]' or p_limit is null or p_limit not between 1 and 200
    or (p_statuses is not null and (cardinality(p_statuses) not between 1 and 32 or exists(select from unnest(p_statuses) s where s is null or s='' or octet_length(s)>64)))
    then raise exception using errcode='PT400',message='invalid_input'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('scope',r.scope,'key',r.key,'version',r.version,'value',r.value) order by r.scope collate "C",r.key collate "C"),'[]'::jsonb) from (
    select scope,key,version,value from public.purl_launch_records where value <> 'null'::jsonb and (p_statuses is null or status=any(p_statuses))
    and key like replace(replace(replace(p_prefix,'\','\\'),'%','\%'),'_','\_')||'%' escape '\'
    order by scope collate "C",key collate "C" limit p_limit
  ) r);
end $$;

create function public.purl_launch_commit(p_scope text,p_changes jsonb,p_idempotency_key text default null,p_payload_hash text default null,p_handle text default null)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  tenant public.purl_launch_scopes%rowtype;
  previous public.purl_launch_idempotency%rowtype;
  old public.purl_launch_records%rowtype;
  item jsonb; item_key text; expected bigint; bytes bigint; delta bigint:=0;
  payload jsonb; records jsonb:='[]'::jsonb; result jsonb; reserved text; fingerprint text;
  record_delta integer:=0; handle_delta integer:=0; retry_size bigint:=0;
begin
  if not public.purl_launch_valid_text(p_scope,256) or jsonb_typeof(p_changes) is distinct from 'array'
    or jsonb_array_length(p_changes) not between 1 and 32
    or (p_idempotency_key is null) <> (p_payload_hash is null)
    or (p_idempotency_key is not null and (not public.purl_launch_valid_text(p_idempotency_key,256) or not public.purl_launch_valid_text(p_payload_hash,256)))
    or (p_handle is not null and (p_handle !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' or p_handle in ('constructor','prototype')))
    then raise exception using errcode='PT400',message='invalid_input'; end if;
  for item in select value from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'key') is distinct from 'string'
      or not public.purl_launch_valid_text(item->>'key',512) or jsonb_typeof(item->'expectedVersion') is distinct from 'number'
      or (item->>'expectedVersion') !~ '^(0|[1-9][0-9]{0,15})$' or (item->>'expectedVersion')::numeric > 9007199254740990
      or not (item ? 'value') then raise exception using errcode='PT400',message='invalid_input'; end if;
    bytes := public.purl_launch_json_size(item->'value');
    if bytes>262144 then raise exception using errcode='PT413',message='row_limit'; end if;
  end loop;
  if (select count(*) <> count(distinct value->>'key') from jsonb_array_elements(p_changes)) then raise exception using errcode='PT400',message='invalid_input'; end if;
  -- An advisory lock includes absent scopes and erasure; independent scopes do
  -- not share any mutable JSON document or tenant lock. Hash collisions only serialize.
  perform pg_advisory_xact_lock(hashtextextended(p_scope,197932));
  insert into public.purl_launch_scopes(scope) values(p_scope) on conflict do nothing;
  select * into tenant from public.purl_launch_scopes where scope=p_scope for update;
  payload := jsonb_build_object('changes',p_changes,'handle',p_handle);
  fingerprint := encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  if p_idempotency_key is not null then
    select * into previous from public.purl_launch_idempotency where scope=p_scope and key=p_idempotency_key;
    if found then
      if previous.payload_hash<>p_payload_hash or previous.fingerprint<>fingerprint then raise exception using errcode='PT409',message='idempotency_conflict'; end if;
      return previous.result || '{"duplicate":true}'::jsonb;
    end if;
  end if;
  for item in select value from jsonb_array_elements(p_changes) loop
    item_key:=item->>'key'; expected:=(item->>'expectedVersion')::bigint;
    select * into old from public.purl_launch_records where scope=p_scope and key=item_key;
    if old.scope is null then record_delta:=record_delta+1; end if;
    if coalesce(old.version,0)<>expected then raise exception using errcode='PT409',message='version_conflict'; end if;
    bytes:=case when item->'value'='null'::jsonb then 0 else public.purl_launch_json_size(item->'value') end;
    delta:=delta+bytes-coalesce(old.active_bytes,0);
  end loop;
  if tenant.record_count+record_delta>4096 then raise exception using errcode='PT413',message='metadata_quota'; end if;
  if tenant.active_bytes+delta>10485760 then raise exception using errcode='PT413',message='tenant_quota'; end if;
  if p_handle is not null then
    select scope into reserved from public.purl_launch_handles where name=p_handle;
    if reserved is not null and reserved<>p_scope then raise exception using errcode='PT409',message='handle_conflict'; end if;
    if reserved is null then handle_delta:=1; end if;
    if tenant.handle_count+handle_delta>1024 then raise exception using errcode='PT413',message='metadata_quota'; end if;
    insert into public.purl_launch_handles(name,scope) values(p_handle,p_scope)
      on conflict(name) do update set name=excluded.name where public.purl_launch_handles.scope=excluded.scope returning scope into reserved;
    if reserved is null then raise exception using errcode='PT409',message='handle_conflict'; end if;
  end if;
  for item in select value from jsonb_array_elements(p_changes) loop
    item_key:=item->>'key'; expected:=(item->>'expectedVersion')::bigint;
    bytes:=case when item->'value'='null'::jsonb then 0 else public.purl_launch_json_size(item->'value') end;
    insert into public.purl_launch_records(scope,key,version,value,active_bytes) values(p_scope,item_key,expected+1,item->'value',bytes)
      on conflict(scope,key) do update set version=excluded.version,value=excluded.value,active_bytes=excluded.active_bytes;
    records:=records||jsonb_build_array(jsonb_build_object('key',item_key,'version',expected+1,'value',item->'value'));
  end loop;
  result:=jsonb_build_object('revision',tenant.revision+1,'records',records,'duplicate',false);
  if p_idempotency_key is not null then
    retry_size:=public.purl_launch_json_size(jsonb_build_object('key',p_idempotency_key,'payloadHash',p_payload_hash,'fingerprint',fingerprint,'result',result));
    if tenant.idempotency_count>=1024 or tenant.retry_bytes+retry_size>2097152 then raise exception using errcode='PT413',message='metadata_quota'; end if;
    insert into public.purl_launch_idempotency(scope,key,payload_hash,fingerprint,result,metadata_bytes) values(p_scope,p_idempotency_key,p_payload_hash,fingerprint,result,retry_size);
  end if;
  update public.purl_launch_scopes set revision=revision+1,active_bytes=active_bytes+delta,canonical_handle=coalesce(p_handle,canonical_handle),
    record_count=record_count+record_delta,handle_count=handle_count+handle_delta,
    idempotency_count=idempotency_count+case when p_idempotency_key is null then 0 else 1 end,retry_bytes=retry_bytes+retry_size
    where scope=p_scope;
  return result;
end $$;

create function public.purl_launch_resolve_handle(p_handle text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_handle is null or p_handle !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' or p_handle in ('constructor','prototype') then raise exception using errcode='PT400',message='invalid_input'; end if;
  select jsonb_build_object('subject',h.scope,'handle',s.canonical_handle) into result from public.purl_launch_handles h join public.purl_launch_scopes s on s.scope=h.scope where h.name=p_handle;
  return result;
end $$;
create function public.purl_launch_erase(p_scope text)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
begin
  if not public.purl_launch_valid_text(p_scope,256) then raise exception using errcode='PT400',message='invalid_input'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_scope,197932));
  delete from public.purl_launch_scopes where scope=p_scope;
  return 'null'::jsonb;
end $$;

alter table public.purl_launch_scopes enable row level security;
alter table public.purl_launch_records enable row level security;
alter table public.purl_launch_handles enable row level security;
alter table public.purl_launch_idempotency enable row level security;
revoke all on public.purl_launch_scopes,public.purl_launch_records,public.purl_launch_handles,public.purl_launch_idempotency from public,anon,authenticated;
grant select,insert,update,delete on public.purl_launch_scopes,public.purl_launch_records,public.purl_launch_handles,public.purl_launch_idempotency to service_role;
create policy purl_launch_service_scopes on public.purl_launch_scopes for all to service_role using(true) with check(true);
create policy purl_launch_service_records on public.purl_launch_records for all to service_role using(true) with check(true);
create policy purl_launch_service_handles on public.purl_launch_handles for all to service_role using(true) with check(true);
create policy purl_launch_service_idempotency on public.purl_launch_idempotency for all to service_role using(true) with check(true);
do $$ declare fn record;
begin
  for fn in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'purl_launch_%' loop
    execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
    execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
end $$;
commit;
