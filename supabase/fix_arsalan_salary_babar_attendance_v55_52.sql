-- BCBM v55.52 — Actual salary net and duplicate attendance correction.
-- Back up Supabase before running. This migration modifies salary snapshot functions only.
-- Arsalan expected calculation: Rs 45,000 monthly / 30 days = Rs 1,500/day;
-- 17 days = Rs 25,500 gross; minus Rs 15,000 outstanding advance = Rs 10,500 net.
-- This migration also deduplicates attendance by calendar date for both employee types.

begin;

do $migration$
declare
  v_salesman_id text;
  v_count integer;
  v_def text;
  v_new text;
  v_att_old text;
  v_att_new text;
  v_mgr_old text;
  v_mgr_new text;
begin
  select count(*) into v_count
  from public.salesmen
  where active is true and deleted_at is null and name ilike '%Arsalan%';

  if v_count <> 1 then
    raise exception 'Expected exactly one active salesman matching Arsalan; found %. No changes made.', v_count;
  end if;

  select id into v_salesman_id
  from public.salesmen
  where active is true and deleted_at is null and name ilike '%Arsalan%'
  limit 1;

  update public.salesmen
     set base_salary_paisa = 4500000,
         payroll_working_days = 30
   where id = v_salesman_id;

  -- Salesman salary snapshot: count at most one attendance unit per date.
  select pg_get_functiondef('public.own_salary_snapshot()'::regprocedure) into v_def;
  v_att_old := $old$select coalesce(sum(case when status in ('present','late','week_off') then 1 when status='half_day' then .5 else 0 end),0) into present_units from public.attendance_records where salesman_id=seller.id and attendance_date between period_start and period_end;$old$;
  v_att_new := $new$select coalesce(sum(day_units),0) into present_units
  from (
    select attendance_date,
      max(case when status in ('present','late','week_off') then 1::numeric
               when status='half_day' then 0.5::numeric else 0::numeric end) as day_units
    from public.attendance_records
    where salesman_id=seller.id and attendance_date between period_start and period_end
    group by attendance_date
  ) daily;$new$;
  if position(v_att_old in v_def) > 0 then
    v_new := replace(v_def, v_att_old, v_att_new);
  elsif position('group by attendance_date' in lower(v_def)) > 0 then
    -- Already deduplicated by a previous deployment; retain that logic.
    v_new := v_def;
  else
    raise exception 'Could not identify attendance calculation in own_salary_snapshot(); no migration committed.';
  end if;

  -- Crucial fix: total_paisa is the estimated net after outstanding advances, not gross.
  if position('''total_paisa'',coalesce(posted,gross)' in v_new) > 0 then
    v_new := replace(v_new,
      '''total_paisa'',coalesce(posted,gross)',
      '''total_paisa'',coalesce(posted,greatest(0,gross-greatest(0,adv_total-adv_recovered)))');
  elsif position('''total_paisa'',coalesce(posted,greatest(0,gross-greatest(0,adv_total-adv_recovered)))' in v_new) = 0 then
    raise exception 'Could not identify total_paisa calculation in own_salary_snapshot(); no migration committed.';
  end if;
  execute v_new;

  -- Manager snapshot: one attendance credit per date and joining-date boundary for Babar.
  select pg_get_functiondef('public.own_manager_salary_snapshot()'::regprocedure) into v_def;
  v_mgr_old := $old$select coalesce(sum(case when status in ('present','late','week_off') then 1 when status='half_day' then .5 else 0 end),0) into present_units from public.manager_attendance_records where manager_user_id=auth.uid() and attendance_date between period_start and period_end;$old$;
  v_mgr_new := $new$select coalesce(sum(day_units),0) into present_units
  from (
    select attendance_date,
      max(case when status in ('present','late','week_off') then 1::numeric
               when status='half_day' then 0.5::numeric else 0::numeric end) as day_units
    from public.manager_attendance_records
    where manager_user_id=auth.uid()
      and attendance_date between period_start and period_end
    group by attendance_date
  ) daily;$new$;
  if position(v_mgr_old in v_def) > 0 then
    v_new := replace(v_def, v_mgr_old, v_mgr_new);
  elsif position('group by attendance_date' in lower(v_def)) > 0 then
    v_new := v_def;
  else
    raise exception 'Could not identify attendance calculation in own_manager_salary_snapshot(); no migration committed.';
  end if;

  -- Keep the manager's estimated total consistent with advance deductions too.
  if position('''total_paisa'',coalesce(posted,gross)' in v_new) > 0 then
    v_new := replace(v_new,
      '''total_paisa'',coalesce(posted,gross)',
      '''total_paisa'',coalesce(posted,greatest(0,gross-greatest(0,adv_total-adv_recovered)))');
  elsif position('''total_paisa'',coalesce(posted,greatest(0,gross-greatest(0,adv_total-adv_recovered)))' in v_new) = 0 then
    raise exception 'Could not identify total_paisa calculation in own_manager_salary_snapshot(); no migration committed.';
  end if;
  execute v_new;
end
$migration$;

revoke all on function public.own_salary_snapshot() from public, anon;
grant execute on function public.own_salary_snapshot() to authenticated;
revoke all on function public.own_manager_salary_snapshot() from public, anon;
grant execute on function public.own_manager_salary_snapshot() to authenticated;

notify pgrst, 'reload schema';
commit;

-- Verify Arsalan's saved salary settings:
select name, base_salary_paisa, payroll_working_days
from public.salesmen
where active is true and deleted_at is null and name ilike '%Arsalan%';

-- Verify Babar's distinct credited attendance dates from 10–23 October 2026:
select p.display_name,
       count(distinct a.attendance_date) filter (
         where a.status in ('present','late','week_off','half_day')
       ) as distinct_credited_dates,
       sum(case when a.status in ('present','late','week_off') then 1
                when a.status='half_day' then 0.5 else 0 end) as raw_row_credits
from public.manager_attendance_records a
join public.profiles p on p.id = a.manager_user_id
where p.display_name ilike 'Babar Ali Khan'
  and a.attendance_date between date '2026-10-10' and date '2026-10-23'
group by p.display_name;
