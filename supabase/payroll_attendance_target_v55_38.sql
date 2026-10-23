-- v55.38 additive payroll/attendance upgrade. Back up database before applying.
-- Adds employee-specific payroll settings for salesmen and managers; no business rows are deleted.
alter table public.salesmen add column if not exists payroll_allowance_paisa bigint not null default 0 check (payroll_allowance_paisa >= 0);
alter table public.salesmen add column if not exists payroll_incentive_per_carton_paisa bigint not null default 0 check (payroll_incentive_per_carton_paisa >= 0);
alter table public.salesmen add column if not exists payroll_working_days integer not null default 26 check (payroll_working_days between 1 and 31);
alter table public.salesmen add column if not exists payroll_monthly_target numeric;
update public.salesmen set payroll_monthly_target=monthly_target where payroll_monthly_target is null;

create table if not exists public.manager_payroll_settings (
 manager_user_id uuid primary key references auth.users(id) on delete cascade,
 base_salary_paisa bigint not null default 0 check(base_salary_paisa>=0),
 allowance_paisa bigint not null default 0 check(allowance_paisa>=0),
 incentive_per_carton_paisa bigint not null default 0 check(incentive_per_carton_paisa>=0),
 monthly_target numeric not null default 0 check(monthly_target>=0),
 working_days integer not null default 26 check(working_days between 1 and 31),
 updated_at timestamptz not null default now()
);
alter table public.manager_payroll_settings enable row level security;
drop policy if exists manager_payroll_admin_manage on public.manager_payroll_settings;
create policy manager_payroll_admin_manage on public.manager_payroll_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists manager_payroll_self_read on public.manager_payroll_settings;
create policy manager_payroll_self_read on public.manager_payroll_settings for select to authenticated using(manager_user_id=auth.uid());
grant select,insert,update,delete on public.manager_payroll_settings to authenticated;

-- Payroll snapshot functions are intentionally kept separate from salary release records.
-- Estimates use present/late/week_off = full paid day, half_day = half day; absent/leave/pending = zero.
create or replace function public.own_salary_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare seller public.salesmen; period_start date; period_end date; achieved numeric:=0; achieved_boxes bigint:=0; present_units numeric:=0; base_pay bigint:=0; base_monthly bigint:=0; allowance bigint:=0; per_carton bigint:=0; target_cartons numeric:=0; incentive bigint:=0; gross bigint:=0; adv_total bigint:=0; adv_recovered bigint:=0; posted bigint; workdays integer:=26;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into seller from public.salesmen where user_id=auth.uid() and active and deleted_at is null limit 1;
 if not found then raise exception 'No active salesman profile is linked to this login'; end if;
 period_start:=date_trunc('month',private.business_today())::date; period_end:=private.business_today();
 select coalesce(sum(i.boxes::numeric/nullif(i.boxes_per_carton,0)),0),coalesce(sum(i.boxes),0)::bigint into achieved,achieved_boxes from public.orders o join public.order_items i on i.order_id=o.id where o.salesman_id=seller.id and o.date between period_start and period_end and o.status='confirmed' and o.deleted_at is null;
 select coalesce(sum(case when status in ('present','late','week_off') then 1 when status='half_day' then .5 else 0 end),0) into present_units from public.attendance_records where salesman_id=seller.id and attendance_date between period_start and period_end;
 workdays:=greatest(1,coalesce(seller.payroll_working_days,26));
 base_pay:=greatest(0,coalesce(seller.base_salary_paisa,0)); base_monthly:=base_pay; allowance:=greatest(0,coalesce(seller.payroll_allowance_paisa,0)); per_carton:=greatest(0,coalesce(seller.payroll_incentive_per_carton_paisa,0)); target_cartons:=greatest(0,coalesce(seller.payroll_monthly_target,seller.monthly_target,0));
 base_pay:=round(base_pay*least(1,present_units/workdays))::bigint; allowance:=round(allowance*least(1,present_units/workdays))::bigint;
 incentive:=greatest(0,round(greatest(0,achieved-target_cartons)*per_carton))::bigint; gross:=base_pay+allowance+incentive;
 select coalesce(sum(greatest(0,amount_paisa)),0),coalesce(sum(greatest(0,recovered_paisa)),0) into adv_total,adv_recovered from public.employee_salary_advances where salesman_id=seller.id and status='posted';
 select amount_paisa into posted from public.expenses where salesman_id=seller.id and salary_period=to_char(period_start,'YYYY-MM') and deleted_at is null limit 1;
 return jsonb_build_object('salary_period',to_char(period_start,'YYYY-MM'),'status',case when posted is null then 'estimate' else 'posted' end,'base_salary_paisa',base_pay,'base_salary_monthly_paisa',base_monthly,'allowance_paisa',allowance,'incentive_per_carton_paisa',per_carton,'incentive_paisa',incentive,'gross_paisa',gross,'total_paisa',coalesce(posted,gross),'monthly_target',target_cartons,'achieved_cartons',achieved,'achieved_boxes',achieved_boxes,'attendance_days',present_units,'working_days',workdays,'advance_total_paisa',adv_total,'advance_recovered_paisa',adv_recovered,'advance_outstanding_paisa',greatest(0,adv_total-adv_recovered),'estimated_net_after_outstanding_advances_paisa',greatest(0,gross-greatest(0,adv_total-adv_recovered)),'achievement_percent',case when target_cartons>0 then achieved/target_cartons*100 else 0 end);
