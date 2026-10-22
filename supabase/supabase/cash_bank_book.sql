-- Cash & Bank Book, immutable double-entry-style account movements.
-- Apply AFTER schema.sql and operational_modules.sql. Safe to re-run.
create table if not exists public.cashbook_accounts (
  account_key text primary key,
  label text not null,
  account_type text not null check (account_type in ('cash','bank','wallet','salesman','receivable')),
  payment_method text,
  salesman_id text references public.salesmen(id),
  opening_balance_paisa bigint not null default 0,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (opening_balance_paisa >= 0)
);
create table if not exists public.cashbook_entries (
  id uuid primary key default gen_random_uuid(),
  posting_key text not null unique,
  transaction_id text not null,
  business_date date not null,
  account_key text not null references public.cashbook_accounts(account_key),
  amount_paisa bigint not null check (amount_paisa <> 0),
  entry_type text not null check (entry_type in ('receipt','receivable','expense','transfer_in','transfer_out','adjustment','reversal')),
  source_table text,
  source_id text,
  reference text not null default '',
  description text not null default '',
  salesman_id text references public.salesmen(id),
  reversal_of text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists cashbook_entries_date_account on public.cashbook_entries(business_date,account_key);
create index if not exists cashbook_entries_salesman_date on public.cashbook_entries(salesman_id,business_date);
create index if not exists cashbook_entries_source on public.cashbook_entries(source_table,source_id);

create table if not exists public.cashbook_daily_closings (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  account_key text not null references public.cashbook_accounts(account_key),
  expected_balance_paisa bigint not null,
  actual_balance_paisa bigint not null check (actual_balance_paisa >= 0),
  variance_paisa bigint not null,
  notes text not null default '',
  status text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  submitted_by uuid not null,
  submitted_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  unique(business_date,account_key)
);
create index if not exists cashbook_closings_date_status on public.cashbook_daily_closings(business_date,status);

insert into public.cashbook_accounts(account_key,label,account_type,payment_method)
values
 ('cash_hand','Cash in Hand','cash','Cash'),
 ('bank_default','Cash in Bank — Default account','bank','Bank'),
 ('easypaisa','EasyPaisa','wallet','Easypaisa'),
 ('jazzcash','JazzCash','wallet','JazzCash'),
 ('market_credit','Market Credit — Receivables','receivable',null)
on conflict(account_key) do nothing;

alter table public.payments add column if not exists cashbook_account_key text references public.cashbook_accounts(account_key);
alter table public.expenses add column if not exists cashbook_account_key text references public.cashbook_accounts(account_key);

-- Keep the existing receipt RPC and its permission/validation checks, adding only the optional
-- receiving-account key. This is safe to re-run against the current function definition.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('private.add_payment(jsonb,boolean)'::regprocedure) into def;
  if position('cashbook_account_key' in def)>0 then
    raise notice 'cashbook payment account field already patched';
    return;
  end if;
  nd:=def;
  nd:=replace(nd,
    'insert into public.payments(id,transaction_id,invoice_id,date,amount_paisa,method,reference,received_by,created_by) values',
    'insert into public.payments(id,transaction_id,invoice_id,date,amount_paisa,method,cashbook_account_key,reference,received_by,created_by) values');
  nd:=replace(nd,
    'd->>''method'',coalesce(d->>''reference'',''''),d->>''received_by'',auth.uid()',
    'd->>''method'',nullif(d->>''cashbook_account_key'',''''),coalesce(d->>''reference'',''''),d->>''received_by'',auth.uid()');
  nd:=replace(nd,
    'method=excluded.method,reference=excluded.reference',
    'method=excluded.method,cashbook_account_key=excluded.cashbook_account_key,reference=excluded.reference');
  nd:=replace(nd,
    'old.amount_paisa=n and old.voided_at is null',
    'old.amount_paisa=n and old.method=coalesce(d->>''method'',''Cash'') and old.cashbook_account_key is not distinct from nullif(d->>''cashbook_account_key'','''') and old.voided_at is null');
  if nd=def or position('cashbook_account_key,reference' in nd)=0 or position('cashbook_account_key=excluded.cashbook_account_key' in nd)=0 or position('nullif(d->>' in nd)=0 then
    raise exception 'Could not patch private.add_payment safely; review the deployed function definition before proceeding';
  end if;
  execute nd;
end $$;

-- Pass the optional receiving account through new-order payment and quotation-conversion flows too.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.apply_command(uuid,text,jsonb)'::regprocedure) into def;
  if position('cashbook_account_key' in def)>0 then
    raise notice 'cashbook receiving account already wired into apply_command';
    return;
  end if;
  nd:=replace(def,
    '''method'',coalesce(params->>''method'',''Cash''),''reference''',
    '''method'',coalesce(params->>''method'',''Cash''),''cashbook_account_key'',coalesce(params->>''cashbook_account_key'',''''),''reference''');
  if nd=def or position('cashbook_account_key' in nd)=0 then
    raise exception 'Could not patch public.apply_command safely; review the deployed function definition before proceeding';
  end if;
  execute nd;
end $$;

create or replace function private.cashbook_ensure_salesman_account(p_salesman_id text, p_method text)
returns text language plpgsql security definer set search_path=''
as $$
declare k text; nm text; method_name text; account_name text;
begin
  method_name := case
    when lower(coalesce(p_method,'')) in ('easypaisa','easy paisa') then 'Easypaisa'
    when lower(coalesce(p_method,''))='jazzcash' then 'JazzCash'
    when lower(coalesce(p_method,'')) in ('bank','bank account','cheque') then 'Bank Account'
    else 'Cash'
  end;
  k := 'salesman:' || p_salesman_id || ':' || lower(replace(method_name,' ',''));
  select name into nm from public.salesmen where id=p_salesman_id;
  insert into public.cashbook_accounts(account_key,label,account_type,payment_method,salesman_id)
  values(k,'Salesman Collection — '||coalesce(nm,p_salesman_id)||' ('||method_name||')','salesman',method_name,p_salesman_id)
  on conflict(account_key) do update set label=excluded.label, active=true;
  return k;
end $$;

create or replace function private.cashbook_method_account(p_method text, p_salesman_id text default null)
returns text language plpgsql security definer set search_path=''
as $$
begin
  if p_salesman_id is not null then
    return private.cashbook_ensure_salesman_account(p_salesman_id,p_method);
  end if;
  return case
    when lower(coalesce(p_method,'')) in ('easypaisa','easy paisa') then 'easypaisa'
    when lower(coalesce(p_method,''))='jazzcash' then 'jazzcash'
    when lower(coalesce(p_method,'')) in ('bank','bank account','cheque') then 'bank_default'
    else 'cash_hand'
  end;
end $$;

create or replace function private.cashbook_seed_salesman_accounts()
returns trigger language plpgsql security definer set search_path=''
as $$
declare method_name text;
begin
  foreach method_name in array array['Cash','Bank','Easypaisa','JazzCash'] loop
    perform private.cashbook_ensure_salesman_account(new.id,method_name);
  end loop;
  return new;
end $$;

drop trigger if exists cashbook_seed_salesman_accounts on public.salesmen;
create trigger cashbook_seed_salesman_accounts after insert on public.salesmen
for each row execute function private.cashbook_seed_salesman_accounts();

do $$
declare seller record; method_name text;
begin
  for seller in select id from public.salesmen where active loop
    foreach method_name in array array['Cash','Bank','Easypaisa','JazzCash'] loop
      perform private.cashbook_ensure_salesman_account(seller.id,method_name);
    end loop;
  end loop;
end $$;

create or replace function private.cashbook_post_invoice()
returns trigger language plpgsql security definer set search_path=''
as $$
declare business_day date; sid text;
begin
  select o.date,o.salesman_id into business_day,sid from public.orders o where o.id=new.order_id;
  if new.total_paisa > 0 then
  insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
  values('invoice:'||new.id||':receivable:'||new.total_paisa,'INV-'||new.id::text,coalesce(business_day,new.created_at::date),'market_credit',new.total_paisa,'receivable','invoices',new.id::text,new.number,'Invoice receivable',sid,auth.uid())
  on conflict(posting_key) do nothing;
  end if;
  return new;
end $$;

create or replace function private.cashbook_post_payment()
returns trigger language plpgsql security definer set search_path=''
as $$
declare inv public.invoices%rowtype; ord public.orders%rowtype; acct text; sid text; acct_sid text; acctrow public.cashbook_accounts%rowtype; expected_method text;
begin
  select * into inv from public.invoices where id=new.invoice_id;
  select * into ord from public.orders where id=inv.order_id;
  sid := ord.salesman_id;
  expected_method := case
    when lower(coalesce(new.method,'')) in ('easypaisa','easy paisa') then 'Easypaisa'
    when lower(coalesce(new.method,''))='jazzcash' then 'JazzCash'
    when lower(coalesce(new.method,'')) in ('bank','bank account','cheque') then 'Bank Account'
    else 'Cash'
  end;
  if new.cashbook_account_key is not null then
    select * into acctrow from public.cashbook_accounts where account_key=new.cashbook_account_key and active;
    if not found then raise exception 'Selected receiving account is missing or inactive'; end if;
    if acctrow.account_type='salesman' then
      if lower(coalesce(acctrow.payment_method,''))<>lower(expected_method) then raise exception 'Selected salesman collection account does not match payment method'; end if;
    elsif expected_method='Cash' and acctrow.account_type<>'cash' then
      raise exception 'Cash receipts must be assigned to a cash account';
    elsif expected_method in ('Bank','Bank Account') and acctrow.account_type<>'bank' then
      raise exception 'Bank/cheque receipts must be assigned to a bank account';
    elsif expected_method in ('Easypaisa','JazzCash') and (acctrow.account_type<>'wallet' or lower(coalesce(acctrow.payment_method,''))<>lower(expected_method)) then
      raise exception 'Selected wallet does not match payment method';
    end if;
    acct:=acctrow.account_key;
  else
    acct:=private.cashbook_method_account(new.method,sid);
    select * into acctrow from public.cashbook_accounts where account_key=acct;
  end if;
  acct_sid:=acctrow.salesman_id;
  if tg_op='INSERT' then
    insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
    values('payment:'||new.id||':receipt',new.transaction_id,new.date,acct,new.amount_paisa,'receipt','payments',new.id::text,coalesce(new.reference,''),'Payment received — '||new.method,acct_sid,new.created_by)
    on conflict(posting_key) do nothing;
    insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
    values('payment:'||new.id||':receivable',new.transaction_id,new.date,'market_credit',-new.amount_paisa,'receivable','payments',new.id::text,coalesce(new.reference,''),'Receivable recovered',sid,new.created_by)
    on conflict(posting_key) do nothing;
    if new.voided_at is not null then
      insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
      values('payment:'||new.id||':void-receipt',new.transaction_id,new.date,acct,-new.amount_paisa,'reversal','payments',new.id::text,coalesce(new.reference,''),'Voided payment reversal',acct_sid,new.created_by),
      ('payment:'||new.id||':void-receivable',new.transaction_id,new.date,'market_credit',new.amount_paisa,'reversal','payments',new.id::text,coalesce(new.reference,''),'Voided payment receivable reversal',sid,new.created_by)
      on conflict(posting_key) do nothing;
    end if;
  elsif old.voided_at is null and new.voided_at is not null then
    insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
    values('payment:'||new.id||':void-receipt',new.transaction_id,current_date,acct,-new.amount_paisa,'reversal','payments',new.id::text,coalesce(new.reference,''),'Voided payment reversal',acct_sid,auth.uid()),
    ('payment:'||new.id||':void-receivable',new.transaction_id,current_date,'market_credit',new.amount_paisa,'reversal','payments',new.id::text,coalesce(new.reference,''),'Voided payment receivable reversal',sid,auth.uid())
    on conflict(posting_key) do nothing;
  end if;
  return new;
end $$;

create or replace function private.cashbook_post_expense()
returns trigger language plpgsql security definer set search_path=''
as $$
declare acct text; sid text;
begin
  sid := new.salesman_id;
  acct := coalesce(new.cashbook_account_key, private.cashbook_method_account(new.method,sid));
  if tg_op='INSERT' then
    if new.deleted_at is null then
      insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
      values('expense:'||new.id||':v'||coalesce(new.version,1),new.id,new.date,acct,-new.amount_paisa,'expense','expenses',new.id::text,'','Expense — '||new.category,sid,new.created_by)
      on conflict(posting_key) do nothing;
    end if;
  elsif (old.amount_paisa,old.method,old.cashbook_account_key,old.date,old.salesman_id,old.deleted_at) is distinct from (new.amount_paisa,new.method,new.cashbook_account_key,new.date,new.salesman_id,new.deleted_at) then
    if old.deleted_at is null then
      insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,description,salesman_id,created_by)
      values('expense:'||old.id||':reverse-v'||old.version,old.id,current_date,coalesce(old.cashbook_account_key, private.cashbook_method_account(old.method,old.salesman_id)),old.amount_paisa,'reversal','expenses',old.id::text,'Reversal of edited/deleted expense',old.salesman_id,auth.uid())
      on conflict(posting_key) do nothing;
    end if;
    if new.deleted_at is null then
      insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,description,salesman_id,created_by)
      values('expense:'||new.id||':v'||new.version,new.id,new.date,acct,-new.amount_paisa,'expense','expenses',new.id::text,'Expense — '||new.category,sid,new.created_by)
      on conflict(posting_key) do nothing;
    end if;
  end if;
  return new;
