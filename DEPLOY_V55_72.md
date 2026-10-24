# Deploy BCBM v55.72

1. Back up the deployed folder.
2. Extract the ZIP and upload the contents using the normal Cloudflare folder deployment.
3. Hard refresh with Ctrl+F5. The service-worker cache key has changed.
4. Print an advance-only slip. It must not display the advance amount as Basic Salary or total salary earnings; the amount should remain in Advance Salary Details and the payment amount.
5. In Admin, open the employee profile and Salary slips section. If it shows a SELECT permission error, review the Supabase SELECT policy for `public.employee_salary_slips` and confirm it allows authorized Admin users to read the target employee's slips. A frontend build cannot override RLS.
6. Verify an actual salary slip separately; do not re-release payroll to work around a missing history row.

Syntax and ZIP integrity checks are run for this build. Live Supabase/RLS and browser print output are not available for verification in this environment.
