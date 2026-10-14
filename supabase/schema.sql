-- Blesscon Candy Manager 2.0. Run once in Supabase SQL Editor; safe to re-run.
-- All browser mutations go through apply_command, never direct table writes.
create schema if not exists private;
revoke all on schema private from public;
create or replace function private.business_today() returns date language sql stable set search_path='' as $$select (now() at time zone 'Asia/Karachi')::date$$;
create table if not exists public.profiles(id uuid primary key references auth.users on delete cascade,display_name text not null default '',active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.user_roles(user_id uuid primary key references auth.users on delete cascade,role text not null default 'salesman',updated_at timestamptz not null default now());
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check check(role in ('admin','user','salesman'));
create table if not exists public.user_permissions(user_id uuid references auth.users on delete cascade,section text not null,can_view boolean default false,can_create boolean default false,can_edit boolean default false,can_delete boolean default false,can_export boolean default false,can_share boolean default false,updated_at timestamptz default now(),primary key(user_id,section));
alter table public.user_permissions drop constraint if exists user_permissions_section_check;
create table if not exists public.settings(id text primary key default 'business',value jsonb not null default '{}',version integer not null default 1,updated_at timestamptz default now(),updated_by uuid);
insert into public.settings(id,value) values('business','{"company_name":"Blesscon Candy","phone":"+923413905030","email":"blessconcandy@gmail.com","website":"www.blessconcandy.com","address":"","ntn":"","bank_details":"","terms":"Please pay by the agreed due date.","monthly_target":130,"boxes_per_carton":24,"base_salary_paisa":4500000,"working_days":[1,2,3,4,5,6],"holidays":[],"carry_month_end":true,"reduce_by_surplus":false,"block_negative_stock":true,"allow_customer_credit":false,"low_stock_boxes":24,"auto_salary_expense":false,"tiers":[{"min":0,"label":"1–5","rate_paisa":23000},{"min":6,"label":"6–24","rate_paisa":23000},{"min":25,"label":"25–49","rate_paisa":22500},{"min":50,"label":"50+","rate_paisa":22000}],"incentives":[{"min":0,"amount_paisa":0},{"min":60,"amount_paisa":300000},{"min":75,"amount_paisa":600000},{"min":90,"amount_paisa":800000},{"min":100,"amount_paisa":1000000}]}') on conflict do nothing;
create table if not exists public.products(id text primary key,name text not null check(length(trim(name))>0),category text default '',boxes_per_carton integer not null default 24 check(boxes_per_carton>0),cost_paisa bigint not null default 0 check(cost_paisa>=0),retail_paisa bigint not null default 0 check(retail_paisa>=0),wholesale_paisa bigint not null default 0 check(wholesale_paisa>=0),expiry_date date,active boolean not null default true,version integer not null default 1,created_at timestamptz default now(),updated_at timestamptz default now(),created_by uuid,updated_by uuid,deleted_at timestamptz);
create table if not exists public.price_tiers(id text primary key,product_id text not null references public.products,min_cartons numeric not null check(min_cartons>=0),label text not null,rate_paisa bigint not null check(rate_paisa>=0),version integer not null default 1,created_by uuid,updated_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),deleted_at timestamptz,unique(product_id,min_cartons));
create table if not exists public.salesmen(id text primary key,name text not null,phone text default '',user_id uuid unique references auth.users,joining_date date not null default private.business_today(),base_salary_paisa bigint not null default 4500000 check(base_salary_paisa>=0),monthly_target numeric not null default 130 check(monthly_target>0),active boolean not null default true,off_days jsonb not null default '[]',version integer not null default 1,created_by uuid,updated_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),deleted_at timestamptz);
create table if not exists public.customers(id text primary key,name text not null,phone text default '',email text default '',address text default '',salesman_id text references public.salesmen,version integer not null default 1,created_by uuid,updated_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),deleted_at timestamptz);
create table if not exists public.quotations(id uuid primary key default gen_random_uuid(),number text not null unique,customer_id text not null references public.customers,salesman_id text references public.salesmen,date date not null default private.business_today(),valid_until date not null,channel text not null check(channel in ('retail','wholesale')),status text not null default 'Draft' check(status in ('Draft','Sent','Accepted','Rejected','Expired','Converted')),revision integer not null default 1,subtotal_paisa bigint not null default 0,discount_paisa bigint not null default 0 check(discount_paisa>=0),total_paisa bigint not null default 0 check(total_paisa>=0),notes text default '',terms text default '',order_id uuid,share_token uuid,share_expires_at timestamptz,version integer not null default 1,created_by uuid,updated_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),deleted_at timestamptz);
create table if not exists public.orders(id uuid primary key default gen_random_uuid(),number text not null unique,customer_id text not null references public.customers,salesman_id text references public.salesmen,date date not null default private.business_today(),due_date date not null,channel text not null check(channel in ('retail','wholesale')),status text not null default 'confirmed' check(status in ('confirmed','cancelled')),subtotal_paisa bigint not null default 0,discount_paisa bigint not null default 0 check(discount_paisa>=0),total_paisa bigint not null default 0 check(total_paisa>=0),notes text default '',terms text default '',quotation_id uuid unique references public.quotations,version integer not null default 1,created_by uuid,updated_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),deleted_at timestamptz);
do $$ begin if not exists(select 1 from pg_constraint where conname='quotations_order_fk') then alter table public.quotations add constraint quotations_order_fk foreign key(order_id) references public.orders; end if; end $$;
create table if not exists public.order_items(id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders on delete cascade,product_id text not null references public.products,product_name text not null,cartons numeric not null check(cartons>=0 and cartons=trunc(cartons)),loose_boxes integer not null check(loose_boxes>=0),boxes_per_carton integer not null check(boxes_per_carton>0),boxes integer not null check(boxes>0),rate_paisa bigint not null check(rate_paisa>=0),cost_paisa bigint not null check(cost_paisa>=0),amount_paisa bigint not null check(amount_paisa>=0),tier_label text,override_reason text,unique(order_id,product_id));
create table if not exists public.quotation_items(like public.order_items including defaults including constraints);
-- quotation_items is independent from orders, with its own document foreign key.
alter table public.quotation_items drop column if exists order_id;
alter table public.quotation_items add column if not exists quotation_id uuid references public.quotations on delete cascade;
create unique index if not exists quotation_items_pk on public.quotation_items(id);
create unique index if not exists quotation_items_product on public.quotation_items(quotation_id,product_id);
create table if not exists public.invoices(id uuid primary key default gen_random_uuid(),order_id uuid not null unique references public.orders,number text not null unique,total_paisa bigint not null check(total_paisa>=0),share_token uuid unique,share_expires_at timestamptz,version integer not null default 1,created_at timestamptz default now(),updated_at timestamptz default now());
create table if not exists public.payments(id uuid primary key default gen_random_uuid(),transaction_id text not null unique,invoice_id uuid not null references public.invoices,date date not null,amount_paisa bigint not null check(amount_paisa>0),method text not null check(method in ('Cash','Bank','JazzCash','Easypaisa','Cheque')),reference text default '',received_by text not null,created_by uuid,created_at timestamptz default now(),voided_at timestamptz,void_reason text);
create table if not exists public.stock_movements(id uuid primary key default gen_random_uuid(),transaction_id text not null unique,product_id text not null references public.products,date date not null,boxes integer not null check(boxes<>0),kind text not null check(kind in ('opening','in','out','damage','adjustment','sale','reversal')),order_id uuid references public.orders,note text default '',created_by uuid,created_at timestamptz default now());
create table if not exists public.expenses(id text primary key,date date not null,category text not null,description text not null default '',amount_paisa bigint not null check(amount_paisa>0),method text not null default 'Cash',attachment_path text,salesman_id text references public.salesmen,salary_period text,version integer not null default 1,created_by uuid,updated_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),deleted_at timestamptz,unique(salesman_id,salary_period));
create table if not exists public.salesman_daily_targets(id text primary key,date date not null,salesman_id text not null references public.salesmen,base_target numeric not null,carried_forward_in numeric not null,effective_target numeric not null,achieved_cartons numeric not null default 0,achieved_boxes integer not null default 0,sales_amount bigint not null default 0,shortfall numeric not null default 0,surplus numeric not null default 0,carried_forward_out numeric not null default 0,imported_actual_cartons numeric not null default 0,imported_actual_boxes integer not null default 0,imported_sales_amount bigint not null default 0,closed boolean not null default false,updated_at timestamptz default now(),unique(salesman_id,date));
create table if not exists public.audit_log(id bigint generated always as identity primary key,table_name text not null,record_id text,action text not null,actor_id uuid,occurred_at timestamptz default now(),before_data jsonb,after_data jsonb);
create table if not exists private.commands(id uuid primary key,user_id uuid not null,kind text not null,result jsonb not null,created_at timestamptz default now());
create table if not exists private.number_sequences(prefix text,year integer,n integer not null,primary key(prefix,year));
create table if not exists private.migration_errors(id bigint generated always as identity primary key,section text,payload jsonb,error text,created_at timestamptz default now());
create index if not exists orders_salesman_date on public.orders(salesman_id,date);
create index if not exists movements_product on public.stock_movements(product_id);
create index if not exists payments_invoice on public.payments(invoice_id);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.user_roles r join public.profiles p on p.id=r.user_id and p.active where r.user_id=auth.uid() and r.role='admin')$$;
create or replace function public.has_permission(p_section text,p_action text default 'view') returns boolean language sql stable security definer set search_path='' as $$select public.is_admin() or exists(select 1 from public.user_permissions p join public.profiles pr on pr.id=p.user_id and pr.active where p.user_id=auth.uid() and p.section=p_section and case p_action when 'view' then p.can_view when 'create' then p.can_create when 'edit' then p.can_edit when 'delete' then p.can_delete when 'export' then p.can_export when 'share' then p.can_share else false end)$$;
create or replace function public.owns_salesman(sid text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.salesmen s join public.profiles p on p.id=s.user_id and p.active where s.id=sid and s.user_id=auth.uid() and s.active and s.deleted_at is null)$$;
create or replace function public.can_document(sid text,section text,action text default 'view') returns boolean language sql stable security definer set search_path='' as $$select public.is_admin() or (public.owns_salesman(sid) and action in ('view','create','edit','share','export') and (exists(select 1 from public.user_roles where user_id=auth.uid() and role='salesman') or public.has_permission(section,action)))$$;
-- Remove legacy policies before defining the complete policy set.
do $$ declare t text; p record; begin foreach t in array array['profiles','user_roles','user_permissions','products','price_tiers','customers','salesmen','salesman_daily_targets','quotations','quotation_items','orders','order_items','invoices','payments','stock_movements','expenses','settings','audit_log'] loop execute format('alter table public.%I enable row level security',t); for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t); end loop; execute format('revoke all on public.%I from anon, authenticated',t); execute format('grant select on public.%I to authenticated',t); end loop; end $$;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy roles_read on public.user_roles for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy permissions_read on public.user_permissions for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy product_read on public.products for select to authenticated using(public.is_admin() or public.has_permission('products') or exists(select 1 from public.salesmen s where s.user_id=auth.uid() and s.active));
create policy tiers_read on public.price_tiers for select to authenticated using(exists(select 1 from public.products p where p.id=product_id));
create policy salesman_read on public.salesmen for select to authenticated using(public.is_admin() or public.owns_salesman(id));
create policy customer_read on public.customers for select to authenticated using(public.is_admin() or public.owns_salesman(salesman_id) or (created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active)));
create policy orders_read on public.orders for select to authenticated using(public.can_document(salesman_id,'orders'));
create policy quotes_read on public.quotations for select to authenticated using(public.can_document(salesman_id,'quotes'));
create policy order_items_read on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
create policy quote_items_read on public.quotation_items for select to authenticated using(exists(select 1 from public.quotations q where q.id=quotation_id));
create policy invoice_read on public.invoices for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
create policy payment_read on public.payments for select to authenticated using(exists(select 1 from public.invoices i where i.id=invoice_id));
create policy target_read on public.salesman_daily_targets for select to authenticated using(public.is_admin() or public.owns_salesman(salesman_id));
create policy stock_admin on public.stock_movements for select to authenticated using(public.is_admin() or public.has_permission('stock'));
create policy expense_admin on public.expenses for select to authenticated using(public.is_admin() or public.has_permission('expenses'));
create policy settings_admin on public.settings for select to authenticated using(public.is_admin());
create policy audit_admin on public.audit_log for select to authenticated using(public.is_admin());
create or replace function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.audit_log(table_name,record_id,action,actor_id,before_data,after_data) values(tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'user_id',to_jsonb(old)->>'user_id'),tg_op,auth.uid(),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end); return coalesce(new,old); end $$;
do $$declare t text; begin foreach t in array array['profiles','user_roles','user_permissions','products','price_tiers','customers','salesmen','quotations','quotation_items','orders','order_items','invoices','payments','stock_movements','expenses','settings'] loop execute format('drop trigger if exists audit_change on public.%I',t); execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()',t); end loop; end $$;
create or replace function private.next_number(p text,d date) returns text language plpgsql set search_path='' as $$ declare v integer; y integer:=extract(year from d); candidate text; begin loop insert into private.number_sequences values(p,y,1) on conflict(prefix,year) do update set n=private.number_sequences.n+1 returning n into v; candidate:=p||'-'||y||'-'||lpad(v::text,4,'0'); exit when not exists(select 1 from public.orders where number=candidate) and not exists(select 1 from public.quotations where number=candidate); end loop; return candidate; end $$;
create or replace function public.app_settings() returns jsonb language sql stable security definer set search_path='' as $$select case when exists(select 1 from public.profiles where id=auth.uid() and active) then value - 'signature_data' else null end from public.settings where id='business'$$;
create or replace function public.stock_balances() returns table(product_id text,boxes bigint) language sql stable security definer set search_path='' as $$select p.id,coalesce(sum(m.boxes),0)::bigint from public.products p left join public.stock_movements m on m.product_id=p.id where exists(select 1 from public.profiles where id=auth.uid() and active) group by p.id$$;
create or replace function private.get_rate(pid text,n numeric,ch text) returns table(rate bigint,label text) language plpgsql set search_path='' as $$declare p public.products; t record; begin select * into strict p from public.products where id=pid; if ch='retail' then return query select p.retail_paisa,'Retail'::text; elsif p.name ilike 'Rani Candy%' then select pt.rate_paisa,pt.label into t from public.price_tiers pt where pt.product_id=pid and pt.deleted_at is null and pt.min_cartons<=n order by pt.min_cartons desc limit 1; if found then return query select t.rate_paisa,t.label; else return query select (x->>'rate_paisa')::bigint,x->>'label' from public.settings s,jsonb_array_elements(s.value->'tiers') x where s.id='business' and (x->>'min')::numeric<=n order by (x->>'min')::numeric desc limit 1; end if; else return query select p.wholesale_paisa,'Wholesale'::text; end if; end $$;
create or replace function private.save_master(t text,r jsonb,expected integer default null) returns jsonb language plpgsql set search_path='' as $$
declare allowed text[]; k text; old jsonb; result jsonb; cols text:=''; vals text:=''; updates text:=''; rid text:=r->>'id'; adm boolean:=public.is_admin(); begin
case t
 when 'products' then allowed:=array['id','name','category','boxes_per_carton','cost_paisa','retail_paisa','wholesale_paisa','expiry_date','active'];
 when 'price_tiers' then allowed:=array['id','product_id','min_cartons','label','rate_paisa'];
 when 'salesmen' then allowed:=array['id','name','phone','user_id','joining_date','base_salary_paisa','monthly_target','active','off_days'];
 when 'customers' then allowed:=array['id','name','phone','email','address','salesman_id'];
 when 'expenses' then allowed:=array['id','date','category','description','amount_paisa','method','attachment_path','salesman_id','salary_period'];
 when 'settings' then allowed:=array['id','value'];
 else raise exception 'Unsupported table'; end case;
