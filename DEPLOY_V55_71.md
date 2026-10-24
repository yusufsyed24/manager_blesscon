# Deploy BCBM v55.71 — Advance slip and Admin salary history fix

1. Back up the currently deployed folder and database.
2. Extract the ZIP and upload its contents using the usual Cloudflare static-folder deployment.
3. Hard-refresh the site with Ctrl+F5.
4. In an Admin salesman profile, open Salary & advance history and use View advance slip. Confirm Basic Salary is not shown as the advance amount and Advance Amount equals the amount released.
5. In an Admin manager profile, check Salary slips · month-wise and Advance salary slips.
6. If a released salary is still absent, read the error shown in the profile. Confirm `employee_salary_slips` contains a row for that employee and that the `employee_salary_slips_read` policy allows `public.is_admin()`. Do not release salary a second time just to create a slip.

Checks: JavaScript syntax and ZIP integrity. Live Supabase RLS and browser print output have not been tested. This build includes no SQL migration.
