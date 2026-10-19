-- Blesscon Candy Business Manager v55.7
-- Fixes manager assignment visibility for both Admin and assigned Manager.
-- Safe to re-run. Does not delete or reset business data.

alter table public.salesmen
  add column if not exists manager_user_id uuid references auth.users(id) on delete set null;

-- Ensure the save RPC accepts manager_user_id. Patch only the known legacy allow-list;
-- stop with an explicit error if the live function is materially different.
do $fix$
declare
  fn_oid oid := to_regprocedure('private.save_master(text,jsonb,integer)');
  fn_def text;
  patched text;
  old_clause text := $old$when 'salesmen' then allowed:=array['id','name','phone','user_id','joining_date','base_salary_paisa','monthly_target','active','off_days'];$old$;
  new_clause text := $new$when 'salesmen' then allowed:=array['id','name','phone','user_id','manager_user_id','joining_date','base_salary_paisa','monthly_target','active','off_days'];$new$;
begin
  if fn_oid is null then
    raise exception 'Could not find private.save_master(text,jsonb,integer). Confirm the Blesscon schema is installed.';
  end if;
  fn_def := pg_get_functiondef(fn_oid);
  if position(new_clause in fn_def) > 0 then
    raise notice 'Salesman manager assignment is already included in private.save_master().';
  elsif position(old_clause in fn_def) > 0 then
    patched := replace(fn_def, old_clause, new_clause);
    execute patched;
    raise notice 'Updated private.save_master() to save manager_user_id.';
  else
    raise exception 'Could not safely patch private.save_master(): expected salesmen field allow-list not found. No function change was applied.';
  end if;
end
$fix$;

-- Replace the read policy. Admin always sees every non-deleted salesman in the app;
-- a Manager sees the rows assigned to their own authenticated user ID.
grant select on public.salesmen to authenticated;
drop policy if exists salesman_read on public.salesmen;
create policy salesman_read on public.salesmen
  for select to authenticated
  using (
    public.is_admin()
    or public.owns_salesman(id)
    or (
      manager_user_id = auth.uid()
      and exists (
        select 1 from public.user_roles ur
        join public.profiles pr on pr.id = ur.user_id and pr.active
        where ur.user_id = auth.uid() and ur.role = 'manager'
      )
    )
  );

notify pgrst, 'reload schema';
