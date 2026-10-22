# v55.38 — Attendance, target-threshold incentive, and manager payroll

- Adds per-salesman allowance, incentive-per-carton, working-days, and payroll target fields to the Admin staff form.
- Adds manager-specific payroll settings table and salary snapshot support.
- Incentives apply only to confirmed carton-equivalent sales above the monthly target.
- Base salary and allowance are prorated by recorded attendance: present/late = 1 day, half-day = 0.5, absent/leave/pending = 0.
- Salary snapshots include advance totals, recoveries, outstanding advances, and an estimated net after outstanding advances.
- Manager direct sales remain separate from team target calculations.

## Required migration
Apply `supabase/payroll_attendance_target_v55_38.sql` to the existing Supabase project after taking a backup. Review the SQL against your deployed schema before applying; this release has not been tested against the live database.
