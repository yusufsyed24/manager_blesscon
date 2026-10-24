# BCBM v55.75 — Attendance-based salary release consistency

- Manager salary release now recalculates gross from the shared attendance payroll calculator after refreshing application data; the submitted form value is not trusted.
- Manager release form shows credited attendance and a read-only attendance-adjusted gross amount.
- Fixed-salary salesman release now uses the same attendance-prorated calculation as the payroll review screen instead of the legacy unprorated salary helper. Commission-basis employees remain calculated from eligible commissions.
- Removed the Arsalan October 2026 forced 17-day frontend adjustment.
- Removed the Babar October 2026 name-specific attendance-date filter from the frontend calculation.
- Added `supabase/payroll_attendance_consistency_v55_75.sql` to remove the Babar-specific attendance boundary from `own_manager_salary_snapshot()` in Supabase.
- Duplicate release checks and advance recovery behavior remain in place; salary release is not yet an atomic database transaction, so a live end-to-end verification is still required before payroll handover.

## Validation

- JavaScript syntax check: passed.
- ZIP integrity check: passed after packaging.
- Live Supabase data, RLS, browser interaction, and real salary release: not tested from this build environment.
