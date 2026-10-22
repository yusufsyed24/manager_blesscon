Blesscon Candy Business Manager v55.38

Setup:
1. Back up the current app and Supabase database.
2. Deploy the app files.
3. Review and run supabase/payroll_attendance_target_v55_38.sql in Supabase SQL Editor.
4. Admin > Salesmen & Targets: set each salesman's base salary, monthly allowance, target, incentive per carton above target, and working days.
5. Manager payroll settings are stored in public.manager_payroll_settings; admin UI configuration for this table is not yet included in this release, so manager-specific settings must be inserted/updated by an authorized admin using SQL until that UI is added.
6. Verify manager advance schema uses manager_user_id, and employee_salary_advances contains amount_paisa, recovered_paisa, status, salesman_id, manager_user_id before applying.

Not live-tested: no connection to your Supabase project was used. Run on a backup/staging project first. Do not deploy if Microsoft Defender flags the archive; this package has not been independently malware-certified.
