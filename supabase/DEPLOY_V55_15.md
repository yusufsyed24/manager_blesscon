# Blesscon Candy Business Manager v55.15 deployment

## Changes
- Admin can send announcements to all Managers and their assigned salesmen, a selected Manager and their team, all salesmen (and their assigned Managers), or a selected salesman and their Manager.
- Manager dashboard now includes a private inbox for announcements addressed to that Manager. Managers can mark messages read or acknowledge them.
- Manager-to-salesman messages continue to appear in the salesman's profile/dashboard message panel.
- Managers no longer see the Cash & Bank Book navigation module, even if an old per-user permission exists.
- Existing notification records are preserved. No business records are deleted.

## Deployment order
1. Back up Supabase before applying schema changes.
2. In Supabase SQL Editor, run `supabase/management_messages_manager_cashbook_v55_15.sql` as a normal SQL query. Do not run it in Bash.
3. Confirm SQL completes successfully and the schema cache refresh notification executes.
4. Publish the updated root `index.html`, `js/`, `css/`, `assets/`, `vendor/`, `app_config.js`, `manifest.json`, and `sw.js` files to the GitHub Pages repository. Keep root files and `web/` deployment copies synchronized. The ZIP contains both.
5. Commit and push; wait for GitHub Pages to publish.
6. Sign in as Admin, send a test message to a Manager. Confirm it appears in the Manager dashboard and the assigned salesman's profile. Then test a Manager-to-salesman message.
7. Sign in as Manager and confirm Cash & Bank Book is absent from the sidebar and cannot be opened by navigating to its route.

## Notes
- This is an additive migration. It changes `recipient_salesman_id` to nullable so messages can target a Manager login via `recipient_user_id`; the check constraint requires exactly one recipient per row.
- Manager inserts remain restricted to salesmen assigned to that Manager. Only Admin can address a Manager login directly.
- No live database or website deployment was performed by the build process.
