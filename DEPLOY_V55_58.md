# Deploy v55.58 — Admin Manager Profile Button

1. Back up the currently deployed frontend folder.
2. Extract this ZIP and upload the frontend files as your normal Cloudflare static-folder deployment (no Wrangler process is required for the static frontend).
3. Hard-refresh the site (Ctrl+F5). If the old interface remains, clear the site's cached service worker/site data and reload.
4. Sign in as Admin → Users & Access. Manager rows should now show **Profile** beside the other account actions.
5. Open the profile and verify identity, photo, salary/target settings, attendance, private documents, and fieldwork. Sections may show a permission/migration error if the corresponding Supabase tables or policies are not installed.

This is a frontend-only change; no Edge Function deployment is required for the new button. Live Supabase tests were not performed.