if not adm and not(t='customers' or (t='expenses' and public.has_permission('expenses','create'))) then raise exception 'Admin required'; end if;
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
-- Only named business fields enter jsonb_populate_record; ownership/version cannot be supplied.
r:=(select jsonb_object_agg(key,value) from jsonb_each(r) where key=any(allowed));
foreach k in array allowed loop if r ? k then cols:=cols||format('%I,',k); vals:=vals||format('(jsonb_populate_record(null::public.%I,$1)).%I,',t,k); if k<>'id' then updates:=updates||format('%I=excluded.%I,',k,k); end if; end if; end loop;
if old is null then
 execute format('insert into public.%I (%s updated_by%s) select %s $2%s returning to_jsonb(%I.*)',t,cols,case when t='settings' then '' else ',created_by' end,vals,case when t='settings' then '' else ',$2' end,t) into result using r,auth.uid();
else
 execute format('insert into public.%I (%s updated_by) select %s $2 on conflict(id) do update set %s version=%I.version+1,updated_by=$2,updated_at=now() returning to_jsonb(%I.*)',t,cols,vals,updates||case when t='settings' then '' else 'deleted_at=null,' end,t,t) into result using r,auth.uid();
end if;
return result; end $$;
create or replace function private.save_document(d jsonb,is_quote boolean,imported boolean default false,preserve_quote uuid default null) returns jsonb language plpgsql set search_path='' as $$
declare rid uuid:=coalesce(nullif(d->>'id','')::uuid,gen_random_uuid()); tbl text:=case when is_quote then 'quotations' else 'orders' end; old jsonb; olditem jsonb; c public.customers; s public.salesmen; p public.products; l jsonb; ls jsonb:='[]'; n numeric:=0; b integer; rate bigint; cost bigint; tier text; amount bigint; subtotal bigint:=0; discount bigint:=coalesce((d->>'discount_paisa')::bigint,0); num text; day date:=(d->>'date')::date; due date; sid text:=nullif(d->>'salesman_id',''); iid uuid; stock bigint; conf jsonb; result jsonb; v integer:=1; reason text; begin
if jsonb_typeof(d->'items')<>'array' or jsonb_array_length(d->'items') not between 1 and 300 then raise exception '1 to 300 product lines required'; end if;
if day is null or day<date '2000-01-01' then raise exception 'Valid date required'; end if;
if d->>'channel' not in ('retail','wholesale') then raise exception 'Invalid channel'; end if;
execute format('select to_jsonb(x) from public.%I x where id=$1 for update',tbl) into old using rid;
if old is not null then
 if not public.can_document(old->>'salesman_id',case when is_quote then 'quotes' else 'orders' end,'edit') then raise exception 'Not authorised'; end if;
 if (old->>'version')::integer is distinct from (d->>'version')::integer then raise exception 'CONFLICT: Document changed; refresh first'; end if;
 if old->>'deleted_at' is not null or (is_quote and old->>'status' not in ('Draft','Sent')) or (not is_quote and old->>'status'='cancelled') then raise exception 'Document cannot be edited in this status'; end if;
 v:=(old->>'version')::integer+1;
