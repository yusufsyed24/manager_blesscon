# BCBM v55.84 — Pakistan-time attendance date boundary

1. Back up database and deployed folder.
2. Upload contents of this folder to Cloudflare.
3. Run `supabase/attendance_pakistan_timezone_v55_84.sql` in Supabase SQL Editor.
4. Check output for Pakistan date, DB session date/timezone, and Babar attendance rows.
5. Hard-refresh and reopen attendance/payroll.

The frontend `today()` already uses Asia/Karachi. The migration changes Sunday auto-weekoff defaults/backfill to Pakistan time and prevents future dates. Existing statuses are not overwritten. Payroll currently counts `week_off` as one credited day, so credited days can exceed physical days worked. Live Supabase behavior is not verified until this SQL runs successfully.
