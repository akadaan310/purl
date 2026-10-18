-- Run through psql with AUTOCOMMIT enabled. Each CAS must commit before xmin is
-- compared; a single DO block/transaction would hide unnecessary row rewrites.
set role service_role;
select public.purl_compare_and_swap('projection-write-test', 0,
  '{"principals":{"owner":{"label":"Owner"}},"programs":{"unchanged":{"owner":"owner","visibility":"public","version":1},"changed":{"owner":"owner","visibility":"public","version":1}},"executions":{},"artifacts":{},"audit":[{"event":"stable"},{"event":"changing","value":1}]}'::jsonb);

create temporary table purl_projection_before as
  select kind, entity_id, xmin::text as row_xmin, data
  from public.purl_entities where document_id = 'projection-write-test';
create temporary table purl_audit_before as
  select ordinal, xmin::text as row_xmin, data
  from public.purl_audit where document_id = 'projection-write-test';

-- Change exactly one program and one audit entry in a separately committed CAS.
select public.purl_compare_and_swap('projection-write-test', 1,
  jsonb_set(jsonb_set(public.purl_read_document('projection-write-test')->'data',
    '{programs,changed,version}', '2'::jsonb), '{audit,1,value}', '2'::jsonb));

select 'entity' as projection, entity.entity_id as identity, before.row_xmin as before_xmin,
       entity.xmin::text as after_xmin, entity.data is distinct from before.data as data_changed
  from public.purl_entities entity join purl_projection_before before using (kind, entity_id)
  where entity.document_id = 'projection-write-test'
union all
select 'audit', audit.ordinal::text, before.row_xmin, audit.xmin::text,
       audit.data is distinct from before.data
  from public.purl_audit audit join purl_audit_before before using (ordinal)
  where audit.document_id = 'projection-write-test'
order by projection, identity;

do $verify$
begin
  if exists (
    select 1 from public.purl_entities entity join purl_projection_before before using (kind, entity_id)
      where entity.document_id = 'projection-write-test' and entity.entity_id <> 'changed'
      and entity.xmin::text <> before.row_xmin
  ) then raise exception 'Unchanged entity projection was rewritten'; end if;
  if exists (
    select 1 from public.purl_audit audit join purl_audit_before before using (ordinal)
      where audit.document_id = 'projection-write-test' and audit.ordinal = 1
      and audit.xmin::text <> before.row_xmin
  ) then raise exception 'Unchanged audit projection was rewritten'; end if;
  if not exists (
    select 1 from public.purl_entities entity join purl_projection_before before using (kind, entity_id)
      where entity.document_id = 'projection-write-test' and entity.entity_id = 'changed'
      and entity.data->>'version' = '2' and entity.xmin::text <> before.row_xmin
  ) then raise exception 'Changed entity projection was not updated'; end if;
  if not exists (
    select 1 from public.purl_audit audit join purl_audit_before before using (ordinal)
      where audit.document_id = 'projection-write-test' and audit.ordinal = 2
      and audit.data->>'value' = '2' and audit.xmin::text <> before.row_xmin
  ) then raise exception 'Changed audit projection was not updated'; end if;
end;
$verify$;

create temporary table purl_projection_committed as
  select kind, entity_id, xmin::text as row_xmin, data
  from public.purl_entities where document_id = 'projection-write-test';
create temporary table purl_audit_committed as
  select ordinal, xmin::text as row_xmin, data
  from public.purl_audit where document_id = 'projection-write-test';
create temporary table purl_document_committed as
  select revision, xmin::text as row_xmin, data
  from public.purl_documents where document_id = 'projection-write-test';

do $verify$
declare result jsonb;
begin
  result := public.purl_compare_and_swap('projection-write-test', 1,
    jsonb_set(public.purl_read_document('projection-write-test')->'data', '{programs,changed,version}', '3'::jsonb));
  if result <> '{"committed":false}'::jsonb then raise exception 'Stale CAS committed'; end if;
end;
$verify$;

-- A deliberate test-only projection constraint forces failure after the CAS
-- document UPDATE, proving the document and projections roll back together.
reset role;
alter table public.purl_entities add constraint purl_projection_regression_reject
  check (document_id <> 'projection-write-test' or entity_id <> 'changed' or data->>'version' <> '999');
set role service_role;
do $verify$
begin
  begin
    perform public.purl_compare_and_swap('projection-write-test', 2,
      jsonb_set(jsonb_set(public.purl_read_document('projection-write-test')->'data',
        '{programs,changed,version}', '999'::jsonb), '{audit,1,value}', '999'::jsonb));
    raise exception 'Projection failure was not raised';
  exception when check_violation then null;
  end;
end;
$verify$;

do $verify$
begin
  if (select count(*) from public.purl_entities where document_id = 'projection-write-test')
       <> (select count(*) from purl_projection_committed)
     or (select count(*) from public.purl_audit where document_id = 'projection-write-test')
       <> (select count(*) from purl_audit_committed) then
    raise exception 'Stale or failed CAS changed projection cardinality';
  end if;
  if exists (
    select 1 from public.purl_documents doc cross join purl_document_committed before
      where doc.document_id = 'projection-write-test'
      and (doc.revision <> before.revision or doc.xmin::text <> before.row_xmin or doc.data is distinct from before.data)
  ) then raise exception 'Stale or failed CAS changed the authoritative document'; end if;
  if exists (
    select 1 from public.purl_entities entity join purl_projection_committed before using (kind, entity_id)
      where entity.document_id = 'projection-write-test'
      and (entity.xmin::text <> before.row_xmin or entity.data is distinct from before.data)
  ) then raise exception 'Stale or failed CAS changed entity projections'; end if;
  if exists (
    select 1 from public.purl_audit audit join purl_audit_committed before using (ordinal)
      where audit.document_id = 'projection-write-test'
      and (audit.xmin::text <> before.row_xmin or audit.data is distinct from before.data)
  ) then raise exception 'Stale or failed CAS changed audit projections'; end if;
  if (public.purl_read_document('projection-write-test')->>'revision')::bigint <> 2 then raise exception 'Final revision mismatch'; end if;
end;
$verify$;
reset role;
alter table public.purl_entities drop constraint purl_projection_regression_reject;
select 'PASS: unchanged entity/audit xmin retained; changed rows updated; stale CAS and projection-failure rollback preserve revision 2' as verification;
