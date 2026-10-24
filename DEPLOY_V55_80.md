# Deploy BCBM v55.80

1. Back up the current project and database.
2. Extract the ZIP. Upload the contents of `bcbm_v568_working/` using your normal Cloudflare static-folder deployment method (do not upload the outer ZIP itself).
3. In Supabase SQL Editor, review and run `supabase/arsalan_october_attendance_correction_v55_80.sql`.
4. Hard-refresh the app, open October 2026 payroll, and verify attendance rows and credited days before releasing salary.
5. Do not release salary if the migration errors, the correct Arsalan identity is not uniquely matched, or the payroll preview still shows 16 days.

The migration explicitly updates 17 October to `present`. It does not force a 30-day divisor: payroll uses the employee's saved working-days setting, falling back to 26 if unset. Verify the setting if your intended basis is 30 days. No live database or browser session was available for end-to-end verification.
