# v39 manager closing and expenses — deployment notes

1. Back up the Supabase project before changing schema/functions.
2. Apply `supabase/manager_daily_closing_v39.sql` in the Supabase SQL Editor only after reviewing it against the live `private.save_master` definition. It replaces that function and should be checked for any project-specific edits before running.
3. Deploy the static application files from this ZIP.
4. Verify manager Expenses visibility and create an expense using Babar's manager account.

## Known incomplete work
The manager closing table is a schema foundation only. This build does not yet wire a manager submit form to aggregate team activity, nor an Admin approve/reject screen for rows in `manager_daily_closings`. Those requested behaviors are not complete in this package. Existing salesman closings remain unchanged. Do not use the manager closing table for accounting until the aggregation and approval workflow are completed.

No live database was accessed or changed by packaging this build.
