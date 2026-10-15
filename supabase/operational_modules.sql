-- Additive operational ledger for salesman-held stock and daily reconciliation.
-- Apply after schema.sql. Safe to re-run; existing business rows are preserved.
create table if not exists public.salesman_stock_movements (
  id uuid primary key default gen_random_uuid(),
  transaction_id text not null unique,
  product_id text not null references public.products(id),
  salesman_id text not null references public.salesmen(id),
  date date not null,
  boxes integer not null check (boxes <> 0),
  kind text not null check (kind in ('issue','sale','sale_reversal','return_saleable','return_damaged','return_expired','return_unsaleable')),
  reference text not null default '',
  order_id uuid references public.orders(id),
  note text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((kind in ('issue','sale_reversal') and boxes > 0) or (kind not in ('issue','sale_reversal') and boxes < 0))
);
create index if not exists salesman_stock_product_date on public.salesman_stock_movements(product_id,salesman_id,date);
create index if not exists salesman_stock_date on public.salesman_stock_movements(salesman_id,date);

create table if not exists public.daily_closings (
  id uuid primary key default gen_random_uuid(),
  salesman_id text not null references public.salesmen(id),
  business_date date not null,
  opening_cash_paisa bigint not null check (opening_cash_paisa >= 0),
  cash_handed_over_paisa bigint not null default 0 check (cash_handed_over_paisa >= 0),
  cash_received_paisa bigint not null default 0 check (cash_received_paisa >= 0),
  cash_expenses_paisa bigint not null default 0 check (cash_expenses_paisa >= 0),
  expected_cash_paisa bigint not null,
  actual_cash_paisa bigint not null check (actual_cash_paisa >= 0),
  cash_variance_paisa bigint not null,
  expected_stock jsonb not null default '{}',
  actual_stock jsonb not null default '{}',
  stock_variances jsonb not null default '{}',
  reason text not null default '',
  notes text not null default '',
  status text not null default 'submitted' check (status in ('submitted','approved','rejected','reopened')),
  version integer not null default 1,
  submitted_by uuid not null,
  submitted_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  decision_reason text not null default '',
  unique (salesman_id,business_date)
);
create index if not exists daily_closings_date_status on public.daily_closings(business_date,status);

