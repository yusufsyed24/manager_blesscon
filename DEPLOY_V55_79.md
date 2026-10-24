# Deploy BCBM v55.79

1. Back up the Supabase database.
2. In Supabase SQL Editor, open and run `supabase/arsalan_october_attendance_correction_v55_77.sql` from this ZIP. Despite the legacy filename, its contents are the v55.79 guarded migration.
3. If SQL raises the identity ambiguity exception, stop and identify the correct Arsalan account. Do not guess.
4. Verify the query output shows 17 October 2026 as `present` for the correct employee.
5. Upload the static app folder to Cloudflare using your normal static-folder deployment process.
6. Sign out/in or hard-refresh the app, open October 2026 payroll, and verify credited attendance is 17 before releasing salary.

Expected arithmetic only if base salary is Rs. 45,000, divisor is 30, and credited attendance is 17: gross base = Rs. 25,500. If outstanding advance is Rs. 15,000 and there are no other earnings/deductions, estimated net = Rs. 10,500. The app's configured working-days divisor and actual advance ledger determine the real result.

Validation boundary: this package corrects the attendance SQL path. It has not been applied to or verified against your live Supabase database, and no live Cloudflare deployment was performed.
