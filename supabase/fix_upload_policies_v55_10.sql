-- Blesscon Candy Business Manager v55.10
-- Fixes "new row violates row-level security policy" when uploading photos / documents.
--
-- Cause: several older migrations each REPLACED the same storage policy on the private
-- 'employee-private' bucket, so whichever ran last decided who could upload:
--   * salesman_self_service / manager_profile_fieldwork: only the user's OWN folder
--     -> Admin/Manager could not upload for a salesman (files live in the salesman's folder)
--   * revamp_v53 / v54 / employee_profile_access_v55_3: only Admin or the assigned Manager
--     -> a Manager could not upload their OWN photo or documents
-- This script installs one policy set that allows every flow the app uses.
-- Safe to re-run. Does not touch any existing files or data.
--
-- To see what is live right now (optional):
--   select policyname, cmd, with_check from pg_policies
--   where schemaname='storage' and tablename='objects' and policyname like 'employee_private%';

-- 0. Bucket (private, 10 MB, PDF + images)
do $b$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('employee-private', 'employee-private', false, 10485760,
            array['application/pdf','image/jpeg','image/png','image/webp'])
    on conflict (id) do update
      set public = false, file_size_limit = 10485760,
          allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'];
  end if;
end
$b$;

-- 1. Storage policies. Folder name = the owner's user id.
do $p$
declare
  team_check text := $t$(public.is_manager() and exists (
      select 1 from public.salesmen sm
      where sm.manager_user_id = auth.uid() and sm.user_id::text = (storage.foldername(name))[1]))$t$;
begin
  if to_regclass('storage.objects') is null then return; end if;

  execute 'drop policy if exists employee_private_read on storage.objects';
  execute format($f$create policy employee_private_read on storage.objects for select to authenticated using (
      bucket_id = 'employee-private' and (
        public.is_admin()
        or (storage.foldername(name))[1] = auth.uid()::text
        or %s))$f$, team_check);

  execute 'drop policy if exists employee_private_insert on storage.objects';
  execute format($f$create policy employee_private_insert on storage.objects for insert to authenticated with check (
      bucket_id = 'employee-private' and (
        public.is_admin()
        or (public.is_manager() and (storage.foldername(name))[1] = auth.uid()::text)
        or %s))$f$, team_check);

  execute 'drop policy if exists employee_private_delete on storage.objects';
  execute format($f$create policy employee_private_delete on storage.objects for delete to authenticated using (
      bucket_id = 'employee-private' and (
        public.is_admin()
        or (public.is_manager() and (storage.foldername(name))[1] = auth.uid()::text)
        or %s))$f$, team_check);
end
$p$;

-- 2. Salesman documents table: Admin, or the assigned Manager for a linked salesman.
drop policy if exists employee_documents_manager_admin_insert on public.employee_documents;
create policy employee_documents_manager_admin_insert on public.employee_documents
  for insert to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.salesmen sm
      where sm.id = employee_documents.salesman_id
        and sm.manager_user_id = auth.uid() and public.is_manager()
        and sm.user_id is not null and sm.deleted_at is null));
grant select, insert, delete on public.employee_documents to authenticated;

-- 3. Manager's own documents table: the Manager for themselves, or Admin.
do $m$
begin
  if to_regclass('public.manager_employee_documents') is not null then
    execute 'drop policy if exists manager_docs_insert_self on public.manager_employee_documents';
    execute 'create policy manager_docs_insert_self on public.manager_employee_documents for insert to authenticated
             with check ((manager_user_id = auth.uid() and public.is_manager()) or public.is_admin())';
    execute 'grant select, insert on public.manager_employee_documents to authenticated';
  end if;
end
$m$;

-- 4. Saving a profile photo path on your own profile (Admin and Manager own photos).
--    Column-level grant keeps this to avatar_path / updated_at only.
grant select, update (avatar_path, updated_at) on public.profiles to authenticated;
drop policy if exists profiles_update_own_avatar on public.profiles;
create policy profiles_update_own_avatar on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

notify pgrst, 'reload schema';
