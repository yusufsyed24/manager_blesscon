# v55.30 — Manager sales-order save sync fix

- Fixes a manager-role failure when creating a new customer as part of Sales Order creation: the generic `master.save` path previously required the signed-in user to have their own active salesman row, which managers do not have.
- Managers may now assign the customer to an active salesman whose `manager_user_id` is the manager's user ID. The database rejects assignment to another manager's team.
- Salesman customer creation retains the existing own-salesman restriction. Admin behavior is unchanged.
- Added `supabase/fix_manager_master_save_v55_30.sql`, a guarded migration that patches only the expected customer guard in `private.save_master`; it aborts without modifying the function if the deployed function text differs.

## Deploy
1. Back up the database.
2. Run `supabase/fix_manager_master_save_v55_30.sql` in Supabase SQL Editor.
3. Deploy this ZIP.
4. In Pending changes, click **Retry sync** after the migration is deployed. Do not discard the pending item unless you have exported it and confirmed it is safe to remove.

## Validation
Static JavaScript syntax and ZIP integrity checks are run for this build. This patch is not tested against the live Supabase project. If the queued `master.save` is for a different table than `customers`, the server's actual error is needed for a precise fix.
