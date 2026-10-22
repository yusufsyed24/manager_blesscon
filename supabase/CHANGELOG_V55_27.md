# v55.27.0 — Editable Salary Advances and Salary Deduction

- Admin can edit an advance amount and reason, including after partial recovery, provided the revised amount is not below the amount already recovered.
- Amount edits create a cashbook adjustment and audit-log record.
- Salesman salary release shows gross, outstanding advances, deduction, advance reasons and net payment.
- Advances are recovered oldest-first and stored as recovered so they are not deducted again.
- Run `supabase/employee_salary_advances_v55_27.sql` after the v55.26 migration.
- Manager advances remain editable, but manager payroll release is not yet available in the existing app.
- JavaScript syntax checks passed; no live Supabase validation was performed.
