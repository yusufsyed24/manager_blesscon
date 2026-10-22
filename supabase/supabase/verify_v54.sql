-- Read-only verification queries for Blesscon Candy Business Manager v54.
-- Run after revamp_v54.sql. These queries do not modify business records.
select to_regclass('public.sales_areas') as sales_areas_table,
       to_regclass('public.salesman_area_assignments') as area_assignments_table,
       to_regclass('public.employee_notifications') as notifications_table,
       to_regclass('public.attendance_records') as attendance_table,
       to_regclass('public.employee_documents') as employee_documents_table;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('assign_salesman_area','set_salesman_photo','own_salary_snapshot');

select tablename, rowsecurity
from pg_tables
where schemaname='public' and tablename in ('salesman_area_assignments','employee_notifications','attendance_records','employee_documents');

select indexname, tablename
from pg_indexes
where schemaname='public' and tablename in ('salesman_area_assignments','employee_notifications','attendance_records');

select id, name, manager_user_id, user_id, active, territory, area, date_of_birth
from public.salesmen
where deleted_at is null
order by name;

-- Account identity audit: review any existing keys that are label-equivalent to the canonical names.
select account_key, label, account_type, opening_balance_paisa, active
from public.cashbook_accounts
where label ilike '%MCB%' or label ilike '%Al Habib%' or account_key in ('mcb_bank','al_habib_bank','cash_hand','easypaisa','jazzcash','market_credit')
order by label;