end if;
if not public.can_document(sid,case when is_quote then 'quotes' else 'orders' end,case when old is null then 'create' else 'edit' end) then raise exception 'Cannot use this salesman'; end if;
if sid is not null then select * into s from public.salesmen where id=sid and active and deleted_at is null; if not found then raise exception 'Inactive or unknown salesman'; end if; end if;
select * into c from public.customers where id=d->>'customer_id' and deleted_at is null;
if not found or (not public.is_admin() and not(public.owns_salesman(c.salesman_id) or c.created_by=auth.uid())) then raise exception 'Customer not available'; end if;
select value into conf from public.settings where id='business';
if exists(select 1 from jsonb_array_elements(d->'items') x group by x->>'product_id' having count(*)>1) then raise exception 'Combine duplicate product lines'; end if;
for l in select value from jsonb_array_elements(d->'items') loop
 select * into p from public.products where id=l->>'product_id' and active and deleted_at is null for update;
 if not found then raise exception 'Unknown or inactive product: %',l->>'product_id'; end if;
 if (l->>'cartons')::numeric<0 or (l->>'cartons')::numeric<>trunc((l->>'cartons')::numeric) or (l->>'loose_boxes')::numeric<0 or (l->>'loose_boxes')::numeric<>trunc((l->>'loose_boxes')::numeric) then raise exception 'Quantities must be nonnegative whole numbers'; end if;
 b:=coalesce((l->>'cartons')::integer,0)*p.boxes_per_carton+coalesce((l->>'loose_boxes')::integer,0);
 if b<=0 or b>1000000 then raise exception 'Invalid quantity'; end if;
 if p.name ilike 'Rani Candy%' then n:=n+b::numeric/p.boxes_per_carton; end if;
end loop;
for l in select value from jsonb_array_elements(d->'items') loop
 select * into strict p from public.products where id=l->>'product_id';
 b:=(l->>'cartons')::integer*p.boxes_per_carton+(l->>'loose_boxes')::integer;
 select r.rate,r.label into rate,tier from private.get_rate(p.id,n,d->>'channel') r;
 if rate is null then raise exception 'Missing price for %',p.id; end if;
 cost:=p.cost_paisa; reason:=nullif(trim(l->>'override_reason'),'');
 if preserve_quote is not null then
  select to_jsonb(x) into olditem from public.quotation_items x where quotation_id=preserve_quote and product_id=p.id;
  if olditem is null or (olditem->>'boxes')::integer<>b then raise exception 'Quotation mismatch'; end if;
  rate:=(olditem->>'rate_paisa')::bigint; cost:=(olditem->>'cost_paisa')::bigint; tier:=olditem->>'tier_label'; reason:=olditem->>'override_reason';
 elsif imported then rate:=coalesce((l->>'rate_paisa')::bigint,rate); cost:=coalesce((l->>'cost_paisa')::bigint,cost); tier:=coalesce(l->>'tier_label',tier); reason:=coalesce(reason,'Workbook import');
 elsif (l->>'rate_paisa') is not null and (l->>'rate_paisa')::bigint<>rate then
  if not public.is_admin() or reason is null then raise exception 'PRICE_CHANGED: Review current price or provide an admin override reason'; end if;
  rate:=(l->>'rate_paisa')::bigint;
 end if;
 if rate<0 or cost<0 then raise exception 'Negative price'; end if;
 amount:=rate*b; subtotal:=subtotal+amount;
 ls:=ls||jsonb_build_array(jsonb_build_object('product_id',p.id,'product_name',p.name,'cartons',(l->>'cartons')::integer,'loose_boxes',(l->>'loose_boxes')::integer,'boxes_per_carton',p.boxes_per_carton,'boxes',b,'rate_paisa',rate,'cost_paisa',cost,'amount_paisa',amount,'tier_label',tier,'override_reason',reason));
