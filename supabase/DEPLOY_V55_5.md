# Deploy v55.5 — Salesman-to-manager assignment and user deletion

## Changes

- Admin can assign a linked salesman to a Manager from Users & Access while creating or editing a salesman login.
- The Users & Access table shows the assigned manager. Assigned active salesmen appear in that Manager's team overview via `salesmen.manager_user_id`.
- Admin can delete another user's login using a confirmation phrase. Self-deletion and deletion of the last active Admin are blocked. The linked salesman employee record is detached from the login instead of deleting the employee/business history.
- Registered login emails remain hidden; this version does not restore the `admin-user-directory` call.

## Deploy static app

1. Extract `Blesscon_Candy_Business_Manager_v55_5.zip`.
2. Publish the contents of the extracted `web/` folder to the same GitHub Pages source used by the current app. If your repository uses root-level mirrors, copy the matching root files too; the package keeps the root JS and `web/js` copies synchronized.
3. Hard refresh the app (Ctrl+Shift+R).

## Deploy the Edge Function (required for Delete user)

From a Bash terminal in the extracted project directory, run:

```bash
supabase login
supabase link --project-ref ggfjddhqevcvosxberua
supabase functions deploy admin-delete-user --no-verify-jwt
```

These commands run in a terminal, not the Supabase SQL Editor. If `supabase: command not found`, install the Supabase CLI first. Keep `SUPABASE_SERVICE_ROLE_KEY` only in Supabase Edge Function secrets; never add it to website files.

In Supabase Edge Function secrets, ensure `ALLOWED_ORIGIN` is exactly `https://yusufsyed24.github.io` (no trailing slash). The function also requires the platform-provided `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY` secrets.

## Safety notes

- Deleting a user removes their Auth login and role/access rows. It is irreversible from the app.
- A linked salesman row is kept, and its `user_id` is set to null. Sales, customer, stock and other historical records referencing that salesman remain attached to the employee record.
- Deleting a Manager may cascade-delete user-specific manager attendance, document and visit records because of the current database foreign-key rules. Review those records before deleting a Manager.
- The function refuses to delete the currently signed-in Admin and refuses to delete the last active Admin.

## Validation status

Run `npm run check` and `npm test` from the project root after installing project dependencies. Live Supabase function/RLS behavior must be verified in the target project after deployment; it has not been tested against the live project by this package build.
