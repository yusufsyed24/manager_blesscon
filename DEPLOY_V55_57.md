# Deploy v55.57 — User + employee profile creation

1. Back up the current application folder and Supabase database.
2. Extract this ZIP and deploy the complete frontend folder as your normal static-site upload.
3. Deploy the updated Supabase Edge Function from `supabase/functions/admin-create-user/index.ts` to the function named `admin-create-user`. Keep the existing `SUPABASE_URL`, publishable/anon key, `SUPABASE_SERVICE_ROLE_KEY`, and exact `ALLOWED_ORIGIN` secrets configured. Never expose the service-role key in frontend files.
4. Confirm the existing payroll migration has created `public.manager_payroll_settings`, and the salesman commission migration is installed if commission-based pay is used.
5. Hard-refresh with Ctrl+F5 (or clear the site's cached service worker if the old form remains).
6. Sign in as Admin → Users & Access → Create user. Select Salesman or Manager and test with a test account first.
7. Verify the role appears in `user_roles`; for Salesman verify a linked `salesmen` row and for Manager verify `manager_payroll_settings`. If optional photo/NIC uploads are used, verify the private storage object and `employee_documents` row.

Managers should no longer see a Create Salesman button or be able to open Users & Access. The Edge Function independently checks the caller's Admin role.

Note: the app does not automatically remove or alter existing users/profiles. This release only changes the creation workflow.
