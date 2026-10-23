Blesscon Candy Business Manager v55.44 — Sunday Week Off + Arsalan attendance correction

This build includes: automatic Sunday Week Off support for all salesmen and managers, a Week Off option in attendance correction, and a corrected historical attendance SQL import for Arsalan (1–17 October 2026).

REQUIRED DATABASE STEPS
1. Back up your Supabase database.
2. Run supabase/attendance_sunday_weekoff_v55_44.sql in Supabase SQL Editor. It adds the Week Off status, backfills missing Sunday records for the current month, and attempts hourly automation if pg_cron is already installed.
3. Run supabase/historical_employee_attendance_arsalan_babar_2026.sql to correct Arsalan's attendance period.
4. Verify the returned rows before relying on payroll. Week Off is not counted as present in the current salary snapshot logic.

The ZIP is a source build and has not been tested against your live Supabase project. If pg_cron is unavailable, the migration installs the marking function but automatic future marking requires scheduling that function through Supabase Cron. Do not bypass Microsoft Defender if it flags this archive; keep it blocked and investigate.
