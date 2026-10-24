-- BCBM v55.87 (revised): for October 2026, a manager's Week Off is NOT a paid day (salesmen unchanged).
-- Updates the manager's OWN salary estimate in the database so it matches the Admin payroll screen.
-- Back up first. This version tolerates spacing/alias differences (a.status, extra spaces).
-- If it still cannot find the rule, it changes nothing and its error message shows the attendance lines
-- of your live function so the rule can be matched exactly.
do $$
declare
  fdef text;
  newdef text;
  pat constant text := $p$((?:\w+\.)?status)\s+in\s*\(\s*'present'\s*,\s*'late'\s*,\s*'week_off'\s*\)$p$;
  rep constant text := $q$(\1 in ('present','late') or (\1='week_off' and to_char(date_trunc('month',private.business_today()),'YYYY-MM')<>'2026-10'))$q$;
  hits text;
begin
  fdef := pg_get_functiondef('public.own_manager_salary_snapshot()'::regprocedure);
  if fdef like '%<>''2026-10''%' then
    raise exception 'Already updated: the manager function already has the October 2026 Week Off rule. Nothing changed.';
  end if;
  newdef := regexp_replace(fdef, pat, rep, 'gi');
  if newdef = fdef then
    select string_agg(l, E'\n') into hits
    from (select trim(x) as l from regexp_split_to_table(fdef, E'\n') x
          where x ~* 'week_off|status|attendance' limit 25) t;
    raise exception E'Rule not found; nothing was changed. Send these lines to your developer:\n%', coalesce(hits,'(no attendance lines found in function)');
  end if;
  execute newdef;
end $$;

notify pgrst, 'reload schema';

-- Should return true once applied:
select pg_get_functiondef('public.own_manager_salary_snapshot()'::regprocedure) like '%<>''2026-10''%' as manager_weekoff_rule_applied;