end $$;

create or replace function private.cashbook_reverse_cancelled_order()
returns trigger language plpgsql security definer set search_path=''
as $$
declare inv public.invoices%rowtype;
begin
  if old.status is distinct from new.status and new.status='cancelled' then
    select * into inv from public.invoices where order_id=new.id;
    if found and inv.total_paisa > 0 then
      insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
      values('order:'||new.id||':cancel-receivable:v'||coalesce(new.version,1),'CANCEL-'||new.id::text,current_date,'market_credit',-inv.total_paisa,'reversal','orders',new.id::text,coalesce(inv.number,''),'Cancelled invoice receivable reversal',new.salesman_id,auth.uid())
      on conflict(posting_key) do nothing;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists cashbook_invoice_post on public.invoices;
create trigger cashbook_invoice_post after insert on public.invoices
for each row execute function private.cashbook_post_invoice();
drop trigger if exists cashbook_payment_post on public.payments;
drop trigger if exists cashbook_payment_void_post on public.payments;
create trigger cashbook_payment_post after insert on public.payments
for each row execute function private.cashbook_post_payment();
create trigger cashbook_payment_void_post after update of voided_at on public.payments
for each row execute function private.cashbook_post_payment();
drop trigger if exists cashbook_order_cancel on public.orders;
create trigger cashbook_order_cancel after update of status on public.orders
for each row execute function private.cashbook_reverse_cancelled_order();
drop trigger if exists cashbook_expense_post on public.expenses;
create trigger cashbook_expense_post after insert or update on public.expenses
for each row execute function private.cashbook_post_expense();

