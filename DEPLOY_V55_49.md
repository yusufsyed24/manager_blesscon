# BCBM v55.49 — Admin payroll order_items permission fix

The v55.48 Admin payroll screen reported:
`order_items: permission denied for table order_items`

This build includes a narrowly scoped Supabase migration:
`supabase/admin_payroll_order_items_permission_v55_49.sql`

## Required steps
1. Back up your Supabase database.
2. Open Supabase SQL Editor.
3. Run the migration file above.
4. Confirm the verification query returns `order_items_admin_payroll_read`.
5. Deploy the ZIP contents to the same GitHub Pages publishing root.
6. Sign in as Admin, hard-refresh the page, and press Refresh data in Salary & Payroll.

The migration grants SELECT on `public.order_items` to authenticated users at the SQL privilege layer, but its RLS policy allows rows only when `public.is_admin()` is true. It does not grant read access to managers or salesmen. Existing policies remain in place.

Validation performed: ZIP integrity and JavaScript syntax checks. Live Supabase permissions and real salary figures have not been tested in the user's project. Do not release salary until the warning disappears and figures are verified.
