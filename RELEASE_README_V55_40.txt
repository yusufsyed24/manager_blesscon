Blesscon Candy Business Manager v55.40

Changes:
- Admin → Users & Access → Managers & company target now includes Salary parameters for each manager.
- Admin can save individual manager base salary, allowance, per-carton incentive, monthly target, and working days.
- Salesman overview salary summary includes attendance credited and attendance-adjusted base salary.
- Manager and salesman calculations use the attendance-prorated payroll snapshot logic in supabase/payroll_attendance_target_v55_38.sql. Incentives apply only to confirmed cartons above the configured individual target. Manager direct sales remain additional to team target.

Setup requirement: back up Supabase first, then review and apply supabase/payroll_attendance_target_v55_38.sql. Confirm the deployed employee_salary_advances, manager_attendance_records, attendance_records, orders, and expenses schemas match the migration. This package has not been tested against the live database. If Microsoft Defender flags the ZIP, do not run/extract it or bypass Defender; keep it blocked and investigate the detection.
