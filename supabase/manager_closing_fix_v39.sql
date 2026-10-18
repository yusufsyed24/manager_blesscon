-- v39: Managers can submit the daily closing for ANY active salesman (company-wide, same as the
-- rest of the Manager role). Before this, closing.submit also required salesmen.manager_user_id
-- to equal the manager, so salesmen with no manager assigned (or assigned to another manager)
-- were rejected with "Only the assigned salesman, their manager, or Admin may submit this closing".
-- Safe to re-run. Run once in the Supabase SQL editor AFTER manager_role.sql and closing_balances.sql.
-- Approving / rejecting / reopening a closing stays Admin-only.

do $$
declare
  def text; nd text;
  pat text := 'when ''closing\.submit'' then\s*if not\(.*?\) then raise exception ''[^'']*''; end if;';
  rep text := 'when ''closing.submit'' then
      if not(public.is_admin() or public.is_manager() or public.owns_salesman(sid)) then raise exception ''Only the assigned salesman, a manager, or Admin may submit this closing''; end if;
      if not public.is_admin() and not public.owns_salesman(sid) and not exists(select 1 from public.salesmen sm where sm.id=sid and sm.active and sm.deleted_at is null) then raise exception ''Active salesman required''; end if;';
begin
  select pg_get_functiondef('public.apply_operational_command(uuid,text,jsonb)'::regprocedure) into def;
  if position('public.is_manager() or public.owns_salesman(sid)' in def) > 0 then
    raise notice 'manager_closing_fix_v39: already applied';
    return;
  end if;
  nd := regexp_replace(def, pat, rep);
  if nd = def then
    raise exception 'manager_closing_fix_v39: closing.submit permission check not found; nothing changed';
  end if;
  execute nd;
  raise notice 'manager_closing_fix_v39: applied';
end $$;

-- Managers must be able to read what they close (idempotent; same as manager_role.sql).
drop policy if exists daily_closing_read on public.daily_closings;
create policy daily_closing_read on public.daily_closings for select to authenticated
using (public.is_admin() or public.is_manager() or public.owns_salesman(salesman_id) or public.has_permission('closing'));

-- Optional tidy-up: give unassigned active salesmen to the first active manager so the
-- Manager profile screen lists them. Not needed for closing any more, so left commented out.
-- update public.salesmen set manager_user_id = '<manager user id>'::uuid where active and manager_user_id is null;

notify pgrst, 'reload schema';
