# BCBM v55.80 — Arsalan October attendance correction

- Replaced the previous no-op migration behavior with an idempotent SQL upsert for 17 October 2026.
- The migration updates an existing attendance row to `present` or inserts it when missing.
- It refuses to proceed unless exactly one active Arsalan Khan identity exists across manager and salesman records.
- Removed the misleading JavaScript compatibility wrapper that did not alter payroll data.
- Payroll remains calculated from saved attendance and configured working-days settings; no hard-coded salary or credited-day override was added.

## Important
Run `supabase/arsalan_october_attendance_correction_v55_80.sql` in the Supabase SQL Editor after taking a database backup. Then reload the app and verify October payroll. This package has not been tested against the live Supabase project. If the actual identity or schema differs, the migration intentionally errors rather than guessing.
