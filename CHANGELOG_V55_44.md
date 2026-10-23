# v55.44 — Sunday Week Off + Arsalan attendance correction

- Arsalan historical attendance period corrected to 1–17 October 2026. Old 24–30 September records from the earlier import are removed. 5 and 6 October remain absent; Sundays 4 and 11 October are Week Off.
- Week Off is supported for all active salesmen and all manager-role profiles.
- Migration backfills Sundays from the start of the current month through today and attempts to schedule an hourly pg_cron job if pg_cron is already installed.
- Existing Sunday attendance punches are not overwritten.
- Apply `supabase/attendance_sunday_weekoff_v55_44.sql` in Supabase SQL Editor, then run `supabase/historical_employee_attendance_arsalan_babar_2026.sql` to apply the corrected historical attendance. Back up first.
