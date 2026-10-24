# BCBM v55.79 — Arsalan attendance correction retry

- Replaced the previous attendance SQL with a fail-closed identity check: exactly one manager OR active salesman named Arsalan Khan must match.
- Corrects (inserts or updates) 17 October 2026 to `present`, so an existing absent/leave row for that date cannot silently remain unchanged.
- Includes verification queries for both manager and salesman attendance tables.
- No employee name/month salary override was added to frontend payroll calculations.

## Important
This ZIP does not apply SQL to your live Supabase project. Run the included migration only after backing up and confirming Arsalan's identity. Then refresh/reopen payroll and confirm attendance is 17 credited days before releasing salary. If the migration aborts due to multiple matching identities, do not weaken the guard; identify the correct account first.