create table if not exists private.operational_commands (
  id uuid primary key,
  user_id uuid not null,
  kind text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on private.operational_commands from public,anon,authenticated;

alter table public.salesman_stock_movements enable row level security;
alter table public.daily_closings enable row level security;
revoke all on public.salesman_stock_movements,public.daily_closings from anon,authenticated;
grant select on public.salesman_stock_movements,public.daily_closings to authenticated;
drop policy if exists salesman_stock_read on public.salesman_stock_movements;
create policy salesman_stock_read on public.salesman_stock_movements for select to authenticated using (
  public.is_admin() or public.owns_salesman(salesman_id) or public.has_permission('stock')
);
drop policy if exists daily_closing_read on public.daily_closings;
create policy daily_closing_read on public.daily_closings for select to authenticated using (
  public.is_admin() or public.owns_salesman(salesman_id) or public.has_permission('closing')
);

create or replace function public.stock_balances()
returns table(product_id text,boxes bigint)
language sql stable security definer set search_path=''
as $$
  select p.id,
    (coalesce(sum(m.boxes),0)-coalesce((
      select sum(sm.boxes)::bigint from public.salesman_stock_movements sm where sm.product_id=p.id
    ),0))::bigint
  from public.products p
  left join public.stock_movements m on m.product_id=p.id
  where exists(select 1 from public.profiles where id=auth.uid() and active)
  group by p.id
$$;

create or replace function public.salesman_stock_balances()
returns table(product_id text,salesman_id text,boxes bigint)
language sql stable security invoker set search_path=''
as $$
  select sm.product_id,sm.salesman_id,sum(sm.boxes)::bigint
  from public.salesman_stock_movements sm
  group by sm.product_id,sm.salesman_id
  having sum(sm.boxes)<>0
$$;

create or replace function private.track_salesman_stock()
returns trigger language plpgsql security definer set search_path=''
as $$
declare sid text; d date; available bigint; movement_id text;
begin
  if new.order_id is null then return new; end if;
  select o.salesman_id,o.date into sid,d from public.orders o where o.id=new.order_id;
  if sid is null then return new; end if;
  if new.kind='sale' and new.boxes<0 and exists (
    select 1 from public.salesman_stock_movements sm
    where sm.product_id=new.product_id and sm.salesman_id=sid and sm.kind='issue'
  ) then
    select coalesce(sum(boxes),0) into available from public.salesman_stock_movements
      where product_id=new.product_id and salesman_id=sid;
    if available < abs(new.boxes) then
      raise exception 'Insufficient salesman stock for %: % boxes available',new.product_id,available;
    end if;
    movement_id:='sale-ledger:'||new.transaction_id;
    insert into public.salesman_stock_movements(transaction_id,product_id,salesman_id,date,boxes,kind,reference,order_id,note,created_by)
    values(movement_id,new.product_id,sid,new.date,new.boxes,'sale',new.note,new.order_id,'Automatic sale deduction',new.created_by);
  elsif new.kind='reversal' and new.boxes>0 then
    select greatest(0,-coalesce(sum(boxes),0)) into available
    from public.salesman_stock_movements
    where product_id=new.product_id and salesman_id=sid and order_id=new.order_id;
    if available>0 then
      movement_id:='reverse-ledger:'||new.transaction_id;
      insert into public.salesman_stock_movements(transaction_id,product_id,salesman_id,date,boxes,kind,reference,order_id,note,created_by)
      values(movement_id,new.product_id,sid,new.date,least(new.boxes,available),'sale_reversal',new.note,new.order_id,'Automatic sale reversal',new.created_by);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists track_salesman_stock on public.stock_movements;
create trigger track_salesman_stock after insert on public.stock_movements
for each row execute function private.track_salesman_stock();

create or replace function private.guard_warehouse_balance()
returns trigger language plpgsql security definer set search_path=''
as $$
declare warehouse_qty bigint; blocks boolean;
begin
  if new.order_id is not null or new.boxes>=0 or new.note like 'Salesman return marked %' then return new; end if;
  select coalesce((value->>'block_negative_stock')::boolean,true) into blocks from public.settings where id='business';
  select coalesce(sum(m.boxes),0)-coalesce((
    select sum(sm.boxes)::bigint from public.salesman_stock_movements sm where sm.product_id=new.product_id
  ),0) into warehouse_qty
  from public.stock_movements m where m.product_id=new.product_id;
  if blocks and warehouse_qty+new.boxes<0 then raise exception 'Movement would make warehouse stock negative'; end if;
  return new;
end $$;
drop trigger if exists guard_warehouse_balance on public.stock_movements;
create trigger guard_warehouse_balance before insert on public.stock_movements
for each row execute function private.guard_warehouse_balance();

create or replace function private.prevent_closed_day_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare row_data jsonb; sid text; d date; oid uuid; iid uuid;
begin
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name='orders' then
    sid:=row_data->>'salesman_id'; d:=(row_data->>'date')::date;
  elsif tg_table_name='expenses' then
    sid:=row_data->>'salesman_id'; d:=(row_data->>'date')::date;
  elsif tg_table_name='salesman_stock_movements' then
    sid:=row_data->>'salesman_id'; d:=(row_data->>'date')::date;
  elsif tg_table_name='payments' then
    iid:=nullif(row_data->>'invoice_id','')::uuid; d:=(row_data->>'date')::date;
    select o.salesman_id into sid from public.invoices i join public.orders o on o.id=i.order_id where i.id=iid;
  elsif tg_table_name='stock_movements' then
    oid:=nullif(row_data->>'order_id','')::uuid; d:=(row_data->>'date')::date;
    if oid is not null then select o.salesman_id into sid from public.orders o where o.id=oid; end if;
  end if;
  if sid is not null and d is not null and exists(
    select 1 from public.daily_closings c where c.salesman_id=sid and c.business_date=d and c.status in ('submitted','approved')
  ) then
    raise exception 'This salesman day is submitted or approved; management must reopen the closing before changing transactions';
  end if;
  return coalesce(new,old);
end $$;
do $$declare t text; begin
  foreach t in array array['orders','payments','expenses','stock_movements','salesman_stock_movements'] loop
    execute format('drop trigger if exists prevent_closed_day_change on public.%I',t);
    execute format('create trigger prevent_closed_day_change before insert or update or delete on public.%I for each row execute function private.prevent_closed_day_change()',t);
  end loop;
end $$;

do $$declare t text; begin
  foreach t in array array['salesman_stock_movements','daily_closings'] loop
    execute format('drop trigger if exists audit_change on public.%I',t);
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
  end loop;
end $$;

create or replace function public.apply_operational_command(op_id uuid,kind text,data jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  cached private.operational_commands;
  prior public.salesman_stock_movements;
  closing public.daily_closings;
  sid text; pid text; tx text; condition text; qty integer; d date;
  warehouse_qty bigint; salesman_qty bigint; cash_in bigint; cash_expense bigint;
  opening bigint; handed bigint; expected_cash bigint; actual_cash bigint;
  variance bigint; expected_stock jsonb; actual_stock jsonb; stock_variance jsonb;
  prior_cash bigint; has_prior boolean:=false; result jsonb; row_id uuid;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and active) then
    raise exception 'Active login required';
  end if;
  -- Shared with apply_command so closing submission cannot race with sales or receipts.
  lock table private.commands in exclusive mode;
  lock table private.operational_commands in exclusive mode;
  select * into cached from private.operational_commands where id=op_id;
  if cached.id is not null then
    if cached.user_id<>auth.uid() or cached.kind<>kind then raise exception 'Operation ID belongs to another request'; end if;
    return cached.result;
  end if;
  sid:=nullif(data->>'salesman_id','');
  pid:=nullif(data->>'product_id','');
  tx:=nullif(trim(data->>'transaction_id'),'');
  qty:=nullif(data->>'boxes','')::integer;
  d:=nullif(data->>'date','')::date;
  case kind
    when 'stock.issue' then
      if not(public.is_admin() or public.has_permission('stock','create')) then raise exception 'Stock issue permission required'; end if;
      if sid is null or pid is null or tx is null or d is null or qty is null or qty<=0 then raise exception 'Salesman, product, date, reference and positive boxes are required'; end if;
      perform 1 from public.salesmen where id=sid and active and deleted_at is null for update;
      if not found then raise exception 'Active salesman required'; end if;
      perform 1 from public.products where id=pid and active and deleted_at is null for update;
      if not found then raise exception 'Active product required'; end if;
      select * into prior from public.salesman_stock_movements where transaction_id=tx;
      if found then
        if prior.kind='issue' and prior.salesman_id=sid and prior.product_id=pid and prior.boxes=qty and prior.date=d then result:=to_jsonb(prior);
        else raise exception 'Stock reference already exists with different details'; end if;
      else
        select coalesce(sum(boxes),0) into warehouse_qty from public.stock_movements where product_id=pid;
        select coalesce(sum(boxes),0) into salesman_qty from public.salesman_stock_movements where product_id=pid;
        if warehouse_qty-salesman_qty<qty then raise exception 'Insufficient warehouse stock: % boxes available',warehouse_qty-salesman_qty; end if;
        insert into public.salesman_stock_movements(transaction_id,product_id,salesman_id,date,boxes,kind,reference,note,created_by)
        values(tx,pid,sid,d,qty,'issue',coalesce(data->>'reference',tx),coalesce(data->>'note',''),auth.uid()) returning to_jsonb(salesman_stock_movements.*) into result;
      end if;
    when 'stock.return' then
      condition:=coalesce(data->>'condition','saleable');
      if not(public.is_admin() or public.owns_salesman(sid) or public.has_permission('stock','create')) then raise exception 'Stock return permission required'; end if;
      if sid is null or pid is null or tx is null or d is null or qty is null or qty<=0 or condition not in ('saleable','damaged','expired','unsaleable') then raise exception 'Valid salesman, product, date, return condition and positive boxes are required'; end if;
      perform 1 from public.salesmen where id=sid and active and deleted_at is null for update;
      if not found then raise exception 'Active salesman required'; end if;
      perform 1 from public.products where id=pid for update;
      if not found then raise exception 'Product required'; end if;
      select * into prior from public.salesman_stock_movements where transaction_id=tx;
      if found then
        if prior.kind=('return_'||condition) and prior.salesman_id=sid and prior.product_id=pid and prior.boxes=-qty and prior.date=d then result:=to_jsonb(prior);
        else raise exception 'Stock reference already exists with different details'; end if;
      else
        select coalesce(sum(boxes),0) into salesman_qty from public.salesman_stock_movements where product_id=pid and salesman_id=sid;
        if salesman_qty<qty then raise exception 'Insufficient salesman stock: % boxes available',salesman_qty; end if;
        insert into public.salesman_stock_movements(transaction_id,product_id,salesman_id,date,boxes,kind,reference,note,created_by)
        values(tx,pid,sid,d,-qty,'return_'||condition,coalesce(data->>'reference',tx),coalesce(data->>'note',''),auth.uid()) returning to_jsonb(salesman_stock_movements.*) into result;
        if condition<>'saleable' then
          insert into public.stock_movements(transaction_id,product_id,date,boxes,kind,note,created_by)
          values('return-loss:'||tx,pid,d,-qty,'damage','Salesman return marked '||condition||': '||coalesce(data->>'note',''),auth.uid());
        end if;
      end if;
    when 'closing.submit' then
      if not(public.is_admin() or public.owns_salesman(sid)) then raise exception 'Only the assigned salesman or management may submit this closing'; end if;
      if sid is null or d is null or coalesce(jsonb_typeof(data->'actual_stock'),'')<>'object' then raise exception 'Salesman, business date and counted stock are required'; end if;
      if d>private.business_today() then raise exception 'A closing cannot be submitted for a future business date'; end if;
      opening:=coalesce(nullif(data->>'opening_cash_paisa','')::bigint,0);
      handed:=coalesce(nullif(data->>'cash_handed_over_paisa','')::bigint,0);
      actual_cash:=coalesce(nullif(data->>'actual_cash_paisa','')::bigint,0);
      if opening<0 or handed<0 or actual_cash<0 then raise exception 'Cash amounts cannot be negative'; end if;
      if exists(select 1 from jsonb_each_text(data->'actual_stock') x where x.value !~ '^[0-9]+$') then raise exception 'Counted stock must contain nonnegative whole boxes'; end if;
      if exists(select 1 from jsonb_object_keys(data->'actual_stock') as keys(product_id) where not exists(select 1 from public.products p where p.id=keys.product_id)) then raise exception 'Counted stock contains an unknown product'; end if;
      select actual_cash_paisa into prior_cash from public.daily_closings where salesman_id=sid and business_date<d and status='approved' order by business_date desc limit 1;
      has_prior:=found;
      if has_prior and opening<>prior_cash then raise exception 'Opening cash must match the previous approved closing'; end if;
      select coalesce(sum(p.amount_paisa),0) into cash_in
        from public.payments p join public.invoices i on i.id=p.invoice_id join public.orders o on o.id=i.order_id
        where o.salesman_id=sid and o.status='confirmed' and o.date<=d and p.date=d and p.method='Cash' and p.voided_at is null;
      select coalesce(sum(e.amount_paisa),0) into cash_expense from public.expenses e
        where e.salesman_id=sid and e.date=d and e.method='Cash' and e.deleted_at is null;
      expected_cash:=opening+cash_in-cash_expense-handed;
      variance:=actual_cash-expected_cash;
      select coalesce(jsonb_object_agg(x.product_id,x.boxes),'{}'::jsonb) into expected_stock from (
        select product_id,sum(boxes)::integer boxes from public.salesman_stock_movements
        where salesman_id=sid and date<=d group by product_id having sum(boxes)<>0
      ) x;
      actual_stock:=data->'actual_stock';
      select coalesce(jsonb_object_agg(coalesce(e.key,a.key),jsonb_build_object(
        'expected',coalesce(e.value,'0')::integer,
        'actual',coalesce(a.value,'0')::integer,
        'variance',coalesce(a.value,'0')::integer-coalesce(e.value,'0')::integer
      )) filter(where coalesce(e.value,'0')::integer<>coalesce(a.value,'0')::integer),'{}'::jsonb)
      into stock_variance
      from jsonb_each_text(expected_stock) e full join jsonb_each_text(actual_stock) a on a.key=e.key;
      if (variance<>0 or stock_variance<>'{}'::jsonb) and length(trim(coalesce(data->>'reason','')))=0 then raise exception 'A reason is required for cash or stock variance'; end if;
      select * into closing from public.daily_closings where salesman_id=sid and business_date=d for update;
      if found then
        if closing.status not in ('rejected','reopened') or closing.version is distinct from nullif(data->>'expected_version','')::integer then raise exception 'Closing already submitted or changed; reload before retrying'; end if;
        update public.daily_closings set opening_cash_paisa=opening,cash_handed_over_paisa=handed,cash_received_paisa=cash_in,cash_expenses_paisa=cash_expense,expected_cash_paisa=expected_cash,actual_cash_paisa=actual_cash,cash_variance_paisa=variance,expected_stock=expected_stock,actual_stock=actual_stock,stock_variances=stock_variance,reason=coalesce(data->>'reason',''),notes=coalesce(data->>'notes',''),status='submitted',version=version+1,submitted_by=auth.uid(),submitted_at=now(),approved_by=null,approved_at=null,decision_reason='' where id=closing.id returning to_jsonb(daily_closings.*) into result;
      else
        insert into public.daily_closings(salesman_id,business_date,opening_cash_paisa,cash_handed_over_paisa,cash_received_paisa,cash_expenses_paisa,expected_cash_paisa,actual_cash_paisa,cash_variance_paisa,expected_stock,actual_stock,stock_variances,reason,notes,status,submitted_by)
        values(sid,d,opening,handed,cash_in,cash_expense,expected_cash,actual_cash,variance,expected_stock,actual_stock,stock_variance,coalesce(data->>'reason',''),coalesce(data->>'notes',''),'submitted',auth.uid()) returning to_jsonb(daily_closings.*) into result;
      end if;
    when 'closing.approve' then
      if not public.is_admin() then raise exception 'Management approval required'; end if;
      update public.daily_closings set status='approved',approved_by=auth.uid(),approved_at=now(),decision_reason=coalesce(data->>'reason',''),version=version+1 where id=(data->>'id')::uuid and version=(data->>'expected_version')::integer and status='submitted' returning to_jsonb(daily_closings.*) into result;
      if result is null then raise exception 'Closing is not submitted or has changed'; end if;
    when 'closing.reject' then
      if not public.is_admin() or length(trim(coalesce(data->>'reason','')))=0 then raise exception 'Management and a rejection reason are required'; end if;
      update public.daily_closings set status='rejected',decision_reason=data->>'reason',version=version+1 where id=(data->>'id')::uuid and version=(data->>'expected_version')::integer and status='submitted' returning to_jsonb(daily_closings.*) into result;
      if result is null then raise exception 'Closing is not submitted or has changed'; end if;
    when 'closing.reopen' then
      if not public.is_admin() or length(trim(coalesce(data->>'reason','')))=0 then raise exception 'Management and a reopening reason are required'; end if;
      update public.daily_closings set status='reopened',decision_reason=data->>'reason',version=version+1 where id=(data->>'id')::uuid and version=(data->>'expected_version')::integer and status in ('approved','rejected') returning to_jsonb(daily_closings.*) into result;
      if result is null then raise exception 'Closing cannot be reopened from its current status'; end if;
    else raise exception 'Unknown operational command';
  end case;
  insert into private.operational_commands(id,user_id,kind,result) values(op_id,auth.uid(),kind,coalesce(result,'{}'::jsonb));
  return coalesce(result,'{}'::jsonb);
end $$;

create or replace function public.business_snapshot()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare privileged boolean:=public.is_admin() or public.has_permission('pnl','view'); cfg jsonb;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and active) then return null; end if;
  select value-'signature_data' into cfg from public.settings where id='business';
  if not privileged then cfg:=cfg-'base_salary_paisa'; end if;
  return jsonb_build_object(
    'products',(select coalesce(jsonb_agg(case when privileged then to_jsonb(x) else to_jsonb(x)-'cost_paisa' end),'[]'::jsonb) from public.products x where public.is_admin() or public.has_permission('products') or exists(select 1 from public.salesmen s where s.user_id=auth.uid() and s.active)),
    'price_tiers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.price_tiers x where exists(select 1 from public.products p where p.id=x.product_id and (public.is_admin() or public.has_permission('products') or exists(select 1 from public.salesmen s where s.user_id=auth.uid() and s.active)))),
    'customers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.customers x where public.is_admin() or public.owns_salesman(x.salesman_id) or (x.created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active))),
    'salesmen',(select coalesce(jsonb_agg(case when privileged then to_jsonb(x) else to_jsonb(x)-'base_salary_paisa' end),'[]'::jsonb) from public.salesmen x where public.is_admin() or public.owns_salesman(x.id)),
    'salesman_daily_targets',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.salesman_daily_targets x where public.is_admin() or public.owns_salesman(x.salesman_id)),
    'quotations',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.quotations x where public.can_document(x.salesman_id,'quotes')),
    'quotation_items',(select coalesce(jsonb_agg(case when privileged then to_jsonb(x) else to_jsonb(x)-'cost_paisa' end),'[]'::jsonb) from public.quotation_items x join public.quotations q on q.id=x.quotation_id where public.can_document(q.salesman_id,'quotes')),
    'orders',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.orders x where public.can_document(x.salesman_id,'orders')),
    'order_items',(select coalesce(jsonb_agg(case when privileged then to_jsonb(x) else to_jsonb(x)-'cost_paisa' end),'[]'::jsonb) from public.order_items x join public.orders o on o.id=x.order_id where public.can_document(o.salesman_id,'orders')),
    'invoices',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.invoices x join public.orders o on o.id=x.order_id where public.can_document(o.salesman_id,'invoices')),
    'payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.payments x join public.invoices i on i.id=x.invoice_id join public.orders o on o.id=i.order_id where public.can_document(o.salesman_id,'invoices')),
    'stock_movements',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.stock_movements x where public.is_admin() or public.has_permission('stock')),
    'salesman_stock_movements',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.salesman_stock_movements x where public.is_admin() or public.owns_salesman(x.salesman_id) or public.has_permission('stock')),
    'daily_closings',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.daily_closings x where public.is_admin() or public.owns_salesman(x.salesman_id) or public.has_permission('closing')),
    'expenses',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.expenses x where public.is_admin() or public.has_permission('expenses')),
    'audit_log',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.audit_log x where public.is_admin()),
    'profiles',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.profiles x where x.id=auth.uid() or public.is_admin()),
    'user_roles',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.user_roles x where x.user_id=auth.uid() or public.is_admin()),
    'user_permissions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.user_permissions x where x.user_id=auth.uid() or public.is_admin()),
    'settings',coalesce(cfg,public.app_settings()),
    'settings_version',coalesce((select version from public.settings where id='business'),1),
    'stock',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.stock_balances() x)
  );
end $$;

-- Sensitive table reads are available only through the scoped snapshot RPC.
revoke select on public.products,public.salesmen,public.order_items,public.quotation_items from authenticated;
revoke all on function public.business_snapshot() from public,anon;
grant execute on function public.business_snapshot() to authenticated;

revoke all on function public.apply_operational_command(uuid,text,jsonb),public.salesman_stock_balances() from public,anon;
grant execute on function public.apply_operational_command(uuid,text,jsonb),public.salesman_stock_balances() to authenticated;
revoke all on function public.stock_balances() from public,anon;
grant execute on function public.stock_balances() to authenticated;
revoke all on function private.track_salesman_stock(),private.guard_warehouse_balance(),private.prevent_closed_day_change() from public,anon,authenticated;
NOTIFY pgrst,'reload schema';