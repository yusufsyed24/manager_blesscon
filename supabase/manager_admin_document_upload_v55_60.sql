-- v55.60: allow Admin to upload a broad range of private documents to Manager profiles.
-- Run in Supabase SQL Editor before using the new Admin upload control.

begin;

alter table public.manager_employee_documents
  drop constraint if exists manager_employee_documents_document_type_check;
alter table public.manager_employee_documents
  add constraint manager_employee_documents_document_type_check
  check (document_type in (
    'identity','education','appointment','contract','employment','salary_bank',
    'tax','training','performance','policy','medical','other'
  ));

alter table public.manager_employee_documents
  drop constraint if exists manager_employee_documents_size_bytes_check;
alter table public.manager_employee_documents
  add constraint manager_employee_documents_size_bytes_check
  check (size_bytes > 0 and size_bytes <= 26214400);

grant select, insert on public.manager_employee_documents to authenticated;
drop policy if exists manager_docs_admin_insert_v55_60 on public.manager_employee_documents;
create policy manager_docs_admin_insert_v55_60
  on public.manager_employee_documents
  for insert to authenticated
  with check (public.is_admin());

-- Supabase Storage upload limit is also raised to 25 MB for this private bucket.
update storage.buckets
set file_size_limit = 26214400
where id = 'employee-private';

-- Reassert the existing private-bucket policy pattern while ensuring Admin can upload
-- into a Manager's folder. Existing manager/self/team access is retained.
drop policy if exists employee_private_insert on storage.objects;
create policy employee_private_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'employee-private'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
      or (
        public.is_manager()
        and exists (
          select 1 from public.salesmen sm
          where sm.manager_user_id = auth.uid()
            and sm.user_id::text = (storage.foldername(name))[1]
            and sm.deleted_at is null
        )
      )
    )
  );

notify pgrst, 'reload schema';
commit;
