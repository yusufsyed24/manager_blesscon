-- Blesscon Candy Business Manager v55.9
-- Permanently delete a salesman AND every record connected to them.
-- Admin only. One transaction: if anything fails, nothing is deleted.
--
--   select public.admin_delete_salesman('<salesman id>', true);   -- PREVIEW (always rolled back)
--   select public.admin_delete_salesman('<salesman id>', false);  -- DELETE for real
--
-- What is removed: the salesman row and, by following the database's foreign keys, every row
-- that depends on it (orders, order items, invoices, payments, targets, stock issued/returned,
-- daily closings, expenses, attendance, documents, notifications, cash-book accounts and
-- entries, and so on), plus cash-book entries that were posted from the deleted sales/payments.
-- What is NOT removed: customers (they are unassigned instead, because shops can be served by
-- other salesmen) and the login, which the app deletes next through the admin-delete-user function.
-- Warehouse stock and cash/bank balances change as a result of the deleted records.
-- Take a Supabase backup first. This cannot be undone.

create schema if not exists private;

create or replace function private.cascade_remove(
  p_table regclass, p_filter text, p_stack regclass[], p_counts jsonb, p_nullify text[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  fk record; child_col text; ref_col text; child_filter text; counts jsonb := p_counts;
  n bigint; k text; has_id boolean; nullable boolean;
begin
  for fk in
    select c.conrelid as child_oid, c.conrelid::regclass as child, c.conkey, c.confkey, c.conname
    from pg_constraint c
    where c.contype = 'f' and c.confrelid = p_table
    order by c.conrelid::regclass::text, c.conname
  loop
    if array_length(fk.conkey, 1) <> 1 then
      raise exception 'Composite foreign key % is not supported by the cascade delete', fk.conname;
    end if;
    select a.attname, not a.attnotnull into child_col, nullable
      from pg_attribute a where a.attrelid = fk.child_oid and a.attnum = fk.conkey[1];
    select a.attname into ref_col from pg_attribute a where a.attrelid = p_table and a.attnum = fk.confkey[1];
    child_filter := format('%I in (select t.%I from %s t where %s)', child_col, ref_col, p_table, p_filter);

    if (format('%s.%s', fk.child, child_col) = any(p_nullify)) or (fk.child = any(p_stack)) then
      -- Unassign instead of delete (customers) or break a reference cycle (quotation <-> order).
      if not nullable then
        raise exception 'Cannot unassign %.% because it is NOT NULL', fk.child, child_col;
      end if;
      execute format('update %s set %I = null where %s', fk.child, child_col, child_filter);
      get diagnostics n = row_count;
      if n > 0 then
        k := fk.child::text || ' (unassigned)';
        counts := jsonb_set(counts, array[k], to_jsonb(coalesce((counts ->> k)::bigint, 0) + n));
      end if;
    else
      counts := private.cascade_remove(fk.child, child_filter, p_stack || fk.child, counts, p_nullify);
    end if;
  end loop;

  select exists (select 1 from pg_attribute where attrelid = p_table and attname = 'id' and not attisdropped) into has_id;
  if has_id then
    execute format('insert into pg_temp._cascade_deleted select %L, id::text from %s where %s', p_table::text, p_table, p_filter);
  end if;
  execute format('delete from %s where %s', p_table, p_filter);
  get diagnostics n = row_count;
  if n > 0 then
    k := p_table::text;
    counts := jsonb_set(counts, array[k], to_jsonb(coalesce((counts ->> k)::bigint, 0) + n));
  end if;
  return counts;
end $$;

create or replace function public.admin_delete_salesman(p_salesman_id text, p_dry_run boolean default true)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sm record; counts jsonb := '{}'::jsonb; trg record; disabled text[] := '{}'; t text; n bigint; role_name text;
begin
  if not public.is_admin() then raise exception 'Active admin required'; end if;
  select id, name, user_id into sm from public.salesmen where id = p_salesman_id;
  if sm.id is null then raise exception 'Salesman % was not found', p_salesman_id; end if;
  select role into role_name from public.user_roles where user_id = sm.user_id;

  create temp table if not exists _cascade_deleted(tbl text, id text) on commit drop;
  truncate pg_temp._cascade_deleted;

  begin
    -- Day-closing guards and similar row triggers would block deleting approved days.
    -- Disable user triggers (never foreign keys) for this transaction only; a failure rolls
    -- everything back, including this.
    for trg in
      select distinct c.oid::regclass::text as tbl
      from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace s on s.oid = c.relnamespace
      where not g.tgisinternal and s.nspname = 'public' and c.relkind = 'r'
    loop
      execute format('alter table %s disable trigger user', trg.tbl);
      disabled := disabled || trg.tbl;
    end loop;

    counts := private.cascade_remove(
      'public.salesmen'::regclass, format('id = %L', p_salesman_id), array['public.salesmen'::regclass],
      counts, array['public.customers.salesman_id']);

    -- Cash-book lines posted from the deleted sales, payments and expenses.
    if to_regclass('public.cashbook_entries') is not null then
      delete from public.cashbook_entries e
      using pg_temp._cascade_deleted d
      where e.source_id = d.id and e.source_table = split_part(d.tbl, '.', 2);
      get diagnostics n = row_count;
      if n > 0 then counts := jsonb_set(counts, array['public.cashbook_entries (from deleted sales)'], to_jsonb(n)); end if;
    end if;

    foreach t in array disabled loop
      execute format('alter table %s enable trigger user', t);
    end loop;

    if p_dry_run then raise exception using errcode = 'P0001', message = '__DRY_RUN_ROLLBACK__'; end if;
  exception when others then
    if sqlerrm <> '__DRY_RUN_ROLLBACK__' then raise; end if;
  end;

  return jsonb_build_object(
    'ok', true, 'dry_run', p_dry_run, 'salesman_id', sm.id, 'name', sm.name,
    'user_id', sm.user_id, 'login_role', role_name, 'counts', counts);
end $$;

revoke all on function private.cascade_remove(regclass, text, regclass[], jsonb, text[]) from public, anon, authenticated;
revoke all on function public.admin_delete_salesman(text, boolean) from public, anon;
grant execute on function public.admin_delete_salesman(text, boolean) to authenticated;
notify pgrst, 'reload schema';
