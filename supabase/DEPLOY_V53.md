# v53 Deployment, Verification and Recovery

## Before deployment
1. Take a Supabase database backup and export current Storage object metadata.
2. Deploy to a staging project first.
3. Confirm `public.is_admin()`, `public.is_manager()`, `public.owns_salesman(text)`, `salesmen.manager_user_id`, and `salesmen.user_id` exist as expected.
4. Review `supabase/revamp_v53.sql`; do not run it against production if the schema differs.
5. Confirm the current Product Pricing and Stock Update workflows against test records.

## Apply
1. In Supabase SQL Editor, open the file `supabase/revamp_v53.sql` and paste its SQL contents (do not paste the filename itself).
2. Execute the migration.
3. Run the verification queries below.
4. Deploy the static site from `web/` (or use `npm run release` from the repository root to refresh `web/`).
5. Clear/reload the browser cache and verify the updated release is served.

## Verification SQL
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='salesmen' and column_name='date_of_birth';

select tablename, policyname, cmd
from pg_policies
where schemaname='public'
  and tablename in ('attendance_records','employee_documents','salesman_area_assignments','employee_notifications')
order by tablename, policyname;

select id, name, date_of_birth, photo_path, active
from public.salesmen order by name;

select count(*) as products_preserved from public.products;
select count(*) as stock_movements_preserved from public.stock_movements;
select count(*) as orders_preserved from public.orders;
```

## Required role tests
- Salesman: can read own attendance/documents/notifications; cannot insert/update attendance, upload or replace employee documents, or update `salesmen.photo_path`; cannot read another employee's private files.
- Manager: can access only assigned salesmen's operational records; verify manager file paths use the employee's linked `user_id` folder.
- Admin: can access and manage authorized employee records.
- Verify no salesman can access cashbook tables, wholesale pricing, margins, or another employee's salary through direct REST/RPC requests.
- Test product creation/edit/price update and stock update on staging, and verify rows and movement ledger after refresh.

## Recovery
The migration does not delete business data. If a policy causes an operational issue, restore the previous policy definitions from the pre-deployment backup / schema export and redeploy the prior ZIP. Do not drop newly added columns or tables without confirming that no new records have been created in them.
