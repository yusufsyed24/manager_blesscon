# BCBM v55.77 — Arsalan Attendance Correction

- Adds an idempotent Supabase migration to record 17 October 2026 as present for Arsalan Khan only if no attendance row already exists for that date.
- Migration fails safely if it cannot uniquely identify the employee account. Existing dated attendance is not overwritten.
- The canonical attendance record is used by the existing payroll snapshots and account views; verify all views after applying migration.
- No live Supabase database was available for end-to-end verification. Do not release salary until the migration results and payroll preview are checked.
