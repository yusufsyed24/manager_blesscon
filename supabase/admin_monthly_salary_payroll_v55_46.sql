-- Blesscon Candy Business Manager v55.12
-- Lets a Manager create sales orders (and new customers) for salesmen assigned to them.
-- Fixes: "Active salesman required" when a Manager saves a new customer while creating an order.
-- Safe to re-run. Does not touch business data.

-- 1. Customers: a Manager may save customers. A team salesman is kept on the customer;
--    anything else is left unassigned. Only non-manager, non-salesman users still get the error.
do $fix$
declare
  def text; nd text;
  old_line text := $o$if t='customers' and not adm then select id into k from public.salesmen where user_id=auth.uid() and active and deleted_at is null; if k is null then raise exception 'Active salesman required'; end if; r:=r||jsonb_build_object('salesman_id',k); end if;$o$;
  new_line text := $n$if t='customers' and not adm then select id into k from public.salesmen where user_id=auth.uid() and active and deleted_at is null; if k is not null then r:=r||jsonb_build_object('salesman_id',k); elsif public.is_manager() then if nullif(r->>'salesman_id','') is not null and not exists(select 1 from public.salesmen sm where sm.id=r->>'salesman_id' and sm.manager_user_id=auth.uid() and sm.deleted_at is null) then r:=r||jsonb_build_object('salesman_id',null); end if; else raise exception 'Active salesman required'; end if; end if;$n$;
begin
  select pg_get_functiondef('private.save_master(text,jsonb,integer)'::regprocedure) into def;
  if position('elsif public.is_manager() then if nullif(r->>''salesman_id''' in def) > 0 then
    raise notice 'v55.12: save_master already allows managers to save customers';
  elsif position(old_line in def) > 0 then
    nd := replace(def, old_line, new_line);
    execute nd;
    raise notice 'v55.12: save_master patched so managers can save customers';
  elsif position('Active salesman required' in def) = 0 then
    raise notice 'v55.12: save_master has no salesman requirement for customers; nothing to change';
  else
    raise exception 'v55.12: could not safely patch private.save_master(); the customer rule differs from the expected text. Nothing was changed.';
  end if;
end
$fix$;

-- 2. Who may create / edit documents for which salesman.
--    Admin: everything. Manager: direct sales (no salesman) as before, plus orders for
--    salesmen ASSIGNED TO THAT MANAGER. Salesman: own documents.
create or replace function public.can_document(sid text, section text, action text default 'view') returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if public.is_admin() then return true; end if;
  if action not in ('view','create','edit','share','export') then return false; end if;
  if public.is_manager() then
    if sid is null then return true; end if;
    if not exists(select 1 from public.salesmen sm where sm.id=sid and sm.manager_user_id=auth.uid() and sm.active and sm.deleted_at is null) then return false; end if;
    if section in ('quotes','invoices') then return public.has_permission(section,action); end if;
    return section='orders' and action in ('view','create','edit');
  end if;
  if public.owns_salesman(sid) then
    if section in ('quotes','invoices') then return public.has_permission(section,action); end if;
    return section='orders' and action in ('view','create','edit');
  end if;
  return false;
end $$;
revoke all on function public.can_document(text,text,text) from public, anon;
grant execute on function public.can_document(text,text,text) to authenticated;

-- 3. Saving an order: the customer must be available to the Manager when it belongs to a
--    team salesman (customers the Manager created already worked).
do $fix2$
declare
  fn regprocedure := to_regprocedure('private.save_document(jsonb,boolean,boolean,uuid)');
  def text; nd text;
  old_chk text := $o$if not found or (not public.is_admin() and not(public.owns_salesman(c.salesman_id) or c.created_by=auth.uid())) then raise exception 'Customer not available'; end if;$o$;
  new_chk text := $n$if not found or (not public.is_admin() and not(public.owns_salesman(c.salesman_id) or c.created_by=auth.uid() or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=c.salesman_id and sm.manager_user_id=auth.uid())))) then raise exception 'Customer not available'; end if;$n$;
begin
  if fn is null then raise notice 'v55.12: save_document signature not found; skipped customer check'; return; end if;
  select pg_get_functiondef(fn) into def;
  if position(old_chk in def) > 0 then
    execute replace(def, old_chk, new_chk);
    raise notice 'v55.12: save_document now accepts customers of the manager''s team';
  else
    raise notice 'v55.12: save_document customer check already updated or different; no change';
  end if;
end
$fix2$;

notify pgrst, 'reload schema';
