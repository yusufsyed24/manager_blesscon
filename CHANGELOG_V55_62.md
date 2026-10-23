# BCBM v55.62 — Monthly advance salary slips

- Added printable Blesscon Candy advance salary slips sourced directly from posted `employee_salary_advances` records.
- Added month selection in the employee self-service salary history, combining released salary slips and released advance records for the selected month.
- Added an Admin-side View advance slip action in the salesman profile advance history.
- Advance slips include payment date, employee, advance amount, account/reference where available, reason, recovered amount, and outstanding balance.
- Fixed a trailing comma in the v55.61 salary-slip migration table definition that would prevent that SQL migration from running.

## Verification / limitations
- `node --check js/app.js` and ZIP integrity checks passed.
- Live Supabase queries, RLS permissions, and browser print flow were not tested against the user's live project. Apply the migration in a backed-up/staging project first.
- Existing advance records are read from the database; this change does not fabricate or rewrite historical advances. Only records with `status = posted` are shown as released advance slips.
