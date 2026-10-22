-- v55.37 configurable carton-based payroll for salesmen and managers.
-- Admin sets role defaults in Settings. Existing base salary remains the salesman base.
-- New allowance/incentive settings default to zero; no rates are invented.

create or replace function public.own_salary_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  seller public.salesmen;
  cfg jsonb;
  period_start date;
  achieved numeric := 0;
  achieved_boxes bigint := 0;
  posted bigint;
  base_pay bigint := 0;
  allowance bigint := 0;
  per_carton bigint := 0;
  incentive bigint := 0;
  gross bigint := 0;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into seller from public.salesmen where user_id=auth.uid() and active and deleted_at is null limit 1;
  if not found then raise exception 'No active salesman profile is linked to this login'; end if;
  period_start := date_trunc('month', private.business_today())::date;
  select value into cfg from public.settings where id='business';
  select coalesce(sum(i.boxes::numeric/nullif(i.boxes_per_carton,0)),0), coalesce(sum(i.boxes),0)::bigint
    into achieved, achieved_boxes
  from public.orders o join public.order_items i on i.order_id=o.id
  where o.salesman_id=seller.id and o.date between period_start and private.business_today()
    and o.status='confirmed' and o.deleted_at is null;
  base_pay := coalesce(seller.base_salary_paisa, coalesce((cfg->>'base_salary_paisa')::bigint,0));
  allowance := greatest(0,coalesce((cfg->>'salesman_allowance_paisa')::bigint,0));
  per_carton := greatest(0,coalesce((cfg->>'salesman_incentive_per_carton_paisa')::bigint,0));
  incentive := greatest(0,round(achieved*per_carton)::bigint);
  gross := base_pay + allowance + incentive;
  select amount_paisa into posted from public.expenses where salesman_id=seller.id and salary_period=to_char(period_start,'YYYY-MM') and deleted_at is null limit 1;
  result := jsonb_build_object('salary_period',to_char(period_start,'YYYY-MM'),'status',case when posted is null then 'estimate' else 'posted' end,
    'base_salary_paisa',base_pay,'allowance_paisa',allowance,'incentive_per_carton_paisa',per_carton,
    'incentive_paisa',incentive,'gross_paisa',gross,'total_paisa',coalesce(posted,gross),
    'monthly_target',seller.monthly_target,'achieved_cartons',achieved,'achieved_boxes',achieved_boxes,
    'achievement_percent',case when coalesce(seller.monthly_target,0)>0 then achieved/seller.monthly_target*100 else 0 end);
  return result;
end $$;

create or replace function public.own_manager_salary_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  cfg jsonb;
  period_start date;
  achieved numeric := 0;
  achieved_boxes bigint := 0;
  base_pay bigint := 0;
  allowance bigint := 0;
  per_carton bigint := 0;
  incentive bigint := 0;
  gross bigint := 0;
  posted bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.user_roles r where r.user_id=auth.uid() and r.role='manager') then raise exception 'Manager account required'; end if;
  period_start := date_trunc('month', private.business_today())::date;
  select value into cfg from public.settings where id='business';
  -- Manager's own confirmed orders only; these do not enter the team target.
  select coalesce(sum(i.boxes::numeric/nullif(i.boxes_per_carton,0)),0),coalesce(sum(i.boxes),0)::bigint
    into achieved, achieved_boxes
  from public.orders o join public.order_items i on i.order_id=o.id
  where o.created_by=auth.uid() and o.salesman_id is null and o.date between period_start and private.business_today()
    and o.status='confirmed' and o.deleted_at is null;
  base_pay := greatest(0,coalesce((cfg->>'manager_base_salary_paisa')::bigint,(cfg->>'base_salary_paisa')::bigint,0));
  allowance := greatest(0,coalesce((cfg->>'manager_allowance_paisa')::bigint,0));
  per_carton := greatest(0,coalesce((cfg->>'manager_incentive_per_carton_paisa')::bigint,0));
  incentive := greatest(0,round(achieved*per_carton)::bigint);
  gross := base_pay+allowance+incentive;
  select amount_paisa into posted from public.expenses where manager_user_id=auth.uid() and salary_period=to_char(period_start,'YYYY-MM') and deleted_at is null limit 1;
  return jsonb_build_object('salary_period',to_char(period_start,'YYYY-MM'),'status',case when posted is null then 'estimate' else 'estimate' end,
    'base_salary_paisa',base_pay,'allowance_paisa',allowance,'incentive_per_carton_paisa',per_carton,'incentive_paisa',incentive,
    'gross_paisa',gross,'total_paisa',coalesce(posted,gross),'achieved_cartons',achieved,'achieved_boxes',achieved_boxes);
end $$;

revoke all on function public.own_salary_snapshot() from public, anon;
revoke all on function public.own_manager_salary_snapshot() from public, anon;
grant execute on function public.own_salary_snapshot() to authenticated;
grant execute on function public.own_manager_salary_snapshot() to authenticated;
notify pgrst, 'reload schema';
