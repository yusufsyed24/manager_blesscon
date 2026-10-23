# v55.42 — Historical attendance import

- Added `supabase/historical_employee_attendance_arsalan_babar_2026.sql` to seed the supplied past attendance dates.
- Arsalan: 24 Sep–12 Oct 2026; 5 and 6 Oct absent, all other listed dates present.
- Babar Ali Khan (manager): 10–22 Oct 2026; all listed dates present.
- Import is idempotent for dates already recorded: existing attendance is preserved; only missing dates are inserted.
- Added instructions and verification queries in `ATTENDANCE_IMPORT_README.txt`.
- Attendance dashboards and salary snapshots rely on the existing attendance tables and payroll migration; this SQL has not been executed against the live Supabase database.
