-- Blesscon Candy Business Manager v55.6
-- Fix: private.save_master() previously dropped manager_user_id from the salesmen
-- allowed-field list, so the UI appeared to save assignments but they were not persisted.
-- Safe to re-run. Does not reset or delete business data.

alter table public.salesmen
  add column if not exists manager_user_id uuid references auth.users(id) on delete set null;

do $fix$
declare
  fn_oid oid := to_regprocedure('private.save_master(text,jsonb,integer)');
  fn_def text;
  patched text;
  old_clause text := $old$when 'salesmen' then allowed:=array['id','name','phone','user_id','joining_date','base_salary_paisa','monthly_target','active','off_days'];$old$;
  new_clause text := $new$when 'salesmen' then allowed:=array['id','name','phone','user_id','manager_user_id','joining_date','base_salary_paisa','monthly_target','active','off_days'];$new$;
begin
  if fn_oid is null then
    raise exception 'Could not find private.save_master(text,jsonb,integer). Confirm the main Blesscon schema has been installed before running this fix.';
  end if;
  fn_def := pg_get_functiondef(fn_oid);
  if position('manager_user_id' in fn_def) > 0 and position(new_clause in fn_def) > 0 then
    raise notice 'Salesman manager assignment is already supported by private.save_master().';
    return;
  end if;
  patched := replace(fn_def, old_clause, new_clause);
  if patched = fn_def then
    raise exception 'Could not safely patch private.save_master(): expected salesmen allowed-field list was not found. No function change was applied.';
  end if;
  execute patched;
  raise notice 'Patched private.save_master(): manager_user_id can now be saved for salesmen.';
end
$fix$;

-- Managers must be able to read the salesman rows assigned to them.
grant select on public.salesmen to authenticated;
drop policy if exists salesman_read on public.salesmen;
create policy salesman_read on public.salesmen
  for select to authenticated
  using (public.is_admin() or (public.is_manager() and manager_user_id = auth.uid()) or public.owns_salesman(id));

notify pgrst, 'reload schema';
