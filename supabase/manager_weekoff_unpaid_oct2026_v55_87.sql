-- BCBM v55.87: for October 2026, a manager's Week Off is NOT a paid day (salesmen are unchanged).
-- Updates the manager's own salary estimate so it matches the Admin payroll screen.
-- Back up the database first. Safe to re-run: it stops with an error if there is nothing to change.
do $$
declare
  fdef text;
  newdef text;
  old_rule constant text := $r$status in ('present','late','week_off')$r$;
  new_rule constant text := $r$(status in ('present','late') or (status='week_off' and to_char(period_start,'YYYY-MM')<>'2026-10'))$r$;
begin
  fdef := pg_get_functiondef('public.own_manager_salary_snapshot()'::regprocedure);
  if position(old_rule in fdef) = 0 then
    raise exception 'Manager salary function does not contain the expected attendance rule; nothing was changed. It may already be updated.';
  end if;
  newdef := replace(fdef, old_rule, new_rule);
  execute newdef;
end $$;

notify pgrst, 'reload schema';

-- Verify: the definition should now mention '2026-10' next to week_off.
select position($$<>'2026-10'$$ in pg_get_functiondef('public.own_manager_salary_snapshot()'::regprocedure)) > 0 as manager_weekoff_rule_applied;
