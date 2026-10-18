-- Blesscon Candy v44 patch: repair an existing manager_daily_closings table
-- that was created before team_salesman_ids was added to the manager-closing migration.
-- Safe to run more than once. This does not delete or overwrite existing closing records.

begin;

alter table public.manager_daily_closings
  add column if not exists team_salesman_ids text[] not null default '{}'::text[];

comment on column public.manager_daily_closings.team_salesman_ids is
  'Salesman IDs included in this manager consolidated daily closing.';

commit;

-- After this succeeds, refresh the app and retry team closing. If another missing-column
-- error appears, stop and share the exact error so the remaining schema drift can be patched.
