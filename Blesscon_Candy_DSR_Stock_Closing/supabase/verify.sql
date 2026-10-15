-- Run after schema.sql to identify missing required tables/functions/policies.
with required(name) as (values
 ('products'),('price_tiers'),('customers'),('salesmen'),('orders'),('order_items'),
 ('quotations'),('quotation_items'),('invoices'),('payments'),('stock_movements'),
 ('expenses'),('settings'),('profiles'),('user_roles'),('user_permissions'))
select 'table' as object_type, name, case when to_regclass('public.'||name) is null then 'MISSING' else 'OK' end as status
from required
union all
select 'function', name, case when to_regprocedure('public.'||name||'()') is null then 'MISSING' else 'OK' end
from (values ('business_snapshot'),('stock_balances'),('app_settings')) f(name)
union all
select 'policy', c.relname||'.'||p.polname, 'OK'
from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
order by 1,2;