create or replace function private.cashbook_guard_approved_day()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  -- Permit idempotent retries and the explicit reconciliation adjustment created on approval.
  if exists(select 1 from public.cashbook_entries where posting_key=new.posting_key) then return new; end if;
  if new.source_table <> 'cashbook_daily_closings'
     and exists(select 1 from public.cashbook_daily_closings c where c.account_key=new.account_key and c.business_date=new.business_date and c.status='approved') then
    raise exception 'Cashbook date % is approved for account %. Record late corrections on an open date with the original reference and obtain management approval.',new.business_date,new.account_key;
  end if;
  return new;
end $$;

-- Idempotent backfill for transactions that predate this migration.
insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
select 'invoice:'||i.id||':receivable:'||i.total_paisa,'INV-'||i.id::text,coalesce(o.date,i.created_at::date,current_date),'market_credit',i.total_paisa,'receivable','invoices',i.id::text,i.number,'Invoice receivable',o.salesman_id,null
from public.invoices i join public.orders o on o.id=i.order_id where i.total_paisa>0
on conflict(posting_key) do nothing;

insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
select 'order:'||o.id||':cancel-receivable:v'||coalesce(o.version,1),'CANCEL-'||o.id::text,current_date,'market_credit',-i.total_paisa,'reversal','orders',o.id::text,coalesce(i.number,''),'Cancelled invoice receivable reversal',o.salesman_id,o.updated_by
from public.orders o join public.invoices i on i.order_id=o.id
where o.status='cancelled' and i.total_paisa>0
on conflict(posting_key) do nothing;

insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
select 'payment:'||p.id||':receipt',p.transaction_id,p.date,private.cashbook_method_account(p.method,o.salesman_id),p.amount_paisa,'receipt','payments',p.id::text,coalesce(p.reference,''),'Payment received — '||p.method,o.salesman_id,p.created_by
from public.payments p join public.invoices i on i.id=p.invoice_id join public.orders o on o.id=i.order_id
on conflict(posting_key) do nothing;

insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
select 'payment:'||p.id||':receivable',p.transaction_id,p.date,'market_credit',-p.amount_paisa,'receivable','payments',p.id::text,coalesce(p.reference,''),'Receivable recovered',o.salesman_id,p.created_by
from public.payments p join public.invoices i on i.id=p.invoice_id join public.orders o on o.id=i.order_id
on conflict(posting_key) do nothing;

insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,description,salesman_id,created_by)
select 'payment:'||p.id||':void-receipt',p.transaction_id,p.date,private.cashbook_method_account(p.method,o.salesman_id),-p.amount_paisa,'reversal','payments',p.id::text,'Voided payment reversal',o.salesman_id,p.created_by
from public.payments p join public.invoices i on i.id=p.invoice_id join public.orders o on o.id=i.order_id where p.voided_at is not null
on conflict(posting_key) do nothing;

insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,description,salesman_id,created_by)
select 'payment:'||p.id||':void-receivable',p.transaction_id,p.date,'market_credit',p.amount_paisa,'reversal','payments',p.id::text,'Voided payment receivable reversal',o.salesman_id,p.created_by
from public.payments p join public.invoices i on i.id=p.invoice_id join public.orders o on o.id=i.order_id where p.voided_at is not null
on conflict(posting_key) do nothing;

insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,description,salesman_id,created_by)
select 'expense:'||e.id||':v'||coalesce(e.version,1),e.id,e.date,coalesce(e.cashbook_account_key, private.cashbook_method_account(e.method,e.salesman_id)),-e.amount_paisa,'expense','expenses',e.id::text,'Expense — '||e.category,e.salesman_id,e.created_by
from public.expenses e where e.deleted_at is null
on conflict(posting_key) do nothing;

drop trigger if exists cashbook_approved_day_guard on public.cashbook_entries;
create trigger cashbook_approved_day_guard before insert on public.cashbook_entries
for each row execute function private.cashbook_guard_approved_day();

alter table public.cashbook_accounts enable row level security;
alter table public.cashbook_entries enable row level security;
alter table public.cashbook_daily_closings enable row level security;
revoke all on public.cashbook_accounts,public.cashbook_entries,public.cashbook_daily_closings from anon,authenticated;
grant select on public.cashbook_accounts,public.cashbook_entries,public.cashbook_daily_closings to authenticated;
drop policy if exists cashbook_accounts_read on public.cashbook_accounts;
create policy cashbook_accounts_read on public.cashbook_accounts for select to authenticated using (
  public.is_admin()
  or exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.id where p.id=auth.uid() and p.active and r.role='manager')
  or (salesman_id is not null and public.owns_salesman(salesman_id))
  or account_type='receivable'
  or public.has_permission('cashbook','view')
);
drop policy if exists cashbook_entries_read on public.cashbook_entries;
create policy cashbook_entries_read on public.cashbook_entries for select to authenticated using (
  public.is_admin()
  or exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.id where p.id=auth.uid() and p.active and r.role='manager')
  or (salesman_id is not null and public.owns_salesman(salesman_id))
  or public.has_permission('cashbook','view')
);
drop policy if exists cashbook_closings_read on public.cashbook_daily_closings;
create policy cashbook_closings_read on public.cashbook_daily_closings for select to authenticated using (
  public.is_admin()
  or exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.id where p.id=auth.uid() and p.active and r.role='manager')
  or exists(select 1 from public.cashbook_accounts a where a.account_key=cashbook_daily_closings.account_key and a.salesman_id is not null and public.owns_salesman(a.salesman_id))
  or public.has_permission('cashbook','view')
);

