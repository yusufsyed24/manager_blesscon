# Deploy BCBM v55.62 — Monthly advance salary slips

1. Back up the current deployed frontend and Supabase database.
2. Run `supabase/salary_slips_notifications_v55_61.sql` in Supabase SQL Editor if it has not already been applied. This file includes a syntax fix for the v55.61 table definition.
3. Upload the ZIP contents to the existing Cloudflare static publishing root (no Wrangler required for the static frontend).
4. Hard refresh with Ctrl+F5; the service-worker cache name is bumped to v55.62.
5. Sign in as a test employee and check My salary this month → salary & advance slips → select the month of an existing posted advance → View advance slip.
6. In Admin → Users & Access → salesman Profile → Salary & advance history, verify the same posted advance has a View advance slip action.
7. Test print/save as PDF and confirm the correct employee, amount, date, reason and payment account.

The frontend uses existing posted advance records from `employee_salary_advances`. It does not modify historical financial records. Live Supabase/RLS testing has not been performed from this build environment; verify in staging before production.
