# Deploy BCBM v55.75

1. Back up the current deployed folder and Supabase database before updating.
2. Extract `BCBM_v55_75_Attendance_Payroll_Fix.zip` locally.
3. Upload the extracted static app folder using your normal Cloudflare Pages direct-upload workflow (no Wrangler required).
4. In Supabase SQL Editor, run `supabase/payroll_attendance_consistency_v55_75.sql` as a migration after checking it against your deployed function. This updates the manager's own salary snapshot to count only actual attendance records in the month and removes the hard-coded Babar date boundary.
5. Hard refresh the app, open Admin → Salary & Payroll, select the salary month, and inspect the employee's credited attendance, working-day denominator, base earned, allowance, incentive, and gross.
6. Open Release Salary and confirm the same attendance-adjusted gross appears. For managers, the gross field is read-only and the handler recalculates after refreshing data.
7. Do not release a real salary until a test employee/month has been checked against actual attendance and the saved salary settings. Confirm only one salary expense/slip exists for that employee/month and advance recovery matches the slip.

## Payroll calculation

- Attendance credit per date: `present`, `late`, `week_off` = 1; `half_day` = 0.5; other statuses = 0.
- Duplicate attendance rows on a date count once, taking the highest credit for that date.
- Attendance factor = `min(1, credited attendance / configured working days)`.
- Base earned = rounded monthly base × attendance factor.
- Allowance earned = rounded monthly allowance × attendance factor.
- Incentive = eligible confirmed personal cartons above target × saved incentive rate.
- Gross = base earned + allowance earned + incentive.
- Net = gross − advance recovery (oldest outstanding advance first, capped at gross).

The deployed app cannot read or verify live attendance until connected to the user's Supabase project. This package does not claim live payroll testing.
