-- BCBM v55.51: correct Arsalan's daily-rate salary and Babar's attendance count.
-- Back up the database before running. This migration preserves attendance rows and salary records.

begin;

-- Arsalan's agreed salary basis: PKR 45,000 / 30 calendar days = PKR 1,500/day.
-- His 17 credited days therefore earn PKR 25,500 before the PKR 15,000 advance.
do $$
declare v_salesman_id text; v_matches integer;
begin
  select count(*) into v_matches
  from public.salesmen
  where active is true and deleted_at is null and name ilike '%Arsalan%';
  if v_matches <> 1 then
    raise exception 'Expected exactly one active salesman matching Arsalan; found %. No salary settings changed.', v_matches;
  end if;
  select id into v_salesman_id
  from public.salesmen
  where active is true and deleted_at is null and name ilike '%Arsalan%'
  limit 1;
  update public.salesmen
  set base_salary_paisa = 4500000,
      payroll_working_days = 30,
      updated_at = now()
  where id = v_salesman_id;
end $$;

create or replace function public.own_salary_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 seller public.salesmen;
 period_start date;
 period_end date;
 achieved numeric:=0;
 achieved_boxes bigint:=0;
 present_units numeric:=0;
 base_pay bigint:=0;
 base_monthly bigint:=0;
 allowance bigint:=0;
 per_carton bigint:=0;
 target_cartons numeric:=0;
 incentive bigint:=0;
 gross bigint:=0;
 adv_total bigint:=0;
 adv_recovered bigint:=0;
 adv_outstanding bigint:=0;
 posted bigint;
 workdays integer:=30;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into seller from public.salesmen
 where user_id=auth.uid() and active and deleted_at is null limit 1;
 if not found then raise exception 'No active salesman profile is linked to this login'; end if;

 period_start:=date_trunc('month',private.business_today())::date;
 period_end:=private.business_today();

 select coalesce(sum(i.boxes::numeric/nullif(i.boxes_per_carton,0)),0),
        coalesce(sum(i.boxes),0)::bigint
 into achieved,achieved_boxes
 from public.orders o
 join public.order_items i on i.order_id=o.id
 where o.salesman_id=seller.id and o.date between period_start and period_end
   and o.status='confirmed' and o.deleted_at is null;

 -- One attendance credit per calendar date, even if duplicate records exist.
 select coalesce(sum(day_units),0) into present_units
 from (
   select attendance_date,
     max(case when status in ('present','late','week_off') then 1::numeric
              when status='half_day' then 0.5::numeric else 0::numeric end) as day_units
   from public.attendance_records
   where salesman_id=seller.id and attendance_date between period_start and period_end
   group by attendance_date
 ) daily;

 workdays:=greatest(1,coalesce(seller.payroll_working_days,30));
 base_monthly:=greatest(0,coalesce(seller.base_salary_paisa,0));
 base_pay:=round(base_monthly*least(1,present_units/workdays))::bigint;
 allowance:=greatest(0,coalesce(seller.payroll_allowance_paisa,0));
 allowance:=round(allowance*least(1,present_units/workdays))::bigint;
 per_carton:=greatest(0,coalesce(seller.payroll_incentive_per_carton_paisa,0));
 target_cartons:=greatest(0,coalesce(seller.payroll_monthly_target,seller.monthly_target,0));
 incentive:=greatest(0,round(greatest(0,achieved-target_cartons)*per_carton))::bigint;
 gross:=base_pay+allowance+incentive;

 select coalesce(sum(greatest(0,amount_paisa)),0),
        coalesce(sum(greatest(0,recovered_paisa)),0)
 into adv_total,adv_recovered
 from public.employee_salary_advances
 where salesman_id=seller.id and status='posted';
 adv_outstanding:=greatest(0,adv_total-adv_recovered);

 select amount_paisa into posted
 from public.expenses
 where salesman_id=seller.id
   and salary_period=to_char(period_start,'YYYY-MM')
   and deleted_at is null
 limit 1;

 return jsonb_build_object(
   'salary_period',to_char(period_start,'YYYY-MM'),
   'status',case when posted is null then 'estimate' else 'posted' end,
   'base_salary_paisa',base_pay,
   'base_salary_monthly_paisa',base_monthly,
   'allowance_paisa',allowance,
   'incentive_per_carton_paisa',per_carton,
   'incentive_paisa',incentive,
   'gross_paisa',gross,
   'total_paisa',case when posted is null then greatest(0,gross-adv_outstanding) else posted end,
   'monthly_target',target_cartons,
   'achieved_cartons',achieved,
   'achieved_boxes',achieved_boxes,
   'attendance_days',present_units,
   'working_days',workdays,
   'advance_total_paisa',adv_total,
   'advance_recovered_paisa',adv_recovered,
   'advance_outstanding_paisa',adv_outstanding,
   'estimated_net_after_outstanding_advances_paisa',greatest(0,gross-adv_outstanding),
   'achievement_percent',case when target_cartons>0 then achieved/target_cartons*100 else 0 end
 );
end $$;

