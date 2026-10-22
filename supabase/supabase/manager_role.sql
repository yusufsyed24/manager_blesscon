-- Manager role: company-wide view, company monthly target, direct (manager) sales.
-- Run once in the Supabase SQL editor AFTER schema.sql and operational_modules.sql. Safe to re-run.

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check check(role in ('admin','manager','user','salesman'));

create or replace function public.is_manager() returns boolean language sql stable security definer set search_path=''
as $$select exists(select 1 from public.user_roles r join public.profiles p on p.id=r.user_id and p.active where r.user_id=auth.uid() and r.role='manager')$$;

-- Managers can VIEW every sales document, but only create/edit direct sales (no salesman attached).
create or replace function public.can_document(sid text,section text,action text default 'view') returns boolean language sql stable security definer set search_path=''
as $$select public.is_admin()
  or (public.is_manager() and (action='view' or (sid is null and action in ('create','edit','share','export'))))
  or (public.owns_salesman(sid) and action in ('view','create','edit','share','export') and (exists(select 1 from public.user_roles where user_id=auth.uid() and role='salesman') or public.has_permission(section,action)))$$;

grant execute on function public.is_manager() to authenticated;

-- Patch the existing functions in place (text replace on their current definitions).
-- A pattern that is not found is skipped, so this never breaks a function.
do $$
declare r record; def text; nd text; patched int:=0;
  pats text[][]:=array[
    -- accepted roles when creating / editing users
    array['(''admin'',''salesman'',''user'')','(''admin'',''manager'',''salesman'',''user'')'],
    -- manager may use any customer when making a direct sale
    array['not public.is_admin() and not(public.owns_salesman(c.salesman_id) or c.created_by=auth.uid())','not public.is_admin() and not public.is_manager() and not(public.owns_salesman(c.salesman_id) or c.created_by=auth.uid())'],
    -- manager may record payments on direct sales
    array['not public.is_admin() and not(public.owns_salesman(o.salesman_id) and public.has_permission(''invoices'',''create''))','not public.is_admin() and not(public.is_manager() and o.salesman_id is null) and not(public.owns_salesman(o.salesman_id) and public.has_permission(''invoices'',''create''))']
  ];
  i int;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' loop
    def:=pg_get_functiondef(r.oid); nd:=def;
    for i in 1..array_length(pats,1) loop nd:=replace(nd,pats[i][1],pats[i][2]); end loop;
    if nd<>def then execute nd; patched:=patched+1; end if;
  end loop;
  raise notice 'manager_role: patched % function(s)',patched;
end $$;

-- Snapshot: give managers company-wide visibility (customers, salesmen, targets, stock, closings, products).
-- Salary, cost and profit stay restricted (they still depend on is_admin()/pnl permission only).
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def; nd:=def;
  nd:=replace(nd,'public.is_admin() or public.owns_salesman(','public.is_admin() or public.is_manager() or public.owns_salesman(');
  nd:=replace(nd,'public.is_admin() or public.has_permission(''products'')','public.is_admin() or public.is_manager() or public.has_permission(''products'')');
  nd:=replace(nd,'public.is_admin() or public.has_permission(''stock'')','public.is_admin() or public.is_manager() or public.has_permission(''stock'')');
  if nd<>def then execute nd; raise notice 'manager_role: business_snapshot patched'; else raise notice 'manager_role: business_snapshot already patched'; end if;
end $$;

-- Explicit Manager read access for the requested company-wide operational screens.
-- This release uses company-wide Manager visibility (not per-team assignment).
-- Admin write policies and existing data are left untouched.
drop policy if exists product_read on public.products;
create policy product_read on public.products for select to authenticated
using (public.is_admin() or public.is_manager() or public.has_permission('products')
  or exists(select 1 from public.salesmen s where s.user_id=auth.uid() and s.active));

drop policy if exists salesman_read on public.salesmen;
create policy salesman_read on public.salesmen for select to authenticated
using (public.is_admin() or public.is_manager() or public.owns_salesman(id));

drop policy if exists customer_read on public.customers;
create policy customer_read on public.customers for select to authenticated
using (public.is_admin() or public.is_manager() or public.owns_salesman(salesman_id)
  or (created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active)));

drop policy if exists target_read on public.salesman_daily_targets;
create policy target_read on public.salesman_daily_targets for select to authenticated
using (public.is_admin() or public.is_manager() or public.owns_salesman(salesman_id));

drop policy if exists stock_admin on public.stock_movements;
create policy stock_admin on public.stock_movements for select to authenticated
using (public.is_admin() or public.is_manager() or public.has_permission('stock'));

drop policy if exists daily_closing_read on public.daily_closings;
create policy daily_closing_read on public.daily_closings for select to authenticated
using (public.is_admin() or public.is_manager() or public.owns_salesman(salesman_id) or public.has_permission('closing'));

drop policy if exists salesman_stock_read on public.salesman_stock_movements;
create policy salesman_stock_read on public.salesman_stock_movements for select to authenticated
using (public.is_admin() or public.is_manager() or public.owns_salesman(salesman_id) or public.has_permission('stock'));

drop policy if exists stock_voucher_read on public.stock_vouchers;
create policy stock_voucher_read on public.stock_vouchers for select to authenticated
using (public.is_admin() or public.is_manager() or public.owns_salesman(salesman_id) or public.has_permission('stock'));
