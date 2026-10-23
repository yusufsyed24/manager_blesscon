# v55.52 deployment

1. Back up the database and repository.
2. Run `supabase/fix_arsalan_salary_babar_attendance_v55_52.sql` in Supabase SQL Editor. It modifies the two salary snapshot functions and Arsalan's salary settings only.
3. Confirm the SQL finishes successfully and the verification query shows Arsalan's `base_salary_paisa = 4500000` and `payroll_working_days = 30`.
4. Deploy this ZIP's files to the same GitHub Pages root.
5. Hard-refresh the browser, open Arsalan's salary breakdown, and verify 17 days, PKR 25,500 gross, PKR 15,000 outstanding advance, and PKR 10,500 estimated net.
6. Check Babar's attendance for 10–23 October: count distinct credited dates, not raw attendance rows. Expected: 14.

If the SQL raises an exception, stop and share the exact error instead of removing the guard. Do not release salary until figures match the underlying attendance and advance records. Live Supabase testing was not possible during build creation.
