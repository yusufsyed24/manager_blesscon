# Deploy v55.85 — Admin payroll week-off fix

1. Back up the currently deployed folder.
2. Extract this ZIP.
3. Upload the contents of the `bcbm_v568_working` folder to Cloudflare Pages using the same normal folder upload method as before (upload the folder contents, not the outer ZIP).
4. After deployment completes, open the site and do a hard refresh (`Ctrl+Shift+R`). If the old result persists, close other tabs for the site and reopen it so the updated service worker can activate.
5. In Admin → Salary & Payroll, select October 2026 and refresh data. Babar should show 15 / 26 paid days if the displayed attendance records match the records provided.

Rule: present/late = 1, half_day = 0.5, week_off/absent/leave/pending = 0 paid days.

This archive was statically checked; it has not been deployed to Cloudflare or tested against the live Supabase project. Existing posted salary expenses are not changed by this frontend fix.