end loop;
if discount<0 or discount>subtotal then raise exception 'Invalid discount'; end if;
num:=coalesce(old->>'number',case when imported then nullif(d->>'number','') end,private.next_number(case when is_quote then 'QT' else 'INV' end,day));
if is_quote then
 due:=coalesce((d->>'valid_until')::date,day+7); if due<day then raise exception 'Validity cannot precede quotation'; end if;
 insert into public.quotations(id,number,customer_id,salesman_id,date,valid_until,channel,subtotal_paisa,discount_paisa,total_paisa,notes,terms,created_by,updated_by,version) values(rid,num,c.id,sid,day,due,d->>'channel',subtotal,discount,subtotal-discount,coalesce(d->>'notes',''),coalesce(d->>'terms',''),auth.uid(),auth.uid(),v)
 on conflict(id) do update set customer_id=excluded.customer_id,salesman_id=excluded.salesman_id,date=excluded.date,valid_until=excluded.valid_until,channel=excluded.channel,subtotal_paisa=excluded.subtotal_paisa,discount_paisa=excluded.discount_paisa,total_paisa=excluded.total_paisa,notes=excluded.notes,terms=excluded.terms,revision=public.quotations.revision+1,version=excluded.version,updated_at=now(),updated_by=auth.uid();
 delete from public.quotation_items where quotation_id=rid;
 for l in select value from jsonb_array_elements(ls) loop insert into public.quotation_items(id,quotation_id,product_id,product_name,cartons,loose_boxes,boxes_per_carton,boxes,rate_paisa,cost_paisa,amount_paisa,tier_label,override_reason) values(gen_random_uuid(),rid,l->>'product_id',l->>'product_name',(l->>'cartons')::numeric,(l->>'loose_boxes')::integer,(l->>'boxes_per_carton')::integer,(l->>'boxes')::integer,(l->>'rate_paisa')::bigint,(l->>'cost_paisa')::bigint,(l->>'amount_paisa')::bigint,l->>'tier_label',l->>'override_reason'); end loop;
 select to_jsonb(q) into result from public.quotations q where id=rid;
else
 due:=coalesce((d->>'due_date')::date,day+7); if due<day then raise exception 'Due date cannot precede order'; end if;
 if old is not null then
  if exists(select 1 from public.payments pay join public.invoices i on i.id=pay.invoice_id where i.order_id=rid and pay.voided_at is null group by i.id having sum(pay.amount_paisa)>subtotal-discount) and not coalesce((conf->>'allow_customer_credit')::boolean,false) then raise exception 'Total is below payments; void/refund the payment first'; end if;
  insert into public.stock_movements(transaction_id,product_id,date,boxes,kind,order_id,note,created_by) select 'reverse-edit:'||rid||':'||v||':'||product_id,product_id,day,boxes,'reversal',rid,'Order edit revision '||v,auth.uid() from public.order_items where order_id=rid;
 end if;
 for l in select value from jsonb_array_elements(ls) loop
  select coalesce(sum(boxes),0) into stock from public.stock_movements where product_id=l->>'product_id';
  if stock<(l->>'boxes')::integer and coalesce((conf->>'block_negative_stock')::boolean,true) and not imported then raise exception 'Insufficient stock: % (% boxes available)',l->>'product_name',stock; end if;
 end loop;
 insert into public.orders(id,number,customer_id,salesman_id,date,due_date,channel,subtotal_paisa,discount_paisa,total_paisa,notes,terms,created_by,updated_by,version,quotation_id) values(rid,num,c.id,sid,day,due,d->>'channel',subtotal,discount,subtotal-discount,coalesce(d->>'notes',''),coalesce(d->>'terms',''),auth.uid(),auth.uid(),v,preserve_quote)
 on conflict(id) do update set customer_id=excluded.customer_id,salesman_id=excluded.salesman_id,date=excluded.date,due_date=excluded.due_date,channel=excluded.channel,subtotal_paisa=excluded.subtotal_paisa,discount_paisa=excluded.discount_paisa,total_paisa=excluded.total_paisa,notes=excluded.notes,terms=excluded.terms,version=excluded.version,updated_at=now(),updated_by=auth.uid();
 delete from public.order_items where order_id=rid;
 for l in select value from jsonb_array_elements(ls) loop
 insert into public.order_items(order_id,product_id,product_name,cartons,loose_boxes,boxes_per_carton,boxes,rate_paisa,cost_paisa,amount_paisa,tier_label,override_reason) values(rid,l->>'product_id',l->>'product_name',(l->>'cartons')::numeric,(l->>'loose_boxes')::integer,(l->>'boxes_per_carton')::integer,(l->>'boxes')::integer,(l->>'rate_paisa')::bigint,(l->>'cost_paisa')::bigint,(l->>'amount_paisa')::bigint,l->>'tier_label',l->>'override_reason');
 insert into public.stock_movements(transaction_id,product_id,date,boxes,kind,order_id,note,created_by) values('sale:'||rid||':'||v||':'||(l->>'product_id'),l->>'product_id',day,-(l->>'boxes')::integer,'sale',rid,num,auth.uid()); end loop;
 insert into public.invoices(id,order_id,number,total_paisa) values(rid,rid,num,subtotal-discount) on conflict(order_id) do update set total_paisa=excluded.total_paisa,version=public.invoices.version+1,updated_at=now();
 select to_jsonb(o) into result from public.orders o where id=rid;
end if;
return result; end $$;
create or replace function private.add_payment(d jsonb,imported boolean default false) returns jsonb language plpgsql set search_path='' as $$declare i public.invoices; o public.orders; paid bigint; n bigint:=(d->>'amount_paisa')::bigint; result jsonb; conf jsonb; old public.payments; begin
 select * into i from public.invoices where id=nullif(d->>'invoice_id','')::uuid or number=d->>'invoice_number' for update;
 if not found then raise exception 'Invoice not found'; end if; select * into strict o from public.orders where id=i.order_id;
 if o.status<>'confirmed' then raise exception 'Cannot receive payment on cancelled invoice'; end if;
 if not public.is_admin() and not(public.owns_salesman(o.salesman_id) and public.has_permission('invoices','create')) then raise exception 'Payment permission required'; end if;
 if n is null or n<=0 or d->>'received_by' is null or length(trim(d->>'received_by'))=0 then raise exception 'Positive amount and receiver required'; end if;
 select * into old from public.payments where transaction_id=d->>'transaction_id';
 if old.id is not null and not imported then
  if old.invoice_id=i.id and old.amount_paisa=n and old.voided_at is null then return to_jsonb(old); end if;
  raise exception 'Duplicate receipt ID with different details';
 end if;
 if old.id is not null and old.invoice_id<>i.id then raise exception 'Receipt ID already assigned to another invoice'; end if;
 select coalesce(sum(amount_paisa),0) into paid from public.payments where invoice_id=i.id and voided_at is null and (old.id is null or id<>old.id);
 select value into conf from public.settings where id='business';
 if paid+n>i.total_paisa and not coalesce((conf->>'allow_customer_credit')::boolean,false) then raise exception 'Overpayment blocked'; end if;
 insert into public.payments(id,transaction_id,invoice_id,date,amount_paisa,method,reference,received_by,created_by) values(coalesce(old.id,gen_random_uuid()),d->>'transaction_id',i.id,(d->>'date')::date,n,d->>'method',coalesce(d->>'reference',''),d->>'received_by',auth.uid()) on conflict(transaction_id) do update set date=excluded.date,amount_paisa=excluded.amount_paisa,method=excluded.method,reference=excluded.reference,received_by=excluded.received_by,voided_at=null,void_reason=null returning to_jsonb(payments.*) into result;
 return result; end $$;
