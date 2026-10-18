-- v40: Manager consolidated daily closing, manager expenses, Admin approval of manager closings.
--
-- Run ONCE in the Supabase SQL editor, AFTER schema.sql, operational_modules.sql, cash_bank_book.sql,
-- manager_role.sql, manager_profile_fieldwork.sql and manager_closing_fix_v39.sql. Safe to re-run.
-- It does not delete or rewrite existing data and does not create any dummy salesman.
--
--  1. Manager expenses: a manager can view and add daily expenses; the database enforces scope.
--  2. Manager team closing: ONE closing per manager per business date, for the manager's assigned
--     team (salesmen.manager_user_id = manager) plus the manager's own direct sales / own expenses.
--  3. Admin approval: Admin (only) approves, rejects or reopens; the decision, who and when are stored.
--  4. Day lock: once a manager closing is submitted/approved, the covered transactions are locked
--     until Admin rejects or reopens it (same rule as salesman closings).

-- ---------------------------------------------------------------------------------------------
-- 0. Prerequisites
-- ---------------------------------------------------------------------------------------------
alter table public.salesmen
  add column if not exists manager_user_id uuid references auth.users(id) on delete set null;
create index if not exists salesmen_manager_idx on public.salesmen(manager_user_id, active);

-- ---------------------------------------------------------------------------------------------
-- 1. Manager expenses
-- ---------------------------------------------------------------------------------------------
-- A manager sees expenses he created, and expenses linked to his assigned salesmen. Nothing else.
create or replace function public.manager_expense_visible(p_created_by uuid, p_salesman_id text)
returns boolean language sql stable security definer set search_path=''
as $$
  select public.is_manager() and (
    p_created_by = auth.uid()
    or (p_salesman_id is not null and exists(
      select 1 from public.salesmen s where s.id = p_salesman_id and s.manager_user_id = auth.uid()))
  )
$$;
revoke all on function public.manager_expense_visible(uuid,text) from public, anon;
grant execute on function public.manager_expense_visible(uuid,text) to authenticated;

drop policy if exists expense_manager_read on public.expenses;
create policy expense_manager_read on public.expenses for select to authenticated
using (public.manager_expense_visible(created_by, salesman_id));

-- Writes go through private.save_master (called by apply_command). Patch it in place.
do $mig$
declare def text; nd text;
begin
  select pg_get_functiondef('private.save_master(text,jsonb,integer)'::regprocedure) into def;
  if position('manager_expense_rules' in def) > 0 then
    raise notice 'manager_closing_expenses_v40: save_master already patched';
    return;
  end if;
  nd := replace(def,
    $q$(t='expenses' and public.has_permission('expenses','create'))$q$,
    $q$(t='expenses' and (public.has_permission('expenses','create') or public.is_manager()))$q$);
  if nd = def then
    raise exception 'manager_closing_expenses_v40: save_master permission check not found; nothing changed';
  end if;
  def := nd;
  nd := replace(def,
    $q$if not adm and old is not null and old->>'created_by'<>auth.uid()::text then raise exception 'Cannot edit another user record'; end if;$q$,
    $q$if not adm and old is not null and old->>'created_by'<>auth.uid()::text then raise exception 'Cannot edit another user record'; end if;
-- manager_expense_rules: a manager may add/edit only his own daily expenses, never salary, never for salesmen outside his team.
if t='expenses' and not adm and public.is_manager() then
  if nullif(r->>'salary_period','') is not null then raise exception 'Managers cannot post salary expenses'; end if;
  if nullif(r->>'salesman_id','') is not null and not exists(select 1 from public.salesmen s where s.id=r->>'salesman_id' and s.manager_user_id=auth.uid() and s.active and s.deleted_at is null) then raise exception 'Expenses can only be linked to your assigned salesmen'; end if;
  if nullif(r->>'date','') is not null and (r->>'date')::date > private.business_today() then raise exception 'An expense cannot be dated in the future'; end if;
end if;$q$);
  if nd = def then
    raise exception 'manager_closing_expenses_v40: save_master ownership check not found; nothing changed';
  end if;
  execute nd;
  raise notice 'manager_closing_expenses_v40: save_master patched';
