# Deploy v55.51

1. Back up Supabase and the current GitHub repository.
2. Run `supabase/fix_arsalan_salary_babar_attendance_v55_51.sql` in Supabase SQL Editor.
3. Deploy the ZIP contents to the existing GitHub Pages publishing root.
4. Hard-refresh the app and sign in as Arsalan to verify 17 credited days, PKR 1,500/day, PKR 25,500 gross, PKR 15,000 outstanding advance, and PKR 10,500 net.
5. Sign in as Babar and verify attendance remains 14 credited days for 10–23 October 2026.

The migration sets Arsalan's base salary to PKR 45,000 and 30 working days. It preserves attendance rows and does not alter posted salary expense records. It does not post/release any salary. Do not release salary until the figures are checked against the actual attendance and advance records.
