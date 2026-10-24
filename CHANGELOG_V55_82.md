# v55.82
- Added user-authorized SQL correction setting Arsalan Khan's 2026-10-05 and 2026-10-18 attendance to `present`.
- Uses upsert so existing `absent`/`week_off` rows are updated, not silently left unchanged.
- Added identity uniqueness guard and verification queries.
- No frontend code changes; payroll result depends on successful Supabase SQL execution and reloading attendance data.