end $mig$;

-- Receipt images: managers may upload to their own folder and read receipts they uploaded.
do $mig$
begin
  if to_regclass('storage.buckets') is not null then
    execute $q$drop policy if exists blesscon_receipt_read on storage.objects$q$;
    execute $q$create policy blesscon_receipt_read on storage.objects for select to authenticated using (bucket_id='expense-receipts' and (public.is_admin() or ((storage.foldername(name))[1]=auth.uid()::text and (public.has_permission('expenses','view') or public.is_manager()))))$q$;
    execute $q$drop policy if exists blesscon_receipt_insert on storage.objects$q$;
    execute $q$create policy blesscon_receipt_insert on storage.objects for insert to authenticated with check (bucket_id='expense-receipts' and (storage.foldername(name))[1]=auth.uid()::text and (public.has_permission('expenses','create') or public.is_manager()))$q$;
  end if;
end $mig$;

-- ---------------------------------------------------------------------------------------------
-- 2. Manager consolidated daily closing
-- ---------------------------------------------------------------------------------------------
create table if not exists public.manager_daily_closings (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users(id),
  business_date date not null,
  team_salesman_ids text[] not null default '{}',
  sales_count integer not null default 0,
  sales_total_paisa bigint not null default 0,
  collections_by_method jsonb not null default '{}'::jsonb,
  collections_total_paisa bigint not null default 0,
  cash_received_paisa bigint not null default 0,
  expenses_total_paisa bigint not null default 0,
  cash_expenses_paisa bigint not null default 0,
  stock_movements jsonb not null default '{}'::jsonb,
  opening_cash_paisa bigint not null default 0 check (opening_cash_paisa >= 0),
  cash_handed_over_paisa bigint not null default 0 check (cash_handed_over_paisa >= 0),
  expected_cash_paisa bigint not null default 0,
  actual_cash_paisa bigint not null default 0 check (actual_cash_paisa >= 0),
  cash_variance_paisa bigint not null default 0,
  cash_in_bank_paisa bigint not null default 0 check (cash_in_bank_paisa >= 0),
  cash_in_hand_paisa bigint not null default 0 check (cash_in_hand_paisa >= 0),
  cash_in_easypaisa_paisa bigint not null default 0 check (cash_in_easypaisa_paisa >= 0),
  cash_in_jazzcash_paisa bigint not null default 0 check (cash_in_jazzcash_paisa >= 0),
  market_credit_paisa bigint not null default 0 check (market_credit_paisa >= 0),
  expected_stock jsonb not null default '{}'::jsonb,
  actual_stock jsonb not null default '{}'::jsonb,
  stock_variances jsonb not null default '{}'::jsonb,
  reason text not null default '',
  notes text not null default '',
  status text not null default 'submitted' check (status in ('submitted','approved','rejected','reopened')),
  version integer not null default 1,
  submitted_by uuid,
  submitted_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  decision_by uuid,
  decision_at timestamptz,
  decision_reason text not null default '',
  created_at timestamptz not null default now(),
  unique (manager_user_id, business_date)
);
create index if not exists manager_daily_closings_date_status on public.manager_daily_closings(business_date, status);

alter table public.manager_daily_closings enable row level security;
revoke all on public.manager_daily_closings from anon, authenticated;
grant select on public.manager_daily_closings to authenticated;
drop policy if exists manager_closing_read on public.manager_daily_closings;
create policy manager_closing_read on public.manager_daily_closings for select to authenticated
using (public.is_admin() or manager_user_id = auth.uid());

drop trigger if exists audit_change on public.manager_daily_closings;
create trigger audit_change after insert or update or delete on public.manager_daily_closings
for each row execute function private.audit_change();

