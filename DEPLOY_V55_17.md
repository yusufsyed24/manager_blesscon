# Blesscon Candy Business Manager v55.17 deployment

## What's changed
- Managers now have a **Manage areas** option on Business Overview and Salesmen & Targets.
- Managers can create new active areas, then assign those areas to salesmen in their own assigned team.
- Managers can view the catalogue but cannot activate/deactivate areas; those actions remain Admin-only.

## Deployment steps
1. Back up your Supabase project before changing policies.
2. In Supabase → SQL Editor → New query, run the complete `supabase/manager_create_sales_areas_v55_17.sql` file as a normal SQL script. Do not paste the filename into the editor.
3. Publish the updated static website files from `web/` to the GitHub Pages repository using your existing deployment process.
4. Hard-refresh the website with `Ctrl + Shift + R` (or clear the site cache if needed).
5. Sign in as Manager, open Business Overview or Salesmen & Targets, click **Manage areas**, create an area, and assign it to a salesman on that Manager's team.
6. Verify an Admin can still activate/deactivate areas and a Manager cannot.

## Validation
JavaScript syntax checks, root/web synchronization, release preparation, and ZIP integrity were checked. The full Vitest suite was not run if dependencies are not installed. The SQL migration has not been executed against the live Supabase database. This package does not itself deploy to GitHub Pages or modify your live database.
