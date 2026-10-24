# BCBM v55.72 — Advance-only salary separation and Admin diagnostics

- Advance-only slips no longer show the advance amount as Basic Salary or as total salary earnings. The original template layout remains unchanged; salary earnings are shown as not applicable for an advance-only transaction, while the Advance Salary Details and amount paid remain sourced from the advance record.
- Updated service-worker cache key to force clients to request the new frontend after deployment.
- Improved Admin profile error wording to identify missing Supabase SELECT permissions on `employee_salary_slips` as a backend issue.
- No payroll records or account data are changed by this frontend build.
- Validation: JavaScript syntax and ZIP integrity checks. Live Supabase policies and browser print output still require testing.
