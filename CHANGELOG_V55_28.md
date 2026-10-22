# v55.28 — Manager salary release

- Added a **Release salary** action for each manager in Admin → Users & Access → Managers & company target.
- Admin enters the manager's gross salary for the selected pay period; the app calculates outstanding salary advances, deducts oldest-first, and pays only the positive net amount.
- Salary expense description records gross salary, advance deduction, advance reasons, and optional payment reference; payment uses the selected Cash & Bank Book account.
- Manager payroll is period-scoped and protected against duplicate releases by both an application check and a partial unique index.
- Salesman salary release and its existing deduction flow remain available and unchanged.
- Added `supabase/manager_salary_release_v55_28.sql` to add the manager payroll link and extend the existing `private.save_master` expenses allowlist without replacing other security checks.

## Validation

- JavaScript syntax checks and project release checks should be run before deployment.
- SQL migration has not been executed against the user's live Supabase database. Apply only after taking a database backup.
- As with the existing v55.27 salesman workflow, the expense insert and advance-recovery updates are separate client operations rather than one database transaction. If recovery updates fail after salary posting, do not repost the salary; reconcile the outstanding advances first.
