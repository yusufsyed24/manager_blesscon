# Deploy BCBM v55.61

1. Back up the current Cloudflare static site and Supabase database.
2. In Supabase SQL Editor, run the complete file `supabase/salary_slips_notifications_v55_61.sql` as a normal SQL script. Do not use a wizard that injects SQL.
3. Upload the static site folder contents to the same Cloudflare Pages static publishing root used for the current app. No Wrangler is required for the static frontend.
4. Hard refresh with Ctrl+F5. If needed, unregister the old service worker from browser DevTools > Application > Service Workers and reload.
5. In staging, release one small fixed salary and one commission-basis salesman salary. Confirm selected central account, slip row, print output, notification inbox, and employee/Admin month-wise history.
6. Do not use production payroll for validation until the arrears limitation in `CHANGELOG_V55_61.md` has been resolved. This build does not yet automatically calculate prior unpaid-month arrears.
