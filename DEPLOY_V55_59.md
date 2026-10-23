# Deploy v55.59
1. Back up the current deployed folder and database before changing production.
2. Extract this ZIP and upload the static frontend folder using your usual Cloudflare Pages direct-upload workflow.
3. Hard refresh the site (Ctrl+F5). If the old UI remains, clear site data/service-worker cache and reload.
4. Sign in as Admin → Users & Access → Edit a salesman or manager. Use the new Employee details and compensation section to open the appropriate editor.
5. Test changes on a temporary/test employee first. Confirm the employee ID and salary values save correctly and historical sales/stock/attendance links remain intact.

The build uses existing app save flows and database schema. Live Supabase testing was not performed; if a field is unavailable in your database schema or denied by RLS, the app may report a save error. Employee ID changes are especially sensitive because other tables may reference the ID; verify linked records after changing it.
