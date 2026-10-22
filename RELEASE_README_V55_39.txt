Blesscon Candy Business Manager — v55.39
Attendance-based salary visibility update

This source build improves the salary breakdown shown in the salesman and manager profile views. It displays credited attendance days and working days, attendance percentage, prorated base salary and allowance, confirmed cartons sold, target and cartons above target, carton incentive, advance totals/recoveries/outstanding, and estimated net after outstanding advances.

IMPORTANT
- This is a source build, not confirmation that your live Supabase database has been migrated or that the deployment is production-verified.
- The v55.38 migration `supabase/payroll_attendance_target_v55_38.sql` must be applied and reviewed on a backed-up database for the attendance-based snapshot fields to be available. Check the actual deployed schema first, especially `employee_salary_advances`, `attendance_records`, `manager_attendance_records`, and referenced helper functions.
- Manager payroll settings table is present in the migration, but the dedicated Admin UI to configure manager-specific base salary/allowance/incentive/target/working days was not implemented in v55.38.
- JavaScript syntax checks passed. The full `scripts/check.mjs` check could not run in this environment because the `typescript` dependency is not installed. No live Supabase test was performed.
- A prior release ZIP was flagged by Microsoft Defender. If Defender flags this archive, keep it blocked and do not restore/run it or disable Defender; investigate the detection before using any build.
