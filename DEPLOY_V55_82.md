# BCBM v55.82 — Arsalan October attendance correction

## Important
This release includes a Supabase SQL correction. Uploading the static folder to Cloudflare does **not** modify attendance stored in Supabase.

## Apply
1. Back up the database.
2. In Supabase Dashboard → SQL Editor, open and run `supabase/arsalan_october_attendance_correction_v55_82.sql`.
3. Confirm both 2026-10-05 and 2026-10-18 return `present` in the verification queries.
4. Reload the app (hard refresh) and reopen October 2026 salary release.
5. Confirm credited attendance is 17.0 / 30, gross salary Rs. 25,500, advance deduction Rs. 15,000, and net Rs. 10,500 before release.

The script only proceeds if exactly one active Arsalan Khan identity exists across manager and salesman records. If it raises an exception, do not change the identity filter blindly; inspect the matching records first.

## Scope and verification
This correction changes the two explicitly authorized attendance dates. It does not connect to or update the live database automatically. JavaScript application code is unchanged from v55.81; the essential operation is applying the SQL and then reloading the app's data.
