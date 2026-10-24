# BCBM v55.85 — Immediate attendance and payroll fix

## 1. Publish the app
Upload the contents of this folder to the existing static hosting location, replacing the old files. Then hard-refresh with Ctrl+Shift+R.

## 2. Fix manager/admin attendance saving
In Supabase Dashboard → SQL Editor, run `supabase/attendance_remarks_schema_cache_v55_85.sql`. It safely adds the missing `remarks` column and tells PostgREST to reload its schema cache. Retry marking attendance from Admin and Manager.

## 3. Reconcile Arsalan's October attendance
The employee login and admin payroll are currently disagreeing (17 vs 15 days). The included `supabase/arsalan_october_attendance_correction_v55_82.sql` sets the two previously authorized October dates, 5 Oct and 18 Oct 2026, to Present. Run it only if this correction has not already been applied. It checks that exactly one active Arsalan Khan identity exists before changing data. Do not run it if either date is not meant to be Present.

After SQL completes, refresh the app and open October payroll. Verify the attendance rows and the credited-day count in both the employee and Admin views. For the configured example of 17 credited days, PKR 45,000 monthly base / 30 days gives PKR 25,500 gross; with PKR 15,000 outstanding advance, estimated net is PKR 10,500. Confirm the actual salary settings and advance balance before posting or paying.

## Important
This build cannot connect to your live Supabase project from here. The ZIP includes the fix, but the database migration must be run in Supabase; a static-site upload alone cannot repair stored attendance or payroll calculations. Back up the database before applying attendance corrections.
