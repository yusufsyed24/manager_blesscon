-- v55.14: keep salesman UI limited to My Profile and calculate salary achievement
-- from confirmed sales-order quantities, rather than stale daily-target rollups.
-- This migration does not delete or alter existing orders, targets, salaries or documents.

create or replace function public.own_salary_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  seller public.salesmen;
  cfg jsonb;
  period_start date;
  achieved numeric := 0;
  achieved_boxes bigint := 0;
  pct numeric := 0;
  incentive bigint := 0;
  posted bigint;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into seller
  from public.salesmen
  where user_id=auth.uid() and active and deleted_at is null
  limit 1;
  if not found then raise exception 'No active salesman profile is linked to this login'; end if;

  period_start := date_trunc('month', private.business_today())::date;
  select value into cfg from public.settings where id='business';

  -- Carton-equivalent achievement is calculated from actual confirmed order lines.
  -- Boxes / boxes_per_carton correctly includes loose boxes and mixed product packs.
  select
    coalesce(sum(i.boxes::numeric / nullif(i.boxes_per_carton,0)),0),
    coalesce(sum(i.boxes),0)::bigint
  into achieved, achieved_boxes
  from public.orders o
  join public.order_items i on i.order_id=o.id
  where o.salesman_id=seller.id
    and o.date between period_start and private.business_today()
    and o.status='confirmed'
    and o.deleted_at is null;

  pct := case when coalesce(seller.monthly_target,0)>0 then achieved / seller.monthly_target * 100 else 0 end;

  select coalesce((x->>'amount_paisa')::bigint,0) into incentive
  from jsonb_array_elements(coalesce(cfg->'incentives','[]'::jsonb)) x
  where coalesce((x->>'min')::numeric,0)<=pct
  order by coalesce((x->>'min')::numeric,0) desc
  limit 1;
  incentive := coalesce(incentive,0);

  -- A posted salary remains authoritative; only estimates use the current sales calculation.
  select amount_paisa into posted
  from public.expenses
  where salesman_id=seller.id
    and salary_period=to_char(period_start,'YYYY-MM')
    and deleted_at is null
  limit 1;

  result := jsonb_build_object(
    'salary_period',to_char(period_start,'YYYY-MM'),
    'status',case when posted is null then 'estimate' else 'posted' end,
    'base_salary_paisa',seller.base_salary_paisa,
    'incentive_paisa',case when posted is null then incentive else greatest(0,posted-seller.base_salary_paisa) end,
    'total_paisa',coalesce(posted,seller.base_salary_paisa+incentive),
    'monthly_target',seller.monthly_target,
    'achieved_cartons',achieved,
    'achieved_boxes',achieved_boxes,
    'achievement_percent',pct
  );
  return result;
end $$;

revoke all on function public.own_salary_snapshot() from public, anon;
grant execute on function public.own_salary_snapshot() to authenticated;
notify pgrst, 'reload schema';