end $$;

create or replace function public.own_manager_salary_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.manager_payroll_settings; period_start date; period_end date; achieved numeric:=0; achieved_boxes bigint:=0; present_units numeric:=0; base_pay bigint:=0; base_monthly bigint:=0; allowance bigint:=0; per_carton bigint:=0; target_cartons numeric:=0; incentive bigint:=0; gross bigint:=0; adv_total bigint:=0; adv_recovered bigint:=0; posted bigint; workdays integer:=26;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='manager') then raise exception 'Manager account required'; end if;
 period_start:=date_trunc('month',private.business_today())::date; period_end:=private.business_today();
 select * into cfg from public.manager_payroll_settings where manager_user_id=auth.uid();
 select coalesce(sum(i.boxes::numeric/nullif(i.boxes_per_carton,0)),0),coalesce(sum(i.boxes),0)::bigint into achieved,achieved_boxes from public.orders o join public.order_items i on i.order_id=o.id where o.created_by=auth.uid() and o.salesman_id is null and o.date between period_start and period_end and o.status='confirmed' and o.deleted_at is null;
 select coalesce(sum(case when status in ('present','late','week_off') then 1 when status='half_day' then .5 else 0 end),0) into present_units from public.manager_attendance_records where manager_user_id=auth.uid() and attendance_date between period_start and period_end;
 workdays:=greatest(1,coalesce(cfg.working_days,26)); target_cartons:=greatest(0,coalesce(cfg.monthly_target,0)); base_pay:=greatest(0,coalesce(cfg.base_salary_paisa,0)); base_monthly:=base_pay; allowance:=greatest(0,coalesce(cfg.allowance_paisa,0)); per_carton:=greatest(0,coalesce(cfg.incentive_per_carton_paisa,0));
 base_pay:=round(base_pay*least(1,present_units/workdays))::bigint; allowance:=round(allowance*least(1,present_units/workdays))::bigint; incentive:=greatest(0,round(greatest(0,achieved-target_cartons)*per_carton))::bigint; gross:=base_pay+allowance+incentive;
 select coalesce(sum(greatest(0,amount_paisa)),0),coalesce(sum(greatest(0,recovered_paisa)),0) into adv_total,adv_recovered from public.employee_salary_advances where manager_user_id=auth.uid() and status='posted';
 select amount_paisa into posted from public.expenses where manager_user_id=auth.uid() and salary_period=to_char(period_start,'YYYY-MM') and deleted_at is null limit 1;
 return jsonb_build_object('salary_period',to_char(period_start,'YYYY-MM'),'status',case when posted is null then 'estimate' else 'posted' end,'base_salary_paisa',base_pay,'base_salary_monthly_paisa',base_monthly,'allowance_paisa',allowance,'incentive_per_carton_paisa',per_carton,'incentive_paisa',incentive,'gross_paisa',gross,'total_paisa',coalesce(posted,gross),'monthly_target',target_cartons,'achieved_cartons',achieved,'achieved_boxes',achieved_boxes,'attendance_days',present_units,'working_days',workdays,'advance_total_paisa',adv_total,'advance_recovered_paisa',adv_recovered,'advance_outstanding_paisa',greatest(0,adv_total-adv_recovered),'estimated_net_after_outstanding_advances_paisa',greatest(0,gross-greatest(0,adv_total-adv_recovered)));
end $$;
revoke all on function public.own_salary_snapshot() from public,anon; grant execute on function public.own_salary_snapshot() to authenticated;
revoke all on function public.own_manager_salary_snapshot() from public,anon; grant execute on function public.own_manager_salary_snapshot() to authenticated;
notify pgrst,'reload schema';
