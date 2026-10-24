# BCBM v55.78 — Arsalan Attendance Correction Retry

- Fixed the v55.77 migration conflict behavior: if Arsalan already had an attendance row for 17 October 2026 (including an absence status), the migration previously did nothing.
- The migration now sets that single date to `present` for the uniquely identified Arsalan manager or salesman record, rather than leaving an existing status unchanged.
- No other attendance dates are modified.
- This is a data migration; it must be run in Supabase SQL Editor. The application ZIP alone does not change live database records.
- Live Supabase execution has not been performed by the build process. Verify 17 credited days in all payroll views before releasing salary.
