# BCBM v55.86 — Deploy

1. Upload the contents of this folder to your static hosting, replacing the old files.
2. Hard-refresh (Ctrl+Shift+R), or close and reopen the installed app so the new service worker loads.
3. Open Admin → Salary calculations → October 2026 and check Arsalan Khan's paid attendance.

No Supabase SQL is needed for this fix. Optional: run `supabase/diagnose_arsalan_attendance_v55_86.sql` (read-only) to see his October rows by status.

Expected for 17 paid days with the current settings (base Rs. 45,000, 30 working days): gross Rs. 25,500; with Rs. 15,000 outstanding advance, net Rs. 10,500. Confirm his saved salary settings and advance balance before releasing.
