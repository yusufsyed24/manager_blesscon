# Deploy BCBM v55.60

1. Back up the currently deployed frontend and Supabase database.
2. In Supabase SQL Editor, run `supabase/manager_admin_document_upload_v55_60.sql` from this ZIP. This is required for the new file categories, 25 MB limit, and Admin upload permissions.
3. Extract the ZIP and upload the frontend as your normal Cloudflare static folder deployment.
4. Hard-refresh the app with Ctrl+F5. If the old UI remains, clear the site's service-worker/cache and reload.
5. Sign in as Admin → Users & Access → choose a Manager's Profile. Use **Upload manager documents (Admin)**, choose a category, select any file type up to 25 MB, and upload.
6. Confirm the file appears in the manager's uploaded documents table and opens via the private signed link. Confirm a Manager account cannot see the Admin-only uploader.

## Notes
- The `employee-private` Storage bucket must exist.
- The migration updates its size limit to 25 MB and installs an Admin insert policy for manager document records and the private bucket. It retains Admin, self, and assigned-team insert access in the storage policy.
- File contents are not scanned by the app. Upload only trusted files; the app does not make these files public.
- Frontend syntax and ZIP integrity checks are run for this build, but live Supabase deployment/permissions are not tested from this environment.
