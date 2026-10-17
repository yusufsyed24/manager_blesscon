# Password controls (v33 candidate)

## Intended behavior
- Manager and Salesman accounts do not see a self-service password-change form in the application. They must ask an Admin to reset their password.
- Admin users can reset another user's password from **Users & access → Reset password**.
- The reset uses the `admin-reset-user-password` Supabase Edge Function. It verifies the caller's active Admin role through `is_admin()` and never exposes the service-role key to the browser.
- The function rejects attempts to reset the caller's own password. It accepts 12–128 character temporary passwords.

## Deployment
1. Deploy the updated static app.
2. Deploy the Edge Function `admin-reset-user-password` using the project's existing Supabase CLI workflow.
3. Confirm the function secrets `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`), `SUPABASE_SERVICE_ROLE_KEY`, and `ALLOWED_ORIGIN` are configured. `ALLOWED_ORIGIN` must exactly match the app's origin and must not be `*`.
4. Test with a non-admin account (no reset access), then with an Admin resetting a test Manager/Salesman account.

## Security limitation
Hiding the password-change form is an application-level restriction only. Supabase Auth's standard user password-update endpoint can still permit an authenticated user to change their own password directly unless your project separately enforces a server-side policy/custom authentication architecture. This build does not claim to block direct Auth API password updates. Validate the policy you need before production; do not rely on UI hiding as a security boundary.

## Admin self-service password change (v34)
- Admin accounts can change their own password from Account.
- Manager, Salesman, and other non-admin accounts do not see a self-service password-change form and are instructed to contact Admin.
- This is an application UI restriction; it does not by itself prevent direct password updates through Supabase Auth APIs. Do not treat it as a server-side security boundary.