create or replace function public.cashbook_record_command(op_id uuid, kind text, data jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare src text; dst text; amt bigint; dt date; ref text; note text; role_name text; acct_key text; item jsonb; acct public.cashbook_accounts%rowtype; expected bigint; actual bigint; variance bigint; close_row public.cashbook_daily_closings%rowtype;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Active login required'; end if;
  if kind not in ('cashbook.close.submit','cashbook.handover')
     and not (public.is_admin() or exists(select 1 from public.user_roles where user_id=auth.uid() and role='manager')) then
    raise exception 'Management permission required for cashbook changes';
  end if;
  if exists(select 1 from public.cashbook_entries where posting_key like 'command:'||op_id::text||'%') then
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;
  if kind='cashbook.account.save' then
    if not public.is_admin() then raise exception 'Only Admin can configure accounts'; end if;
    acct_key:=nullif(data->>'account_key','');
    if acct_key is null or acct_key !~ '^[a-z][a-z0-9_:-]{2,79}$' then raise exception 'Invalid account key'; end if;
    if trim(coalesce(data->>'label',''))='' then raise exception 'Account name is required'; end if;
    if data->>'account_type' not in ('bank','wallet') then raise exception 'Only bank and wallet accounts can be added'; end if;
    if acct_key in ('cash_hand','market_credit') then raise exception 'This is a reserved system account key'; end if;
    if acct_key='bank_default' and (data->>'account_type'<>'bank' or coalesce(data->>'payment_method','')<>'Bank') then raise exception 'Default bank account must remain mapped to Bank'; end if;
    if acct_key='easypaisa' and (data->>'account_type'<>'wallet' or lower(coalesce(data->>'payment_method',''))<>'easypaisa') then raise exception 'EasyPaisa system account mapping cannot be changed'; end if;
    if acct_key='jazzcash' and (data->>'account_type'<>'wallet' or lower(coalesce(data->>'payment_method',''))<>'jazzcash') then raise exception 'JazzCash system account mapping cannot be changed'; end if;
    amt:=coalesce(nullif(data->>'opening_balance_paisa','')::bigint,0);
    if amt<0 then raise exception 'Opening balance cannot be negative'; end if;
    if exists(select 1 from public.cashbook_accounts a where a.account_key=acct_key and a.opening_balance_paisa<>amt and exists(select 1 from public.cashbook_entries e where e.account_key=acct_key)) then raise exception 'Account has ledger history; use an audited adjustment instead of changing its opening balance'; end if;
    if exists(select 1 from public.cashbook_accounts a where a.account_key=acct_key and (a.account_type<>data->>'account_type' or coalesce(a.payment_method,'')<>coalesce(data->>'payment_method','')) and exists(select 1 from public.cashbook_entries e where e.account_key=acct_key)) then raise exception 'Account type/method cannot change after ledger activity; create a new account'; end if;
    insert into public.cashbook_accounts(account_key,label,account_type,payment_method,opening_balance_paisa,active,created_by)
    values(acct_key,trim(data->>'label'),data->>'account_type',data->>'payment_method',0,true,auth.uid())
    on conflict(account_key) do update set label=excluded.label, account_type=excluded.account_type, payment_method=excluded.payment_method, opening_balance_paisa=0, active=true;
    if amt>0 then
      insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,description,created_by)
      values('command:'||op_id::text||':opening',op_id::text,current_date,acct_key,amt,'adjustment','cashbook_accounts',acct_key,'Opening balance',auth.uid())
      on conflict(posting_key) do nothing;
    end if;
    return jsonb_build_object('ok',true,'account_key',acct_key);
  elsif kind='cashbook.transfer' then
    src:=data->>'source_account'; dst:=data->>'destination_account'; amt:=nullif(data->>'amount_paisa','')::bigint;
    dt:=coalesce(nullif(data->>'date','')::date,current_date); ref:=coalesce(data->>'reference',''); note:=coalesce(data->>'description','');
    if src is null or dst is null or src=dst then raise exception 'Choose two different accounts'; end if;
    if amt is null or amt<=0 then raise exception 'Transfer amount must be positive'; end if;
    if not exists(select 1 from public.cashbook_accounts where account_key=src and active) or not exists(select 1 from public.cashbook_accounts where account_key=dst and active) then raise exception 'Choose active accounts'; end if;
    select (case when dt < a.created_at::date then 0 else a.opening_balance_paisa end) + coalesce((select sum(e.amount_paisa) from public.cashbook_entries e where e.account_key=a.account_key and e.business_date<=dt),0)
      into expected from public.cashbook_accounts a where a.account_key=src;
    if expected < amt then raise exception 'Insufficient balance in the source account'; end if;
    insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,created_by)
    values('command:'||op_id::text||':out',op_id::text,dt,src,-amt,'transfer_out','cashbook',op_id::text,ref,coalesce(nullif(note,''),'Account transfer'),auth.uid()),
          ('command:'||op_id::text||':in',op_id::text,dt,dst,amt,'transfer_in','cashbook',op_id::text,ref,coalesce(nullif(note,''),'Account transfer'),auth.uid());
    return jsonb_build_object('ok',true,'transaction_id',op_id::text);
  elsif kind='cashbook.handover' then
    src:=data->>'source_account'; amt:=nullif(data->>'amount_paisa','')::bigint;
    dt:=coalesce(nullif(data->>'date','')::date,current_date); ref:=coalesce(data->>'reference',''); note:=coalesce(data->>'description','Cash handed to office');
    select * into acct from public.cashbook_accounts where account_key=src and active;
    if not found or acct.account_type<>'salesman' or lower(coalesce(acct.payment_method,''))<>'cash' or not public.owns_salesman(acct.salesman_id) then raise exception 'Choose your own salesman cash collection account'; end if;
    if amt is null or amt<=0 then raise exception 'Handover amount must be positive'; end if;
    select coalesce((select sum(e.amount_paisa) from public.cashbook_entries e where e.account_key=src and e.business_date<=dt),0) into expected;
    if expected<amt then raise exception 'Insufficient cash in your collection'; end if;
    insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
    values('command:'||op_id::text||':out',op_id::text,dt,src,-amt,'transfer_out','cashbook',op_id::text,ref,note,acct.salesman_id,auth.uid()),
          ('command:'||op_id::text||':in',op_id::text,dt,'cash_hand',amt,'transfer_in','cashbook',op_id::text,ref,note||' — received by office',acct.salesman_id,auth.uid());
    return jsonb_build_object('ok',true,'transaction_id',op_id::text);
  elsif kind='cashbook.adjust' then
    src:=data->>'account_key'; amt:=nullif(data->>'amount_paisa','')::bigint;
    dt:=coalesce(nullif(data->>'date','')::date,current_date); ref:=coalesce(data->>'reference',''); note:=trim(coalesce(data->>'description',''));
    if src is null or not exists(select 1 from public.cashbook_accounts where account_key=src and active) then raise exception 'Choose an active account'; end if;
    if amt is null or amt=0 then raise exception 'Adjustment amount cannot be zero'; end if;
    if note='' then raise exception 'A reason is required for an adjustment'; end if;
    insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,created_by)
    values('command:'||op_id::text,op_id::text,dt,src,amt,'adjustment','cashbook',op_id::text,ref,note,auth.uid());
    return jsonb_build_object('ok',true,'transaction_id',op_id::text);
  elsif kind='cashbook.close.submit' then
    dt:=coalesce(nullif(data->>'date','')::date,current_date);
    note:=trim(coalesce(data->>'notes',''));
    if coalesce(jsonb_typeof(data->'actuals'),'') <> 'array' or jsonb_array_length(data->'actuals')=0 then raise exception 'Enter at least one actual account balance'; end if;
    for item in select value from jsonb_array_elements(data->'actuals') loop
      select * into acct from public.cashbook_accounts where account_key=item->>'account_key' and active and account_type<>'receivable';
      if not found then raise exception 'Unknown or non-cash account: %',item->>'account_key'; end if;
      if not (public.is_admin() or exists(select 1 from public.user_roles where user_id=auth.uid() and role='manager') or (acct.salesman_id is not null and public.owns_salesman(acct.salesman_id))) then raise exception 'You cannot close account %',acct.label; end if;
      actual:=nullif(item->>'actual_balance_paisa','')::bigint;
      if actual is null or actual<0 then raise exception 'Actual counted balances cannot be negative'; end if;
      expected:=case when dt < acct.created_at::date then 0 else acct.opening_balance_paisa end
        + coalesce((select sum(e.amount_paisa) from public.cashbook_entries e where e.account_key=acct.account_key and e.business_date<=dt),0);
      variance:=actual-expected;
      if variance<>0 and note='' then raise exception 'A reason is required for every closing variance'; end if;
      select * into close_row from public.cashbook_daily_closings where business_date=dt and account_key=acct.account_key;
      if found and close_row.status='approved' then raise exception 'Account % is already approved for this date',acct.label; end if;
      insert into public.cashbook_daily_closings(business_date,account_key,expected_balance_paisa,actual_balance_paisa,variance_paisa,notes,status,submitted_by,submitted_at,approved_by,approved_at)
      values(dt,acct.account_key,expected,actual,variance,note,'submitted',auth.uid(),now(),null,null)
      on conflict(business_date,account_key) do update set expected_balance_paisa=excluded.expected_balance_paisa,actual_balance_paisa=excluded.actual_balance_paisa,variance_paisa=excluded.variance_paisa,notes=excluded.notes,status='submitted',submitted_by=auth.uid(),submitted_at=now(),approved_by=null,approved_at=null;
    end loop;
    return jsonb_build_object('ok',true,'date',dt,'submitted',jsonb_array_length(data->'actuals'));
  elsif kind='cashbook.close.approve' then
    if not (public.is_admin() or exists(select 1 from public.user_roles where user_id=auth.uid() and role='manager')) then raise exception 'Management approval required'; end if;
    select * into close_row from public.cashbook_daily_closings where id=(data->>'closing_id')::uuid for update;
    if not found then raise exception 'Daily closing record not found'; end if;
    if close_row.status='approved' then return jsonb_build_object('ok',true,'already_approved',true,'closing_id',close_row.id); end if;
    if close_row.variance_paisa<>0 and trim(close_row.notes)='' then raise exception 'A reason is required before approving a variance'; end if;
    if close_row.variance_paisa<>0 then
      insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
      values('cashbook-close:'||close_row.id::text||':variance','CLOSE-'||close_row.id::text,close_row.business_date,close_row.account_key,close_row.variance_paisa,'adjustment','cashbook_daily_closings',close_row.id::text,'','Approved reconciliation adjustment: '||close_row.notes,(select salesman_id from public.cashbook_accounts where account_key=close_row.account_key),auth.uid())
      on conflict(posting_key) do nothing;
    end if;
    update public.cashbook_daily_closings set status='approved',approved_by=auth.uid(),approved_at=now() where id=close_row.id;
    return jsonb_build_object('ok',true,'closing_id',close_row.id,'variance_paisa',close_row.variance_paisa);
  else raise exception 'Unknown cashbook command: %',kind;
  end if;
end $$;

revoke all on function public.cashbook_record_command(uuid,text,jsonb) from public,anon;
grant execute on function public.cashbook_record_command(uuid,text,jsonb) to authenticated;
revoke all on function private.cashbook_ensure_salesman_account(text,text) from public,anon,authenticated;
revoke all on function private.cashbook_seed_salesman_accounts() from public,anon,authenticated;
revoke all on function private.cashbook_method_account(text,text) from public,anon,authenticated;
revoke all on function private.cashbook_post_invoice() from public,anon,authenticated;
revoke all on function private.cashbook_post_payment() from public,anon,authenticated;
revoke all on function private.cashbook_post_expense() from public,anon,authenticated;
revoke all on function private.cashbook_reverse_cancelled_order() from public,anon,authenticated;
revoke all on function private.cashbook_guard_approved_day() from public,anon,authenticated;
notify pgrst, 'reload schema';
