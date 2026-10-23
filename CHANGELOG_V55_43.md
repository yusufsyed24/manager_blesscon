# v55.43 — Employee date-of-birth persistence fix

- Added a Supabase migration to ensure `public.salesmen.date_of_birth` exists.
- Migration patches the `private.save_master(text,jsonb,integer)` allow-list so employee date of birth and individual payroll settings are not silently dropped by the secure save function.
- The existing admin/manager employee form already collects `date_of_birth`, and employee profile views already display it; this fix addresses the database save allow-list.
- Apply `supabase/fix_employee_date_of_birth_save_v55_43.sql` in Supabase SQL Editor after backing up the database.
- Live database execution and live profile verification have not been performed in this build environment.