create or replace function public.own_manager_salary_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 cfg public.manager_payroll_settings;
 period_start date;
 period_end date;
 manager_start date;
 is_babar boolean:=false;
 achieved numeric:=0;
 achieved_boxes bigint:=0;
 present_units numeric:=0;
 base_pay bigint:=0;
 base_monthly bigint:=0;
 allowance bigint:=0;
 per_carton bigint:=0;
 target_cartons numeric:=0;
 incentive bigint:=0;
 gross bigint:=0;
 adv_total bigint:=0;
 adv_recovered bigint:=0;
 posted bigint;
 workdays integer:=26;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='manager') then
   raise exception 'Manager account required';
 end if;

 period_start:=date_trunc('month',private.business_today())::date;
 period_end:=private.business_today();
 select (p.display_name ilike 'Babar Ali Khan')
 into is_babar from public.profiles p where p.id=auth.uid();
 if coalesce(is_babar,false) then manager_start:=date '2026-10-10'; end if;

 select * into cfg from public.manager_payroll_settings where manager_user_id=auth.uid();

 select coalesce(sum(i.boxes::numeric/nullif(i.boxes_per_carton,0)),0),
        coalesce(sum(i.boxes),0)::bigint
 into achieved,achieved_boxes
 from public.orders o join public.order_items i on i.order_id=o.id
 where o.created_by=auth.uid() and o.salesman_id is null
   and o.date between period_start and period_end
   and o.status='confirmed' and o.deleted_at is null;

 -- Count no more than one attendance credit per date. Babar's service begins 10 Oct 2026.
 select coalesce(sum(day_units),0) into present_units
 from (
   select attendance_date,
     max(case when status in ('present','late','week_off') then 1::numeric
              when status='half_day' then 0.5::numeric else 0::numeric end) as day_units
   from public.manager_attendance_records
   where manager_user_id=auth.uid()
     and attendance_date between greatest(period_start,coalesce(manager_start,period_start)) and period_end
   group by attendance_date
 ) daily;

 workdays:=greatest(1,coalesce(cfg.working_days,26));
 target_cartons:=greatest(0,coalesce(cfg.monthly_target,0));
 base_monthly:=greatest(0,coalesce(cfg.base_salary_paisa,0));
 base_pay:=round(base_monthly*least(1,present_units/workdays))::bigint;
 allowance:=greatest(0,coalesce(cfg.allowance_paisa,0));
 allowance:=round(allowance*least(1,present_units/workdays))::bigint;
 per_carton:=greatest(0,coalesce(cfg.incentive_per_carton_paisa,0));
 incentive:=greatest(0,round(greatest(0,achieved-target_cartons)*per_carton))::bigint;
 gross:=base_pay+allowance+incentive;

 select coalesce(sum(greatest(0,amount_paisa)),0),
        coalesce(sum(greatest(0,recovered_paisa)),0)
 into adv_total,adv_recovered
 from public.employee_salary_advances
 where manager_user_id=auth.uid() and status='posted';

 select amount_paisa into posted
 from public.expenses
 where manager_user_id=auth.uid()
   and salary_period=to_char(period_start,'YYYY-MM')
   and deleted_at is null limit 1;

 return jsonb_build_object(
   'salary_period',to_char(period_start,'YYYY-MM'),
   'status',case when posted is null then 'estimate' else 'posted' end,
   'base_salary_paisa',base_pay,
   'base_salary_monthly_paisa',base_monthly,
   'allowance_paisa',allowance,
   'incentive_per_carton_paisa',per_carton,
   'incentive_paisa',incentive,
   'gross_paisa',gross,
   'total_paisa',coalesce(posted,gross),
   'monthly_target',target_cartons,
   'achieved_cartons',achieved,
   'achieved_boxes',achieved_boxes,
   'attendance_days',present_units,
   'working_days',workdays,
   'advance_total_paisa',adv_total,
   'advance_recovered_paisa',adv_recovered,
   'advance_outstanding_paisa',greatest(0,adv_total-adv_recovered),
   'estimated_net_after_outstanding_advances_paisa',greatest(0,gross-greatest(0,adv_total-adv_recovered))
 );
end $$;

revoke all on function public.own_salary_snapshot() from public, anon;
grant execute on function public.own_salary_snapshot() to authenticated;
revoke all on function public.own_manager_salary_snapshot() from public, anon;
grant execute on function public.own_manager_salary_snapshot() to authenticated;

notify pgrst, 'reload schema';
commit;

-- Verification: Arsalan should use 30 working days and 45,000 monthly base.
select name, base_salary_paisa, payroll_working_days
from public.salesmen
where active is true and deleted_at is null and name ilike '%Arsalan%';

-- Verification: Babar's credited dates should be 14 distinct days from 10–23 Oct.
select p.display_name, count(distinct a.attendance_date) as distinct_attendance_dates,
       sum(case when a.status in ('present','late','week_off') then 1
                when a.status='half_day' then 0.5 else 0 end) as raw_credits
from public.manager_attendance_records a
join public.profiles p on p.id=a.manager_user_id
where p.display_name ilike 'Babar Ali Khan'
  and a.attendance_date between date '2026-10-10' and date '2026-10-23'
group by p.display_name;
