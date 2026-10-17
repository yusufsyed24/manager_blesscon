# Manager Daily Closing Fix

This candidate fixes the error `Only the assigned salesman or management may submit this closing` for Manager accounts.

## What changed
- Manager can select an active salesman assigned to them in the Daily Closing form.
- Client-side validation permits a Manager only when the selected salesman has `manager_user_id` equal to the Manager's authenticated user ID.
- Supabase `closing.submit` authorization uses the same manager-to-salesman assignment check.
- Admin and the assigned salesman retain their existing access.

## Deployment
1. Deploy the updated web/app files from this archive.
2. In Supabase SQL Editor, apply the updated `supabase/operational_modules.sql` from this archive so the server-side RPC guard is updated too.
3. Confirm the intended salesman's `public.salesmen.manager_user_id` equals the Manager's auth user UUID and that the salesman is active and not deleted.
4. Log in as Manager and submit a test daily closing for that assigned salesman.
5. Verify the closing appears in the register and Admin can review/approve it.

The app files were syntax-checked. The migration and full end-to-end behavior have not been tested against the live Supabase project.
