# Deploy BCBM v55.69

1. Back up the currently deployed folder and database before production changes.
2. Extract this ZIP and upload its contents through the normal Cloudflare static-folder deployment.
3. Hard refresh with Ctrl+F5.
4. In Admin, open a manager and a fixed-salary salesman profile and open/print a released salary slip.
5. Open a commission-basis salesman profile and verify the commission slip lists the confirmed sales/cartons and per-product commission amounts. Monthly carton target should be marked not applicable.
6. Release a test advance in a non-production/test environment and use View advance slip in both Admin and the employee profile.
7. In Cash & Bank Book → Verify actual closing balances, verify only centrally configured non-salesman bank/cash accounts appear for Admin.
8. Verify user creation does not create any new cashbook account. This patch adds no account-creation code and no SQL migration.

Checks run: node --check js/app.js and ZIP integrity. Live Supabase RLS, real payroll release and browser print rendering have not been tested. If slips still do not appear in Admin, inspect Supabase permissions on employee_salary_slips and employee_salary_advances; do not rerun salary release to work around a missing slip.
