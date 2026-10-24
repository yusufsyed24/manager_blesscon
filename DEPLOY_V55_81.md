# Deploy BCBM v55.81 — Arsalan 18 October attendance correction

1. Back up the current project and Supabase database.
2. Extract this ZIP and upload the contents of `bcbm_v568_working/` using your normal Cloudflare static-folder deployment method.
3. In Supabase SQL Editor, run `supabase/arsalan_october_attendance_correction_v55_81.sql`.
4. The script will abort without changes unless exactly one matching active Arsalan Khan identity exists across manager and salesman records. It sets 18 October 2026 to `present`, updating an existing row or inserting a missing one.
5. Run/inspect the verification queries at the bottom of the SQL script. Then hard-refresh the app and reopen October attendance/payroll.

This correction changes the saved attendance row; it does not prove the live payroll preview has refreshed. Confirm the displayed credited days before releasing salary. No live Supabase database was available for end-to-end verification.
