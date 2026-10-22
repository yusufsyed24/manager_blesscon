-- Blesscon Candy v39 manager consolidated closing foundation.
-- Apply after the existing schema.sql and operational_modules.sql.
-- Does not alter or weaken salesman daily_closings constraints.
create table if not exists public.manager_daily_closings (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users(id) on delete restrict,
  business_date date not null,
  sales_paisa bigint not null default 0 check (sales_paisa >= 0),
  collections_paisa bigint not null default 0 check (collections_paisa >= 0),
  expenses_paisa bigint not null default 0 check (expenses_paisa >= 0),
  stock_movements jsonb not null default '{}'::jsonb check (jsonb_typeof(stock_movements)='object'),
  expected_cash_paisa bigint not null default 0,
  actual_cash_paisa bigint not null default 0 check (actual_cash_paisa >= 0),
  cash_variance_paisa bigint not null default 0,
  notes text not null default '',
  status text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  submitted_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  decision_reason text not null default '',
  version integer not null default 1 check (version > 0),
  unique(manager_user_id,business_date)
);
create index if not exists manager_daily_closings_status_date on public.manager_daily_closings(status,business_date desc);
alter table public.manager_daily_closings enable row level security;
revoke all on public.manager_daily_closings from anon, authenticated;
grant select on public.manager_daily_closings to authenticated;
drop policy if exists manager_daily_closings_read on public.manager_daily_closings;
create policy manager_daily_closings_read on public.manager_daily_closings for select to authenticated
using (public.is_admin() or manager_user_id=auth.uid());

-- Manager expenses: UI visibility is not sufficient; permit manager role at the
-- save_master backend gate. Other table permissions and row checks stay intact.
create or replace function private.save_master(t text,r jsonb,expected integer default null)
returns jsonb language plpgsql set search_path='' as $$
declare allowed text[]; k text; old jsonb; result jsonb; cols text:=''; vals text:=''; updates text:=''; rid text:=r->>'id'; adm boolean:=public.is_admin(); mgr boolean:=public.is_manager(); begin
case t
 when 'products' then allowed:=array['id','name','category','boxes_per_carton','cost_paisa','retail_paisa','wholesale_paisa','expiry_date','active'];
 when 'price_tiers' then allowed:=array['id','product_id','min_cartons','label','rate_paisa'];
 when 'salesmen' then allowed:=array['id','name','phone','user_id','joining_date','base_salary_paisa','monthly_target','active','off_days'];
 when 'customers' then allowed:=array['id','name','phone','email','address','salesman_id'];
 when 'expenses' then allowed:=array['id','date','category','description','amount_paisa','method','attachment_path','salesman_id','salary_period'];
 when 'settings' then allowed:=array['id','value'];
 else raise exception 'Unsupported table'; end case;
if not adm and not ((t in ('products','price_tiers') and public.has_permission('products','edit')) or t='customers' or (t='expenses' and (mgr or public.has_permission('expenses','create')))) then raise exception 'Admin or authorised permission required'; end if;
if rid is null or length(rid)>180 then raise exception 'Valid record ID required'; end if;
execute format('select to_jsonb(x) from public.%I x where id=$1 for update',t) into old using rid;
if old is not null and expected is distinct from (old->>'version')::integer then raise exception 'CONFLICT: Record changed; refresh and review before saving'; end if;
if not adm and old is not null and old->>'created_by'<>auth.uid()::text then raise exception 'Cannot edit another user record'; end if;
if t='customers' and not adm then select id into k from public.salesmen where user_id=auth.uid() and active and deleted_at is null; if k is null then raise exception 'Active salesman required'; end if; r:=r||jsonb_build_object('salesman_id',k); end if;
if t='salesmen' and (r->>'joining_date')::date < date '2000-01-01' then raise exception 'Joining date before 2000 is not supported'; end if;
if t='settings' then
 if rid<>'business' or jsonb_typeof(r->'value')<>'object' or jsonb_array_length(r->'value'->'working_days')=0 or jsonb_array_length(r->'value'->'tiers')=0 then raise exception 'Settings require working days and tiers'; end if;
 if exists(select 1 from jsonb_array_elements(r->'value'->'tiers') v where (v->>'min')::numeric<0 or (v->>'rate_paisa')::bigint<0) then raise exception 'Invalid tier'; end if;
 if not exists(select 1 from jsonb_array_elements(r->'value'->'tiers') v where (v->>'min')::numeric=0) then raise exception 'First tier must start at zero'; end if;
end if;
r:=(select jsonb_object_agg(key,value) from jsonb_each(r) where key=any(allowed));
foreach k in array allowed loop if r ? k then cols:=cols||format('%I,',k); vals:=vals||format('(jsonb_populate_record(null::public.%I,$1)).%I,',t,k); if k<>'id' then updates:=updates||format('%I=excluded.%I,',k,k); end if; end if; end loop;
if old is null then
 execute format('insert into public.%I (%s updated_by%s) select %s $2%s returning to_jsonb(%I.*)',t,cols,case when t='settings' then '' else ',created_by' end,vals,case when t='settings' then '' else ',$2' end,t) into result using r,auth.uid();
else
 execute format('insert into public.%I (%s updated_by) select %s $2 on conflict(id) do update set %s version=%I.version+1,updated_by=$2,updated_at=now() returning to_jsonb(%I.*)',t,cols,vals,updates||case when t='settings' then '' else 'deleted_at=null,' end,t,t) into result using r,auth.uid();
end if;
return result; end $$;