-- The only write path. Idempotent per op_id like apply_operational_command.
create or replace function public.manager_closing_command(op_id uuid, kind text, data jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  cached private.operational_commands;
  existing public.manager_daily_closings;
  result jsonb;
  d date; team text[]; prior_cash bigint; has_prior boolean:=false;
  opening bigint; handed bigint; actual_cash bigint;
  sales_n integer; sales_sum bigint; coll jsonb; coll_total bigint; cash_in bigint;
  exp_total bigint; exp_cash bigint; moves jsonb; v_expected_stock jsonb; v_actual_stock jsonb; v_stock_variance jsonb;
  expected_cash bigint; variance bigint; reason_text text;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and active) then
    raise exception 'Active login required';
  end if;
  lock table private.commands in exclusive mode;
  lock table private.operational_commands in exclusive mode;
  select * into cached from private.operational_commands where id=op_id;
  if cached.id is not null then
    if cached.user_id<>auth.uid() or cached.kind<>kind then raise exception 'Operation ID belongs to another request'; end if;
    return cached.result;
  end if;

  case kind
    when 'closing.manager_submit' then
      if not public.is_manager() then raise exception 'Only a manager can submit the team closing'; end if;
      d:=nullif(data->>'date','')::date;
      if d is null then raise exception 'Business date is required'; end if;
      if d>private.business_today() then raise exception 'A closing cannot be submitted for a future business date'; end if;
      if coalesce(jsonb_typeof(data->'actual_stock'),'')<>'object' then raise exception 'Counted stock is required'; end if;
      opening:=coalesce(nullif(data->>'opening_cash_paisa','')::bigint,0);
      handed:=coalesce(nullif(data->>'cash_handed_over_paisa','')::bigint,0);
      actual_cash:=coalesce(nullif(data->>'actual_cash_paisa','')::bigint,0);
      if opening<0 or handed<0 or actual_cash<0 then raise exception 'Cash amounts cannot be negative'; end if;
      if coalesce(nullif(data->>'cash_in_bank_paisa','')::bigint,0)<0 or coalesce(nullif(data->>'cash_in_hand_paisa','')::bigint,0)<0 or coalesce(nullif(data->>'cash_in_easypaisa_paisa','')::bigint,0)<0 or coalesce(nullif(data->>'cash_in_jazzcash_paisa','')::bigint,0)<0 or coalesce(nullif(data->>'market_credit_paisa','')::bigint,0)<0 then raise exception 'Closing balances cannot be negative'; end if;
      if exists(select 1 from jsonb_each_text(data->'actual_stock') x where x.value !~ '^[0-9]+$') then raise exception 'Counted stock must contain nonnegative whole boxes'; end if;
      if exists(select 1 from jsonb_object_keys(data->'actual_stock') as keys(product_id) where not exists(select 1 from public.products p where p.id=keys.product_id)) then raise exception 'Counted stock contains an unknown product'; end if;

      select * into existing from public.manager_daily_closings where manager_user_id=auth.uid() and business_date=d for update;
      if existing.id is not null and (existing.status not in ('rejected','reopened') or existing.version is distinct from nullif(data->>'expected_version','')::integer) then
        raise exception 'Manager closing already submitted or changed; reload before retrying';
      end if;

      select actual_cash_paisa into prior_cash from public.manager_daily_closings where manager_user_id=auth.uid() and business_date<d and status='approved' order by business_date desc limit 1;
      has_prior:=found;
      if has_prior and opening<>prior_cash then raise exception 'Opening cash must match the previous approved closing'; end if;

      -- The manager's assigned, active team (no dummy salesman is involved).
      select coalesce(array_agg(s.id order by s.id),'{}') into team from public.salesmen s where s.manager_user_id=auth.uid() and s.active and s.deleted_at is null;

      -- Sales: confirmed orders dated d, for the team or direct sales created by this manager.
      select count(*), coalesce(sum(o.total_paisa),0) into sales_n, sales_sum from public.orders o
        where o.status='confirmed' and o.date=d and ((o.salesman_id is not null and o.salesman_id=any(team)) or (o.salesman_id is null and o.created_by=auth.uid()));
      -- Collections: payments received on d (including older invoices), by method.
      select coalesce(jsonb_object_agg(x.method,x.amt),'{}'::jsonb), coalesce(sum(x.amt),0), coalesce(sum(x.amt) filter (where x.method='Cash'),0)
        into coll, coll_total, cash_in
        from (select p.method, sum(p.amount_paisa)::bigint amt from public.payments p
              join public.invoices i on i.id=p.invoice_id join public.orders o on o.id=i.order_id
              where o.status='confirmed' and o.date<=d and p.date=d and p.voided_at is null
                and ((o.salesman_id is not null and o.salesman_id=any(team)) or (o.salesman_id is null and o.created_by=auth.uid()))
              group by p.method) x;
      -- Expenses: team-linked entries plus this manager's own unlinked entries; salary postings excluded.
      select coalesce(sum(e.amount_paisa),0), coalesce(sum(e.amount_paisa) filter (where e.method='Cash'),0) into exp_total, exp_cash
        from public.expenses e where e.deleted_at is null and e.date=d and e.salary_period is null
          and ((e.salesman_id is not null and e.salesman_id=any(team)) or (e.salesman_id is null and e.created_by=auth.uid()));
      -- Stock movements of the team on d, per product and kind; and expected team stock at close.
      select coalesce(jsonb_object_agg(b.product_id,b.kinds),'{}'::jsonb) into moves from (
        select a.product_id, jsonb_object_agg(a.kind,a.boxes) kinds from (
          select m.product_id,m.kind,sum(m.boxes)::integer boxes from public.salesman_stock_movements m
          where m.salesman_id=any(team) and m.date=d group by m.product_id,m.kind) a group by a.product_id) b;
      select coalesce(jsonb_object_agg(x.product_id,x.boxes),'{}'::jsonb) into v_expected_stock from (
        select m.product_id,sum(m.boxes)::integer boxes from public.salesman_stock_movements m
        where m.salesman_id=any(team) and m.date<=d group by m.product_id having sum(m.boxes)<>0) x;
      v_actual_stock:=data->'actual_stock';
      select coalesce(jsonb_object_agg(coalesce(e.key,a.key),jsonb_build_object(
        'expected',coalesce(e.value,'0')::integer,'actual',coalesce(a.value,'0')::integer,
        'variance',coalesce(a.value,'0')::integer-coalesce(e.value,'0')::integer
      )) filter(where coalesce(e.value,'0')::integer<>coalesce(a.value,'0')::integer),'{}'::jsonb)
      into v_stock_variance
      from jsonb_each_text(v_expected_stock) e full join jsonb_each_text(v_actual_stock) a on a.key=e.key;

      expected_cash:=opening+cash_in-exp_cash-handed;
      variance:=actual_cash-expected_cash;
      reason_text:=coalesce(data->>'reason','');
      if (variance<>0 or v_stock_variance<>'{}'::jsonb) and length(trim(reason_text))=0 then raise exception 'A reason is required for cash or stock variance'; end if;

      if existing.id is not null then
        update public.manager_daily_closings set
          team_salesman_ids=team,sales_count=sales_n,sales_total_paisa=sales_sum,collections_by_method=coll,collections_total_paisa=coll_total,cash_received_paisa=cash_in,
          expenses_total_paisa=exp_total,cash_expenses_paisa=exp_cash,stock_movements=moves,opening_cash_paisa=opening,cash_handed_over_paisa=handed,
          expected_cash_paisa=expected_cash,actual_cash_paisa=actual_cash,cash_variance_paisa=variance,
          cash_in_bank_paisa=coalesce(nullif(data->>'cash_in_bank_paisa','')::bigint,0),cash_in_hand_paisa=coalesce(nullif(data->>'cash_in_hand_paisa','')::bigint,0),
          cash_in_easypaisa_paisa=coalesce(nullif(data->>'cash_in_easypaisa_paisa','')::bigint,0),cash_in_jazzcash_paisa=coalesce(nullif(data->>'cash_in_jazzcash_paisa','')::bigint,0),
          market_credit_paisa=coalesce(nullif(data->>'market_credit_paisa','')::bigint,0),
          expected_stock=v_expected_stock,actual_stock=v_actual_stock,stock_variances=v_stock_variance,reason=reason_text,notes=coalesce(data->>'notes',''),
          status='submitted',version=existing.version+1,submitted_by=auth.uid(),submitted_at=now(),
          approved_by=null,approved_at=null,decision_by=null,decision_at=null,decision_reason=''
        where id=existing.id returning to_jsonb(manager_daily_closings.*) into result;
      else
        insert into public.manager_daily_closings(manager_user_id,business_date,team_salesman_ids,sales_count,sales_total_paisa,collections_by_method,collections_total_paisa,cash_received_paisa,
          expenses_total_paisa,cash_expenses_paisa,stock_movements,opening_cash_paisa,cash_handed_over_paisa,expected_cash_paisa,actual_cash_paisa,cash_variance_paisa,
          cash_in_bank_paisa,cash_in_hand_paisa,cash_in_easypaisa_paisa,cash_in_jazzcash_paisa,market_credit_paisa,expected_stock,actual_stock,stock_variances,reason,notes,status,submitted_by)
        values(auth.uid(),d,team,sales_n,sales_sum,coll,coll_total,cash_in,exp_total,exp_cash,moves,opening,handed,expected_cash,actual_cash,variance,
          coalesce(nullif(data->>'cash_in_bank_paisa','')::bigint,0),coalesce(nullif(data->>'cash_in_hand_paisa','')::bigint,0),coalesce(nullif(data->>'cash_in_easypaisa_paisa','')::bigint,0),
          coalesce(nullif(data->>'cash_in_jazzcash_paisa','')::bigint,0),coalesce(nullif(data->>'market_credit_paisa','')::bigint,0),
          v_expected_stock,v_actual_stock,v_stock_variance,reason_text,coalesce(data->>'notes',''),'submitted',auth.uid())
        returning to_jsonb(manager_daily_closings.*) into result;
      end if;

    when 'closing.manager_approve' then
      if not public.is_admin() then raise exception 'Admin approval required'; end if;
      update public.manager_daily_closings set status='approved',approved_by=auth.uid(),approved_at=now(),decision_by=auth.uid(),decision_at=now(),
        decision_reason=coalesce(data->>'reason',''),version=version+1
        where id=(data->>'id')::uuid and version=(data->>'expected_version')::integer and status='submitted' returning to_jsonb(manager_daily_closings.*) into result;
      if result is null then raise exception 'Manager closing is not submitted or has changed'; end if;

    when 'closing.manager_reject' then
      if not public.is_admin() then raise exception 'Admin approval required'; end if;
      if length(trim(coalesce(data->>'reason','')))=0 then raise exception 'A rejection reason is required'; end if;
      update public.manager_daily_closings set status='rejected',approved_by=null,approved_at=null,decision_by=auth.uid(),decision_at=now(),
        decision_reason=trim(data->>'reason'),version=version+1
        where id=(data->>'id')::uuid and version=(data->>'expected_version')::integer and status='submitted' returning to_jsonb(manager_daily_closings.*) into result;
      if result is null then raise exception 'Manager closing is not submitted or has changed'; end if;

    when 'closing.manager_reopen' then
      if not public.is_admin() then raise exception 'Admin approval required'; end if;
      if length(trim(coalesce(data->>'reason','')))=0 then raise exception 'A reopening reason is required'; end if;
      update public.manager_daily_closings set status='reopened',approved_by=null,approved_at=null,decision_by=auth.uid(),decision_at=now(),
        decision_reason=trim(data->>'reason'),version=version+1
        where id=(data->>'id')::uuid and version=(data->>'expected_version')::integer and status in ('approved','rejected') returning to_jsonb(manager_daily_closings.*) into result;
      if result is null then raise exception 'Manager closing cannot be reopened from its current status'; end if;

    else raise exception 'Unknown manager closing command';
  end case;

  insert into private.operational_commands(id,user_id,kind,result) values(op_id,auth.uid(),kind,coalesce(result,'{}'::jsonb));
  return coalesce(result,'{}'::jsonb);
