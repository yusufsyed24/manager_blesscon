# Deploy v55.7 — Repair salesman assignment and visibility

This release fixes two symptoms: the assigned salesman not appearing in the Manager account, and the salesman disappearing from the Admin Salesmen & Targets list after linking.

## 1. Apply the SQL migration first

1. Open Supabase project `ggfjddhqevcvosxberua`.
2. Go to **SQL Editor → New query**.
3. Open `supabase/fix_salesman_manager_assignment_v55_7.sql` from this ZIP and paste the entire file into SQL Editor.
4. Click **Run**. Confirm it succeeds. If it raises the explicit `Could not safely patch` exception, stop and send the full error; do not improvise a replacement function.

The SQL migration preserves business records. It ensures the save function allows `manager_user_id` and sets a read policy where Admin retains visibility and an assigned Manager can read their own team's salesman records.

## 2. Publish website files

1. Publish the updated `web/` contents to the GitHub Pages repository.
2. If the repository also contains root-level `js/` mirrors, copy the matching updated `js/` files too. Do not upload only one copy if your deployment serves the root-level files.
3. Commit and push the changes.
4. Wait for GitHub Pages, then hard refresh with `Ctrl + Shift + R`.

## 3. Re-save and verify the assignment

1. Sign in as Admin → **Users & Access** → **Edit access** for the salesman login.
2. Confirm Role is `salesman`, choose the correct **Link salesman profile**, select the intended **Assigned manager**, and click **Save access**.
3. The save now commits the salesman row online and verifies the returned `manager_user_id`; if the database rejects it, the app should show an error instead of claiming success.
4. Refresh Admin → **Salesmen & targets**. The salesman profile should remain visible.
5. Sign in as the selected Manager and open **Overview** or **Salesmen & targets**. The active assigned salesman should appear.

## Notes

- No business-data reset is performed.
- The manager view is restricted to rows whose `manager_user_id` matches the Manager's authenticated user ID. Admin retains visibility of all salesman rows subject to the app's deleted-record filter.
- This package has not been deployed to your live Supabase or GitHub Pages environment. Apply the SQL migration and publish the website before testing.