create or replace function private.stock_entry(d jsonb,imported boolean default false) returns jsonb language plpgsql set search_path='' as $$declare old public.stock_movements; delta integer:=(d->>'boxes')::integer; result jsonb; tx text:=d->>'transaction_id'; begin
 if not public.is_admin() then raise exception 'Admin required'; end if;
 perform 1 from public.products where id=d->>'product_id' for update; if not found then raise exception 'Unknown product'; end if;
 if delta is null or (delta=0 and not imported) then raise exception 'Nonzero whole boxes required'; end if;
 if d->>'kind' not in ('opening','in','out','damage','adjustment') then raise exception 'Invalid manual movement type'; end if;
 select * into old from public.stock_movements where transaction_id=tx;
 if old.id is null and delta=0 then return jsonb_build_object('ignored_zero',true);end if;
 if old.id is not null then
  if not imported then return to_jsonb(old); end if;
  if old.product_id<>d->>'product_id' then raise exception 'Transaction product changed; correct with adjustment'; end if;
  -- Effective source amount includes all prior import corrections. The original remains immutable.
  select delta-coalesce(sum(boxes),0)::integer into delta from public.stock_movements where transaction_id=tx or note='Import correction of '||tx;
  if delta=0 then return to_jsonb(old); end if;
  tx:=tx||':correction:'||gen_random_uuid();
 end if;
 if not imported and (select coalesce(sum(boxes),0)+delta from public.stock_movements where product_id=d->>'product_id')<0 and (select coalesce((value->>'block_negative_stock')::boolean,true) from public.settings where id='business') then raise exception 'Movement would make stock negative'; end if;
 insert into public.stock_movements(transaction_id,product_id,date,boxes,kind,note,created_by) values(tx,d->>'product_id',(d->>'date')::date,delta,case when old.id is not null then 'adjustment' else d->>'kind' end,case when old.id is not null then 'Import correction of '||old.transaction_id else coalesce(d->>'note','') end,auth.uid()) returning to_jsonb(stock_movements.*) into result; return result; end $$;
create or replace function public.recalculate_targets(p_through date default private.business_today()) returns integer language plpgsql security definer set search_path='' as $$
declare s public.salesmen; cfg jsonb; d date; carry numeric; effective numeric; base numeric; achieved numeric; boxes integer; amount bigint; short numeric; surplus numeric; n integer:=0; wd integer; work boolean; actual public.salesman_daily_targets; cnt integer; begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Login required'; end if;
 if p_through>private.business_today()+32 then raise exception 'Maximum 32 days forecast'; end if;
 select value into cfg from public.settings where id='business';
 for s in select * from public.salesmen where deleted_at is null and (public.is_admin() or public.owns_salesman(id)) loop
 carry:=0;
 for d in select generate_series(s.joining_date,p_through,'1 day')::date loop
  if extract(day from d)=1 and not coalesce((cfg->>'carry_month_end')::boolean,true) then carry:=0; end if;
  work:=(cfg->'working_days') @> to_jsonb(array[extract(dow from d)::integer]) and not(cfg->'holidays' @> to_jsonb(array[d::text])) and not(s.off_days @> to_jsonb(array[d::text]));
  select count(*) into cnt from public.orders where salesman_id=s.id and date=d and status='confirmed' and deleted_at is null;
  select * into actual from public.salesman_daily_targets where salesman_id=s.id and date=d;
  if cnt>0 then
   select coalesce(sum(l.boxes::numeric/l.boxes_per_carton),0),coalesce(sum(l.boxes),0) into achieved,boxes from public.order_items l join public.orders o on o.id=l.order_id where o.salesman_id=s.id and o.date=d and o.status='confirmed' and o.deleted_at is null;
   select coalesce(sum(total_paisa),0) into amount from public.orders where salesman_id=s.id and date=d and status='confirmed' and deleted_at is null;
  else achieved:=coalesce(actual.imported_actual_cartons,0); boxes:=coalesce(actual.imported_actual_boxes,0); amount:=coalesce(actual.imported_sales_amount,0); end if;
  if not work and achieved=0 then delete from public.salesman_daily_targets where salesman_id=s.id and date=d and imported_actual_cartons=0; continue; end if;
  select count(*) into wd from generate_series(date_trunc('month',d),date_trunc('month',d)+interval '1 month - 1 day','1 day') x where (cfg->'working_days') @> to_jsonb(array[extract(dow from x)::integer]) and not(cfg->'holidays' @> to_jsonb(array[x::date::text])) and not(s.off_days @> to_jsonb(array[x::date::text]));
  base:=case when work and wd>0 then s.monthly_target/wd else 0 end;
  effective:=greatest(0,base+carry);short:=greatest(0,effective-achieved);surplus:=greatest(0,achieved-effective);
  insert into public.salesman_daily_targets(id,date,salesman_id,base_target,carried_forward_in,effective_target,achieved_cartons,achieved_boxes,sales_amount,shortfall,surplus,carried_forward_out,closed)
  values(s.id||':'||d,d,s.id,base,carry,effective,achieved,boxes,amount,short,surplus,case when coalesce((cfg->>'reduce_by_surplus')::boolean,false) then effective-achieved else short end,d<private.business_today())
  on conflict(id) do update set base_target=excluded.base_target,carried_forward_in=excluded.carried_forward_in,effective_target=excluded.effective_target,achieved_cartons=excluded.achieved_cartons,achieved_boxes=excluded.achieved_boxes,sales_amount=excluded.sales_amount,shortfall=excluded.shortfall,surplus=excluded.surplus,carried_forward_out=excluded.carried_forward_out,closed=excluded.closed,updated_at=now();
  carry:=case when coalesce((cfg->>'reduce_by_surplus')::boolean,false) then effective-achieved else short end;n:=n+1;
 end loop; end loop;
 update public.quotations set status='Expired',version=version+1 where valid_until<private.business_today() and status in ('Draft','Sent') and deleted_at is null and (public.is_admin() or public.owns_salesman(salesman_id));
 return n; end $$;
