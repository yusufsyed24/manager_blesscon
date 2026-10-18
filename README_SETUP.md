
## Manager daily closing fix (v39)
Run `supabase/manager_closing_fix_v39.sql` once in the Supabase SQL editor (after `manager_role.sql` and `closing_balances.sql`), then redeploy `web/`. Managers can then submit the daily closing for any active salesman; approval stays Admin-only.

## v40: Manager team closing, manager expenses, Admin approval
Follow `DEPLOY_V40_MANAGER_CLOSING.md`: run `supabase/manager_closing_expenses_v40.sql` once in the Supabase SQL editor (after `manager_closing_fix_v39.sql`), deploy the whole folder (Netlify publishes the repository root), then run the acceptance table in that guide.
