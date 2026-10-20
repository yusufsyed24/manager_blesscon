-- Blesscon Candy Business Manager v55.8
-- 1) Manager can see products + price tiers (needed for sales-order product lines)
-- 2) Report (and optionally clean up) duplicate salesman rows
-- Safe to re-run. Does NOT delete business data.

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.user_roles r join public.profiles p on p.id=r.user_id and p.active
                 where r.user_id=auth.uid() and r.role='manager')
$$;
revoke all on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Product visibility for Managers
-- ---------------------------------------------------------------------------
-- Snapshot function: normalise (idempotently) so products, price tiers and warehouse stock
-- are readable by an active Manager. Cost price stays hidden (it is stripped unless the
-- caller is Admin or has P&L permission).
do $fix$
declare
  def text; nd text;
  p_old text := 'public.is_admin() or public.has_permission(''products'')';
  p_new text := 'public.is_admin() or public.is_manager() or public.has_permission(''products'')';
  s_old text := 'public.is_admin() or public.has_permission(''stock'')';
  s_new text := 'public.is_admin() or public.is_manager() or public.has_permission(''stock'')';
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def;
  nd := replace(def, p_new, p_old);   -- normalise first so re-runs never double-patch
  nd := replace(nd,  s_new, s_old);
  nd := replace(nd,  p_old, p_new);
  nd := replace(nd,  s_old, s_new);
  if nd <> def then
    execute nd;
    raise notice 'v55.8: business_snapshot patched for manager product/stock visibility';
  elsif position(p_new in def) > 0 then
    raise notice 'v55.8: business_snapshot already allows managers to read products';
  else
    raise exception 'v55.8: could not find the products clause in business_snapshot(). Send the output of: select pg_get_functiondef(''public.business_snapshot()''::regprocedure);';
  end if;
end
$fix$;

-- Direct-table read policies (used by the app's fallback read and by RLS-checked queries)
drop policy if exists product_read on public.products;
create policy product_read on public.products for select to authenticated
using (public.is_admin() or public.is_manager() or public.has_permission('products')
       or exists(select 1 from public.salesmen s where s.user_id=auth.uid() and s.active));

-- price_tiers_read (tiers_read) already follows product visibility, so it needs no change.
grant select on public.products, public.price_tiers to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Duplicate salesmen
-- ---------------------------------------------------------------------------
-- (a) REPORT. Run this on its own first and review the result:
--
--   select lower(trim(regexp_replace(name,'\s+',' ','g'))) as norm_name,
--          count(*) as rows, array_agg(id order by created_at) as ids,
--          array_agg(user_id) as logins, array_agg(manager_user_id) as managers
--   from public.salesmen where deleted_at is null
--   group by 1 having count(*) > 1;
--
-- (b) CLEAN-UP. Soft-deletes only duplicates that are unlinked (no login), inactive-safe,
-- and referenced by NO business record anywhere (orders, customers, stock, closings, ...).
-- Any duplicate that has history is left alone and listed in a NOTICE for manual merge.
do $dedupe$
declare
  dup record; ref record; refs bigint; total bigint; removed int := 0; kept int := 0;
begin
  for dup in
    select s.id, s.name, s.user_id,
           row_number() over (
             partition by lower(trim(regexp_replace(s.name,'\s+',' ','g')))
             order by (s.user_id is not null) desc, s.created_at asc, s.id asc) as rn
    from public.salesmen s where s.deleted_at is null
  loop
    continue when dup.rn = 1 or dup.user_id is not null;   -- keep the best row; never touch linked rows
    total := 0;
    for ref in
      select c.table_name, c.column_name from information_schema.columns c
      join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
      where c.table_schema='public' and c.column_name in ('salesman_id','recipient_salesman_id') and c.table_name <> 'salesmen'
    loop
      execute format('select count(*) from public.%I where %I::text = $1', ref.table_name, ref.column_name) using dup.id
        into refs;
      total := total + coalesce(refs,0);
    end loop;
    if total = 0 then
      update public.salesmen set deleted_at = now(), active = false, updated_at = now() where id = dup.id;
      removed := removed + 1;
    else
      kept := kept + 1;
      raise notice 'Duplicate salesman "%" (%) has % linked records; merge manually.', dup.name, dup.id, total;
    end if;
  end loop;
  raise notice 'v55.8 duplicate clean-up: % empty duplicate(s) removed, % with history left in place.', removed, kept;
end
$dedupe$;

notify pgrst, 'reload schema';