end $$;
revoke all on function public.manager_closing_command(uuid,text,jsonb) from public, anon;
grant execute on function public.manager_closing_command(uuid,text,jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Day lock: a submitted/approved manager closing locks the transactions it covers.
-- ---------------------------------------------------------------------------------------------
create or replace function private.assert_day_open(table_name text,row_data jsonb)
returns void language plpgsql security definer set search_path=''
as $$
declare sid text; d date; oid uuid; iid uuid;
begin
  if table_name in ('orders','expenses','salesman_stock_movements') then
    sid:=row_data->>'salesman_id'; d:=nullif(row_data->>'date','')::date;
  elsif table_name='payments' then
    iid:=nullif(row_data->>'invoice_id','')::uuid; d:=nullif(row_data->>'date','')::date;
    select o.salesman_id into sid from public.invoices i join public.orders o on o.id=i.order_id where i.id=iid;
  elsif table_name='stock_movements' then
    oid:=nullif(row_data->>'order_id','')::uuid; d:=nullif(row_data->>'date','')::date;
    if oid is not null then select o.salesman_id into sid from public.orders o where o.id=oid; end if;
  end if;
  if sid is not null and d is not null and exists(
    select 1 from public.daily_closings c where c.salesman_id=sid and c.business_date=d and c.status in ('submitted','approved')
  ) then
    raise exception 'This salesman day is submitted or approved; management must reopen the closing before changing transactions';
  end if;
  if d is not null and exists(
    select 1 from public.manager_daily_closings c
    where c.business_date=d and c.status in ('submitted','approved')
      and ((sid is not null and sid=any(c.team_salesman_ids))
        or (sid is null and table_name in ('orders','expenses','payments') and nullif(row_data->>'created_by','')::uuid=c.manager_user_id))
  ) then
    raise exception 'This day is covered by a submitted or approved manager closing; Admin must reject or reopen it before changing transactions';
  end if;
end $$;
revoke all on function private.assert_day_open(text,jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Snapshot: expose manager expenses and manager closings to the app.
-- ---------------------------------------------------------------------------------------------
do $mig$
declare def text; nd text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def;
  nd := def;
  if position('manager_expense_visible' in nd) = 0 then
    nd := replace(nd,
      $q$public.has_permission('expenses') or public.owns_salesman(x.salesman_id)$q$,
      $q$public.has_permission('expenses') or public.owns_salesman(x.salesman_id) or public.manager_expense_visible(x.created_by,x.salesman_id)$q$);
    if position('manager_expense_visible' in nd) = 0 then
      raise exception 'manager_closing_expenses_v40: snapshot expenses clause not found; nothing changed';
    end if;
  end if;
  if position('manager_daily_closings' in nd) = 0 then
    nd := replace(nd,
      $q$'audit_log',(select$q$,
      $q$'manager_daily_closings',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.manager_daily_closings x where public.is_admin() or x.manager_user_id=auth.uid()),
    'audit_log',(select$q$);
    if position('manager_daily_closings' in nd) = 0 then
      raise exception 'manager_closing_expenses_v40: snapshot audit_log clause not found; nothing changed';
    end if;
  end if;
  if nd <> def then execute nd; raise notice 'manager_closing_expenses_v40: business_snapshot patched';
  else raise notice 'manager_closing_expenses_v40: business_snapshot already patched'; end if;
end $mig$;

notify pgrst, 'reload schema';