create or replace function public.apply_command(op_id uuid,kind text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cached private.commands; result jsonb; o public.orders; q public.quotations; r jsonb; v_table_name text; v integer; old jsonb; inv public.invoices; params jsonb; rid text; a bigint; n bigint; begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Active login required'; end if;
 -- Serialises stock, numbering, payments and conversions, including retries from offline devices.
 lock table private.commands in exclusive mode;
 select * into cached from private.commands where id=op_id;
 if cached.id is not null then if cached.user_id<>auth.uid() or cached.kind<>kind then raise exception 'Operation ID belongs to another request'; end if; return cached.result; end if;
 case kind
 when 'master.save' then result:=private.save_master(data->>'table',data->'record',(data->>'expected_version')::integer);
 when 'product.save' then
  if not public.is_admin() then raise exception 'Admin required'; end if;
  result:=private.save_master('products',data->'record',nullif(data->>'expected_version','')::integer);
  params:=coalesce(data->'tiers','[]'::jsonb);
  if jsonb_typeof(params)<>'array' then raise exception 'Product tiers must be an array'; end if;
  if jsonb_array_length(params)>0 and (not exists(select 1 from jsonb_array_elements(params) x where (x->>'min_cartons')::numeric=0) or exists(select 1 from (select (x->>'min_cartons')::numeric n,count(*) c from jsonb_array_elements(params) x group by 1 having count(*)>1) z) or exists(select 1 from jsonb_array_elements(params) x where (x->>'min_cartons')::numeric<0 or (x->>'rate_paisa')::bigint<0 or length(trim(coalesce(x->>'label','')))=0)) then raise exception 'Product tiers need unique minimums starting at 0 and valid labels/rates'; end if;
  update public.price_tiers set deleted_at=now(),version=version+1,updated_by=auth.uid(),updated_at=now() where product_id=data#>>'{record,id}' and deleted_at is null and not exists(select 1 from jsonb_array_elements(params) x where (x->>'min_cartons')::numeric=price_tiers.min_cartons);
  for r in select value from jsonb_array_elements(params) loop
   insert into public.price_tiers(id,product_id,min_cartons,label,rate_paisa,created_by,updated_by,deleted_at)
   values(coalesce(nullif(r->>'id',''),(data#>>'{record,id}')||':'||(r->>'min_cartons')),data#>>'{record,id}',(r->>'min_cartons')::numeric,r->>'label',(r->>'rate_paisa')::bigint,auth.uid(),auth.uid(),null)
   on conflict(product_id,min_cartons) do update set label=excluded.label,rate_paisa=excluded.rate_paisa,deleted_at=null,version=public.price_tiers.version+1,updated_by=auth.uid(),updated_at=now();
  end loop;
  result:=jsonb_build_object('product',(select to_jsonb(p) from public.products p where p.id=data#>>'{record,id}'),'tiers',(select coalesce(jsonb_agg(to_jsonb(pt)),'[]'::jsonb) from public.price_tiers pt where pt.product_id=data#>>'{record,id}' and pt.deleted_at is null));
 when 'master.delete' then
  if not public.is_admin() then raise exception 'Admin required for deletion'; end if;
  v_table_name:=data->>'table';if v_table_name not in ('products','customers','salesmen','expenses','price_tiers') then raise exception 'Invalid table'; end if;
  execute format('update public.%I set deleted_at=now(),version=version+1,updated_by=$1 where id=$2 and version=$3 returning to_jsonb(%I.*)',v_table_name,v_table_name) into result using auth.uid(),data->>'id',(data->>'version')::integer;
  if result is null then raise exception 'CONFLICT: Record changed'; end if;
 when 'order.save' then
  result:=private.save_document(data,false);
  if coalesce(data#>>'{payment,status}','unpaid')<>'unpaid' then
   select total_paisa into n from public.orders where id=(result->>'id')::uuid;
   params:=data->'payment';
   if coalesce(params->>'status','')='partial' and (nullif(params->>'amount_paisa','') is null or (params->>'amount_paisa')::bigint<=0 or (params->>'amount_paisa')::bigint>=n) then raise exception 'Part payment must be greater than zero and less than the order total'; end if;
   result:=result||jsonb_build_object('payment_result',private.add_payment(jsonb_build_object('invoice_id',(result->>'id'),'transaction_id',params->>'transaction_id','date',coalesce(params->>'date',private.business_today()::text),'amount_paisa',case when params->>'status'='paid' then n else (params->>'amount_paisa')::bigint end,'method',coalesce(params->>'method','Cash'),'reference',coalesce(params->>'reference',''),'received_by',coalesce(nullif(params->>'received_by',''),'Owner'))));
  end if;
 when 'order.cancel' then
  if not public.is_admin() then raise exception 'Admin required for cancellation'; end if;
  select * into strict o from public.orders where id=(data->>'id')::uuid for update;
  if o.status='cancelled' then result:=to_jsonb(o); else
   if o.version is distinct from (data->>'version')::integer then raise exception 'CONFLICT: Order changed'; end if;
   if exists(select 1 from public.payments p join public.invoices i on i.id=p.invoice_id where i.order_id=o.id and p.voided_at is null) then raise exception 'Void/refund recorded payments before cancelling'; end if;
   insert into public.stock_movements(transaction_id,product_id,date,boxes,kind,order_id,note,created_by) select 'cancel:'||o.id||':'||product_id,product_id,private.business_today(),boxes,'reversal',o.id,coalesce(data->>'reason','Cancelled'),auth.uid() from public.order_items where order_id=o.id;
   update public.orders set status='cancelled',version=version+1,updated_by=auth.uid(),updated_at=now() where id=o.id returning to_jsonb(orders.*) into result;
   update public.invoices set share_token=null,share_expires_at=null where order_id=o.id;
  end if;
 when 'quote.save' then result:=private.save_document(data,true);
 when 'quote.status' then
  select * into strict q from public.quotations where id=(data->>'id')::uuid for update;
  if not public.can_document(q.salesman_id,'quotes','edit') or q.deleted_at is not null then raise exception 'Not authorised'; end if;
  if q.version is distinct from (data->>'version')::integer then raise exception 'CONFLICT: Quotation changed'; end if;
  if not((q.status='Draft' and data->>'status'='Sent') or (q.status='Sent' and data->>'status' in ('Accepted','Rejected','Expired'))) then raise exception 'Invalid status transition'; end if;
  update public.quotations set status=data->>'status',version=version+1,updated_by=auth.uid(),updated_at=now() where id=q.id returning to_jsonb(quotations.*) into result;
 when 'quote.delete' then
  if not public.is_admin() then raise exception 'Admin required for deletion'; end if;
  select * into strict q from public.quotations where id=(data->>'id')::uuid for update;
  if q.status='Converted' or q.order_id is not null then raise exception 'Cannot delete converted quotation'; end if;
  if q.version is distinct from (data->>'version')::integer then raise exception 'CONFLICT: Quotation changed'; end if;
  if coalesce((data->>'hard')::boolean,false) then delete from public.quotations where id=q.id; result:=jsonb_build_object('deleted',q.id);
  else update public.quotations set deleted_at=now(),version=version+1,share_token=null,updated_by=auth.uid() where id=q.id returning to_jsonb(quotations.*) into result; end if;
 when 'quote.convert' then
  select * into strict q from public.quotations where id=(data->>'id')::uuid for update;
  if not public.can_document(q.salesman_id,'quotes','edit') then raise exception 'Not authorised'; end if;
  if q.status='Converted' or q.order_id is not null then raise exception 'Quotation already converted'; end if;
  if q.status in ('Rejected','Expired') or q.deleted_at is not null or q.valid_until<private.business_today() then raise exception 'Quotation expired or rejected'; end if;
  if q.version is distinct from (data->>'version')::integer then raise exception 'CONFLICT: Quotation changed'; end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into params from public.quotation_items x where quotation_id=q.id;
  if coalesce((data->>'reprice')::boolean,false) then select jsonb_agg(value-'rate_paisa'-'override_reason') into params from jsonb_array_elements(params); end if;
  params:=to_jsonb(q)||jsonb_build_object('id',coalesce(nullif(data->>'order_id','')::uuid,gen_random_uuid()),'date',private.business_today(),'due_date',coalesce((data->>'due_date')::date,private.business_today()+7),'version',null,'items',params);
  result:=private.save_document(params,false,false,case when coalesce((data->>'reprice')::boolean,false) then null else q.id end);
  update public.orders set quotation_id=q.id where id=(result->>'id')::uuid;
  update public.quotations set status='Converted',order_id=(result->>'id')::uuid,version=version+1,updated_by=auth.uid() where id=q.id;
  if coalesce(data#>>'{payment,status}','unpaid')<>'unpaid' then
   select total_paisa into n from public.orders where id=(result->>'id')::uuid;
   params:=data->'payment';
   if coalesce(params->>'status','')='partial' and (nullif(params->>'amount_paisa','') is null or (params->>'amount_paisa')::bigint<=0 or (params->>'amount_paisa')::bigint>=n) then raise exception 'Part payment must be greater than zero and less than the order total'; end if;
   perform private.add_payment(jsonb_build_object('invoice_id',(result->>'id'),'transaction_id',params->>'transaction_id','date',coalesce(params->>'date',private.business_today()::text),'amount_paisa',case when params->>'status'='paid' then n else (params->>'amount_paisa')::bigint end,'method',coalesce(params->>'method','Cash'),'reference',coalesce(params->>'reference',''),'received_by',coalesce(nullif(params->>'received_by',''),'Owner')));
  end if;
 when 'payment.add' then result:=private.add_payment(data);
 when 'payment.void' then
  if not public.is_admin() or length(trim(coalesce(data->>'reason','')))=0 then raise exception 'Admin and reason required'; end if;
  update public.payments set voided_at=now(),void_reason=data->>'reason' where id=(data->>'id')::uuid and voided_at is null returning to_jsonb(payments.*) into result;
  if result is null then raise exception 'Payment already voided or missing'; end if;
 when 'stock.add' then result:=private.stock_entry(data);
 when 'share.create' then
  if data->>'type'='quote' then
   select * into strict q from public.quotations where id=(data->>'id')::uuid and deleted_at is null;
   if not public.can_document(q.salesman_id,'quotes','share') then raise exception 'Share permission required'; end if;
   update public.quotations set share_token=gen_random_uuid(),share_expires_at=now()+interval '30 days' where id=q.id returning jsonb_build_object('token',share_token,'expires',share_expires_at) into result;
  else
   select * into strict inv from public.invoices where id=(data->>'id')::uuid;
   select * into strict o from public.orders where id=inv.order_id and status='confirmed';
   if not public.can_document(o.salesman_id,'invoices','share') then raise exception 'Share permission required'; end if;
   update public.invoices set share_token=gen_random_uuid(),share_expires_at=now()+interval '30 days' where id=inv.id returning jsonb_build_object('token',share_token,'expires',share_expires_at) into result;
  end if;
 when 'share.revoke' then
  if data->>'type'='quote' then select * into strict q from public.quotations where id=(data->>'id')::uuid; if not public.can_document(q.salesman_id,'quotes','share') then raise exception 'Not authorised'; end if;update public.quotations set share_token=null,share_expires_at=null where id=q.id;
  else select * into strict inv from public.invoices where id=(data->>'id')::uuid;select * into strict o from public.orders where id=inv.order_id;if not public.can_document(o.salesman_id,'invoices','share') then raise exception 'Not authorised';end if;update public.invoices set share_token=null,share_expires_at=null where id=inv.id;end if;result:='{"revoked":true}';
 when 'import.batch' then
  if not public.is_admin() then raise exception 'Admin required'; end if;
  select coalesce(max(id),0) into a from public.audit_log;
  if a is distinct from (data->>'audit_cursor')::bigint then raise exception 'CONFLICT: Business data changed since preview; import again'; end if;
  foreach v_table_name in array array['settings','products','price_tiers','salesmen','customers'] loop
   for r in select value from jsonb_array_elements(case when v_table_name='settings' then jsonb_build_array(data->'settings') else coalesce(data->v_table_name,'[]') end) loop
    execute format('select version from public.%I where id=$1',v_table_name) into v using r->>'id';perform private.save_master(v_table_name,r,v);
   end loop;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(data->'stock_movements','[]')) loop perform private.stock_entry(r,true);end loop;
  for r in select value from jsonb_array_elements(coalesce(data->'orders','[]')) loop
   select to_jsonb(x) into old from public.orders x where number=r->>'number';
   if old is not null then r:=r||jsonb_build_object('id',old->>'id','version',old->'version');end if;
   perform private.save_document(r,false,true);
  end loop;
  for r in select value from jsonb_array_elements(coalesce(data->'payments','[]')) loop perform private.add_payment(r,true);end loop;
  for r in select value from jsonb_array_elements(coalesce(data->'expenses','[]')) loop select version into v from public.expenses where id=r->>'id';perform private.save_master('expenses',r,v);end loop;
  for r in select value from jsonb_array_elements(coalesce(data->'daily_actuals','[]')) loop
   insert into public.salesman_daily_targets(id,date,salesman_id,base_target,carried_forward_in,effective_target,imported_actual_cartons,imported_actual_boxes,imported_sales_amount)
   values(r->>'id',(r->>'date')::date,r->>'salesman_id',0,0,0,(r->>'imported_actual_cartons')::numeric,(r->>'imported_actual_boxes')::integer,(r->>'imported_sales_amount')::bigint)
   on conflict(id) do update set imported_actual_cartons=excluded.imported_actual_cartons,imported_actual_boxes=excluded.imported_actual_boxes,imported_sales_amount=excluded.imported_sales_amount;
  end loop;
  result:=jsonb_build_object('imported',true,'products',jsonb_array_length(data->'products'),'orders',jsonb_array_length(data->'orders'));
 when 'user.provision' then
  if not public.is_admin() then raise exception 'Admin required';end if;
  if data->>'role' not in ('admin','salesman','user') or length(trim(data->>'display_name'))<2 then raise exception 'Invalid user fields';end if;
  if not exists(select 1 from auth.users where id=(data->>'user_id')::uuid) then raise exception 'Auth user missing';end if;
  insert into public.profiles(id,display_name,active) values((data->>'user_id')::uuid,data->>'display_name',true);
  insert into public.user_roles(user_id,role) values((data->>'user_id')::uuid,data->>'role');
  if nullif(data->>'salesman_id','') is not null then
   update public.salesmen set user_id=(data->>'user_id')::uuid,updated_by=auth.uid(),version=version+1 where id=data->>'salesman_id' and user_id is null and active and deleted_at is null;
   if not found then raise exception 'Salesman missing or already linked';end if;
  end if;
  update public.admin_user_requests set status='complete',created_user_id=(data->>'user_id')::uuid where id=op_id and actor_id=auth.uid();
  result:=jsonb_build_object('user_id',data->>'user_id');
 when 'user.update' then
  if not public.is_admin() then raise exception 'Admin required';end if;
  if data->>'id'=auth.uid()::text then raise exception 'Use another admin to change your own access';end if;
  update public.profiles set active=(data->>'active')::boolean,updated_at=now() where id=(data->>'id')::uuid;
  update public.user_roles set role=data->>'role',updated_at=now() where user_id=(data->>'id')::uuid;
  for r in select value from jsonb_array_elements(coalesce(data->'permissions','[]')) loop
   if r->>'section' not in ('dashboard','orders','invoices','quotes','stock','products','staff','expenses','pnl','settings','users','ledger') then raise exception 'Invalid section';end if;
   insert into public.user_permissions(user_id,section,can_view,can_create,can_edit,can_delete,can_export,can_share) values((data->>'id')::uuid,r->>'section',coalesce((r->>'can_view')::boolean,false),coalesce((r->>'can_create')::boolean,false),coalesce((r->>'can_edit')::boolean,false),false,coalesce((r->>'can_export')::boolean,false),coalesce((r->>'can_share')::boolean,false)) on conflict(user_id,section) do update set can_view=excluded.can_view,can_create=excluded.can_create,can_edit=excluded.can_edit,can_delete=false,can_export=excluded.can_export,can_share=excluded.can_share;
  end loop; result:='{"updated":true}';
 else raise exception 'Unknown command';end case;
 if kind in ('order.save','order.cancel','quote.convert','import.batch','master.save') then perform public.recalculate_targets(private.business_today()+7);end if;
 insert into private.commands(id,user_id,kind,result) values(op_id,auth.uid(),kind,coalesce(result,'{}'));
 return coalesce(result,'{}');end $$;
-- Public document access is by unguessable, expiring, revocable token only.
create or replace function public.shared_document(token uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare i public.invoices;q public.quotations;o public.orders;doc jsonb;cfg jsonb;begin
 select jsonb_build_object('company_name',value->'company_name','address',value->'address','phone',value->'phone','email',value->'email','website',value->'website','ntn',value->'ntn','bank_details',value->'bank_details','terms',value->'terms','signature_name',value->'signature_name') into cfg from public.settings where id='business';
 select * into i from public.invoices where share_token=token and share_expires_at>now();
 if found then select * into strict o from public.orders where id=i.order_id and status='confirmed' and deleted_at is null;
  select jsonb_build_object('type','invoice','settings',cfg,'document',to_jsonb(o)-'created_by'-'updated_by','invoice',to_jsonb(i)-'share_token','customer',(select to_jsonb(c)-'created_by'-'updated_by' from public.customers c where id=o.customer_id),'salesman',(select name from public.salesmen where id=o.salesman_id),'items',(select jsonb_agg(to_jsonb(l)-'cost_paisa'-'override_reason') from public.order_items l where order_id=o.id),'payments',(select coalesce(jsonb_agg(jsonb_build_object('date',p.date,'amount_paisa',p.amount_paisa,'method',p.method)),'[]') from public.payments p where invoice_id=i.id and voided_at is null)) into doc;return doc;
 end if;
 select * into q from public.quotations where share_token=token and share_expires_at>now() and deleted_at is null;
 if not found then raise exception 'Link expired or unavailable';end if;
 return jsonb_build_object('type','quote','settings',cfg,'document',to_jsonb(q)-'share_token'-'created_by'-'updated_by','customer',(select to_jsonb(c)-'created_by'-'updated_by' from public.customers c where id=q.customer_id),'salesman',(select name from public.salesmen where id=q.salesman_id),'items',(select jsonb_agg(to_jsonb(l)-'cost_paisa'-'override_reason') from public.quotation_items l where quotation_id=q.id),'payments','[]'::jsonb);
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.apply_command(uuid,text,jsonb),public.recalculate_targets(date),public.app_settings(),public.stock_balances(),public.shared_document(uuid),public.is_admin(),public.has_permission(text,text),public.owns_salesman(text),public.can_document(text,text,text) from public,anon;
grant execute on function public.apply_command(uuid,text,jsonb),public.recalculate_targets(date),public.app_settings(),public.stock_balances(),public.is_admin(),public.has_permission(text,text),public.owns_salesman(text),public.can_document(text,text,text) to authenticated;
grant execute on function public.shared_document(uuid) to anon,authenticated;
-- Legacy storage is kept read-only for migration/backup and no longer exposed to browser users.
do $$begin if to_regclass('public.business_sections') is not null then revoke all on public.business_sections from authenticated,anon;end if;end $$;
-- Private receipt images; paths are always <uploader UUID>/<random UUID>.<extension>.
do $$begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('expense-receipts','expense-receipts',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
  execute 'drop policy if exists blesscon_receipt_read on storage.objects';
  execute 'create policy blesscon_receipt_read on storage.objects for select to authenticated using (bucket_id=''expense-receipts'' and (public.is_admin() or ((storage.foldername(name))[1]=auth.uid()::text and public.has_permission(''expenses'',''view''))))';
  execute 'drop policy if exists blesscon_receipt_insert on storage.objects';
  execute 'create policy blesscon_receipt_insert on storage.objects for insert to authenticated with check (bucket_id=''expense-receipts'' and (storage.foldername(name))[1]=auth.uid()::text and public.has_permission(''expenses'',''create''))';
  execute 'drop policy if exists blesscon_receipt_delete on storage.objects';
  execute 'create policy blesscon_receipt_delete on storage.objects for delete to authenticated using (bucket_id=''expense-receipts'' and public.is_admin())';
 end if;end $$;
create table if not exists public.admin_user_requests(id uuid primary key,actor_id uuid not null,created_user_id uuid,email text not null,status text not null default 'pending',created_at timestamptz default now());
alter table public.admin_user_requests enable row level security;
revoke all on public.admin_user_requests from anon,authenticated;
drop policy if exists admin_request_read on public.admin_user_requests;
create policy admin_request_read on public.admin_user_requests for select to authenticated using(public.is_admin());
grant select on public.admin_user_requests to authenticated;
do $$begin if exists(select 1 from pg_roles where rolname='service_role') then grant all on public.profiles,public.user_roles,public.user_permissions,public.salesmen,public.admin_user_requests to service_role; end if;end $$;

-- One MVCC snapshot prevents mixed totals if another user saves during refresh.
create or replace function public.business_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$select jsonb_build_object(
'products',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.products x),
'price_tiers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.price_tiers x),
'customers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.customers x),
'salesmen',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.salesmen x),
'salesman_daily_targets',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.salesman_daily_targets x),
'quotations',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.quotations x),
'quotation_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.quotation_items x),
'orders',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.orders x),
'order_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.order_items x),
'invoices',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.invoices x),
'payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.payments x),
'stock_movements',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.stock_movements x),
'expenses',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.expenses x),
'audit_log',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.audit_log x),
'profiles',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.profiles x),
'user_roles',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.user_roles x),
'user_permissions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.user_permissions x),
'settings',coalesce((select value from public.settings where id='business'),public.app_settings()),
'settings_version',coalesce((select version from public.settings where id='business'),1),
'stock',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.stock_balances() x))$$;
revoke all on function public.business_snapshot() from public,anon;
grant execute on function public.business_snapshot() to authenticated;


GRANT USAGE ON SCHEMA public TO authenticated;
NOTIFY pgrst, 'reload schema';

GRANT USAGE ON SCHEMA public TO authenticated;
NOTIFY pgrst, 'reload schema';
