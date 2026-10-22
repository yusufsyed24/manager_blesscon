# Blesscon Candy Business Manager v55.3 deployment

## 1. Deploy the static app

1. Back up the currently deployed files.
2. Deploy the contents of `web/` as the static site. The release script synchronizes root source files into `web/`.
3. Hard-refresh the browser after deployment.

## 2. Apply the employee-profile SQL migration

In Supabase SQL Editor, run the complete file `supabase/employee_profile_access_v55_3.sql` as a normal SQL script. Do not select the UI option “Run and enable RLS”. This is additive and does not reset business data. It expects the v54 Manager role and `set_salesman_photo` RPC to already exist.

## 3. Deploy the two Admin Edge Functions

Deploy both functions from the project root:

```sh
supabase functions deploy admin-user-directory
supabase functions deploy admin-reset-user-password
```

Configure `ALLOWED_ORIGIN` to the exact deployed site origin (scheme and host, no wildcard), and ensure the Supabase project has `SUPABASE_URL`, `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` available to Edge Functions. The service-role key must never be put in frontend code.

## 4. Verify using test accounts

- As Admin, open Users & Access. Confirm the registered email appears for Admin, Manager and Salesman accounts and Copy email works.
- As Admin, reset a test Manager password and a test Salesman password; verify each can sign in with the new password. Confirm a non-admin cannot call either Edge Function successfully.
- As the assigned Manager, open a linked Salesman profile, upload a profile photo, then upload an NIC/identity document and one employment/education document.
- As that Salesman, open My profile & fieldwork → My employee documents and confirm each file has a View / download link.
- As an unrelated Manager/Salesman, verify they cannot view or upload another team's private files.

Private file links expire after one hour. If a feature still fails, capture the exact Supabase error and verify the migration and Edge Function deployments are complete.

## Permission boundaries verified in this build

- **Admin:** may see registered login emails, copy them, reset another account's password, and manage any employee's private photo/documents.
- **Manager:** may upload/replace photos and upload employee documents only for salesmen assigned to that Manager; cannot access the Users & Access email directory or reset account passwords.
- **Salesman:** may view their own profile photo and view/download their own uploaded documents; cannot upload or replace their official profile photo/documents or read another employee's files.
- **Unauthenticated/non-admin callers:** the email-directory and password-reset Edge Functions reject the request. The service-role key is used only server-side.
