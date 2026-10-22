# v55.26 — Admin Salary Advances

- Added an Admin-only **Advance salary** action in the Salesmen & Targets section.
- Admin can choose an active salesman or manager, amount, date, payment account, mandatory reason, and optional reference.
- Added recent advance history to the release dialog.
- Added additive Supabase migration `supabase/employee_salary_advances_v55_26.sql`.
- Migration validates exactly one employee recipient, positive amount, non-receivable active payment account, and Admin-only access.
- Each advance creates a single idempotently keyed Cash & Bank Book debit entry via a database trigger.
- This feature records advances separately from regular salary expenses; payroll deduction/recovery rules are not changed by this build.
