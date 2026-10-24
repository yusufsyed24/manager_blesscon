# BCBM v55.85 — Attendance save and October payroll consistency

- Adds an idempotent Supabase migration for the missing `attendance_records.remarks` column and requests a PostgREST schema-cache reload, fixing the manager/admin attendance form error.
- Includes the previously prepared Arsalan October 2026 attendance correction migration, which sets 5 Oct and 18 Oct to Present after checking for one unique active Arsalan identity.
- Attendance and salary data live in Supabase; uploading the static app alone does not change those records. Apply the SQL migrations and verify the payroll before releasing salary.
