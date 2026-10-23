-- Blesscon Candy Business Manager v55.8.1
-- Type-safe repair for the specific duplicate pair reported by the user.
-- salesmen.id is stored as text in this deployment, despite UUID-shaped values.
-- Canonical salesman: 8707e09d-1d6d-428c-bffe-d0de2eb2909a (actual salesman login)
-- Suspected duplicate: d3b232c5-05eb-432f-9914-efbcf86c8c49 (incorrectly using Manager login)
-- Repoints simple foreign keys, then soft-deletes the duplicate. Never hard-deletes history.
-- If any guard fails, the transaction aborts and changes are rolled back.

begin;

do $repair$
declare
  canonical_id text := '8707e09d-1d6d-428c-bffe-d0de2eb2909a';
  duplicate_id text := 'd3b232c5-05eb-432f-9914-efbcf86c8c49';
  actual_salesman_user text := 'f68c26e7-a6d9-400a-bdfc-2aaa51f5e59f';
  manager_user text := 'd2cf42d4-3806-44f1-9deb-369920e2f152';
  canonical public.salesmen%rowtype;
  duplicate public.salesmen%rowtype;
  fk record;
begin
  select * into canonical from public.salesmen where id::text = canonical_id for update;
  select * into duplicate from public.salesmen where id::text = duplicate_id for update;

  if canonical.id is null or duplicate.id is null then
    raise exception 'Expected canonical and duplicate salesman rows were not both found. No changes applied.';
  end if;
  if canonical.user_id::text is distinct from actual_salesman_user
     or canonical.manager_user_id::text is distinct from manager_user then
    raise exception 'Canonical salesman row no longer matches the supplied IDs/Manager. No changes applied.';
  end if;
  if duplicate.user_id::text is distinct from manager_user
     or duplicate.manager_user_id::text is distinct from manager_user
     or lower(trim(duplicate.name)) <> lower(trim(canonical.name)) then
    raise exception 'Duplicate row does not match the reported Manager-linked duplicate. No changes applied.';
  end if;
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id::text = manager_user and ur.role::text = 'manager'
  ) then
    raise exception 'The duplicate row user is not currently recorded as a Manager. Stop and inspect Users & Access before cleanup.';
  end if;

  -- Refuse composite foreign keys because they require a hand-reviewed merge.
  if exists (
    select 1 from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.salesmen'::regclass
      and c.conrelid <> 'public.salesmen'::regclass
      and array_length(c.conkey, 1) <> 1
  ) then
    raise exception 'A composite foreign key references salesmen; no changes applied. Review the schema before merging.';
  end if;

  -- Foreign keys referencing a text salesmen.id are updated using text parameters.
  for fk in
    select c.conrelid::regclass as table_name,
           a.attname as column_name
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.salesmen'::regclass
      and c.conrelid <> 'public.salesmen'::regclass
      and array_length(c.conkey, 1) = 1
    order by c.conrelid::regclass::text, a.attname
  loop
    execute format('update %s set %I = $1 where %I = $2', fk.table_name, fk.column_name, fk.column_name)
      using canonical_id, duplicate_id;
  end loop;

  update public.salesmen
     set user_id = null,
         active = false,
         deleted_at = coalesce(deleted_at, now()),
         version = coalesce(version, 0) + 1,
         updated_at = now()
   where id::text = duplicate_id;

  raise notice 'Merged duplicate salesman references into % and soft-deleted duplicate %.', canonical_id, duplicate_id;
end
$repair$;

commit;

notify pgrst, 'reload schema';
