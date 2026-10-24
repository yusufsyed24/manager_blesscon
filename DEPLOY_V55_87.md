# BCBM v55.87 — Deploy

1. Upload the contents of this folder over the existing files, then hard-refresh (Ctrl+Shift+R) or reopen the installed app.
2. In Supabase → SQL Editor, run `supabase/manager_weekoff_unpaid_oct2026_v55_87.sql` (back up first). This makes the manager's own salary view match Admin. It must show `true` at the end.
3. Check October 2026 in Admin → Salary calculations: manager shows 15 days (Week Off not counted), Arsalan still 17.

To change the rule for other months, edit `MANAGER_WEEKOFF_UNPAID_MONTHS` in `js/app.js` and the `'2026-10'` check in the SQL.
