# Deploy v55.6 — Fix salesman-to-manager assignment

## Root cause

The UI sent `manager_user_id`, but the database function `private.save_master()` filtered that field out of its allowed `salesmen` columns. As a result, the assignment did not persist, so the manager dashboard had no assigned salesman to show.

## Required deployment (Supabase SQL Editor)

1. Extract the project ZIP or use the standalone SQL file `supabase/fix_salesman_manager_assignment_v55_6.sql`.
2. In Supabase Dashboard for project `ggfjddhqevcvosxberua`, open **SQL Editor → New query**.
3. Paste the complete contents of `supabase/fix_salesman_manager_assignment_v55_6.sql` and click **Run**.
4. Confirm the query finishes successfully. Do not paste terminal commands into the SQL Editor.
5. Publish the website files from `web/` to the GitHub Pages repository, including root-level mirror files if your repository uses them.
6. Hard-refresh the website (Ctrl+Shift+R), sign in as Admin, open **Users & Access → Edit access**, choose the salesman login and the intended Manager, then save.
7. Sign in as that Manager and open **Overview** or **Salesmen & targets**. The assigned active salesman should appear.

## Notes

- This migration is additive and safe to rerun. It does not reset or delete business data.
- It patches only the expected `private.save_master(text,jsonb,integer)` function body. If the live function differs, it stops with an explicit error instead of guessing.
- Existing assignments are preserved. Re-save assignments after deploying the SQL fix if they were attempted before the fix.
- `manager_user_id` must reference a real Manager auth user whose role is `manager`.
