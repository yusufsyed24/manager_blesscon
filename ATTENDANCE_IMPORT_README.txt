Historical attendance import — October 2026

Run supabase/historical_employee_attendance_arsalan_babar_2026.sql in Supabase SQL Editor as database owner.

Imported records:
- Arsalan: 24 September 2026 through 12 October 2026 inclusive. 5 and 6 October are absent; all other dates in the supplied list are present.
- Babar Ali Khan (manager): 10 October 2026 through 22 October 2026 inclusive, all present.

The migration inserts only missing dates and preserves existing records. It resolves the profiles by name and stops if no match or multiple matches are found. Confirm the exact names in Supabase before running. Dates are interpreted as 2026 based on the current reporting period; change the year if the attendance refers to another year.

The existing dashboard already renders attendance_records in the salesman's profile and manager_attendance_records in the manager's profile. The existing salary snapshot functions count attendance from the current month only. This historical import therefore updates the October 2026 salary estimate after the payroll migration is applied. It does not create check-in/out timestamps or GPS data; only attendance status is recorded.

Important: back up Supabase before applying SQL. This script does not change salary settings. Correct monthly base salary, allowance, working days, individual target, and incentive settings in Admin first. Do not expect payroll to calculate correctly if the required payroll migration has not been applied or those settings are blank.
