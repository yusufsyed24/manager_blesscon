BCBM v55.43 — Employee Date of Birth Save Fix

1. Back up your Supabase database.
2. In Supabase Dashboard, open SQL Editor and run:
   supabase/fix_employee_date_of_birth_save_v55_43.sql
3. Confirm the SQL verification query returns public.salesmen.date_of_birth.
4. Reload the app, edit the employee, select Date of birth, save, then reopen the profile to verify it persists.

The app already includes date of birth in the employee form and profile views. This migration updates the secure save function allow-list so the field is retained by the backend.

The ZIP integrity and JavaScript syntax can be checked locally, but this build has not been tested against your live Supabase project. Back up the database and review the SQL before running it.
If Microsoft Defender flags this archive, keep it blocked and do not bypass the warning.
