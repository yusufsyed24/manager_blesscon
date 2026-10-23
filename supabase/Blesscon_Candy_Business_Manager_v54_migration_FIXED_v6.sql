-- Blesscon Candy v55.3 employee profile and document access fix.
-- Additive and non-destructive: does not reset or delete business records.
-- Run as a normal SQL script in Supabase SQL Editor (do not choose "Run and enable RLS").

-- Ensure the minimum columns and Manager role helper required by the upload workflow exist.
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check check (role in ('admin','manager','user','salesman'));
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.user_roles r join public.profiles p on p.id=r.user_id and p.active where r.user_id=auth.uid() and r.role='manager')
$$;
revoke all on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated;

alter table public.salesmen add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.salesmen add column if not exists manager_user_id uuid references auth.users(id) on delete set null;
alter table public.salesmen add column if not exists photo_path text;
alter table public.salesmen add column if not exists deleted_at timestamptz;
alter table public.salesmen add column if not exists version integer not null default 1;
alter table public.salesmen add column if not exists updated_at timestamptz not null default now();
alter table public.salesmen add column if not exists updated_by uuid;

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  salesman_id text not null references public.salesmen(id) on delete cascade,
  document_type text not null default 'other',
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);

-- Expand manager-uploadable document categories while preserving existing document records.
alter table public.employee_documents drop constraint if exists employee_documents_document_type_check;
alter table public.employee_documents drop constraint if exists employee_documents_document_type_check1;
alter table public.employee_documents add constraint employee_documents_document_type_check
  check (document_type in ('identity','education','employment','appointment','contract','salary_bank','other'));

grant select on public.salesmen to authenticated;
alter table public.salesmen enable row level security;
drop policy if exists salesman_read on public.salesmen;
create policy salesman_read on public.salesmen for select to authenticated
  using (public.is_admin() or public.owns_salesman(id) or (public.is_manager() and manager_user_id=auth.uid()));

alter table public.employee_documents enable row level security;
revoke all on public.employee_documents from anon, authenticated;
grant select, insert, delete on public.employee_documents to authenticated;
drop policy if exists employee_documents_self_select on public.employee_documents;
drop policy if exists employee_documents_self_insert on public.employee_documents;
drop policy if exists employee_documents_read_self_or_team on public.employee_documents;
drop policy if exists employee_documents_manager_admin_write on public.employee_documents;
create policy employee_documents_read_self_or_team on public.employee_documents
  for select to authenticated
  using (
    public.is_admin()
    or public.owns_salesman(salesman_id)
    or exists (
      select 1 from public.salesmen sm
      where sm.id = employee_documents.salesman_id
        and sm.manager_user_id = auth.uid()
        and public.is_manager()
        and sm.deleted_at is null
    )
  );
create policy employee_documents_manager_admin_insert on public.employee_documents
  for insert to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.salesmen sm
      where sm.id = employee_documents.salesman_id
        and sm.manager_user_id = auth.uid()
        and public.is_manager()
        and sm.user_id is not null
        and sm.deleted_at is null
    )
  );
create policy employee_documents_manager_admin_delete on public.employee_documents
  for delete to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.salesmen sm
      where sm.id = employee_documents.salesman_id
        and sm.manager_user_id = auth.uid()
        and public.is_manager()
        and sm.deleted_at is null
    )
  );

-- Private employee storage: salesman can read their own files; only Admin or the assigned Manager uploads/deletes.
do $$ begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values ('employee-private','employee-private',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
    on conflict (id) do update set public=false, file_size_limit=10485760, allowed_mime_types=excluded.allowed_mime_types;
    execute 'drop policy if exists employee_private_read on storage.objects';
    execute 'create policy employee_private_read on storage.objects for select to authenticated using (bucket_id = ''employee-private'' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text or (public.is_manager() and exists (select 1 from public.salesmen sm where sm.manager_user_id = auth.uid() and sm.user_id::text = (storage.foldername(name))[1] and sm.deleted_at is null))))';
    execute 'drop policy if exists employee_private_insert on storage.objects';
    execute 'create policy employee_private_insert on storage.objects for insert to authenticated with check (bucket_id = ''employee-private'' and (public.is_admin() or (public.is_manager() and exists (select 1 from public.salesmen sm where sm.manager_user_id = auth.uid() and sm.user_id::text = (storage.foldername(name))[1] and sm.deleted_at is null))))';
    execute 'drop policy if exists employee_private_delete on storage.objects';
    execute 'create policy employee_private_delete on storage.objects for delete to authenticated using (bucket_id = ''employee-private'' and (public.is_admin() or (public.is_manager() and exists (select 1 from public.salesmen sm where sm.manager_user_id = auth.uid() and sm.user_id::text = (storage.foldername(name))[1] and sm.deleted_at is null))))';
  end if;
end $$;

-- Only Admin / assigned Manager can set profile photo path; the RPC validates both identity and path.
create or replace function public.set_salesman_photo(p_salesman_id text, p_photo_path text) returns void
language plpgsql security definer set search_path='' as $$
declare linked_user_id uuid;
begin
  select s.user_id into linked_user_id from public.salesmen s where s.id=p_salesman_id and s.deleted_at is null;
  if linked_user_id is null then raise exception 'Salesman must be linked to a login before uploading a private photo'; end if;
  if not (public.is_admin() or (public.is_manager() and exists (select 1 from public.salesmen s where s.id=p_salesman_id and s.manager_user_id=auth.uid() and s.deleted_at is null))) then
    raise exception 'Only Admin or the assigned Manager may update this profile photo';
  end if;
  if p_photo_path is null or length(p_photo_path)>1024 or p_photo_path not like linked_user_id::text || '/salesman-profile-%' then
    raise exception 'Invalid private profile photo path';
  end if;
  update public.salesmen set photo_path=p_photo_path, updated_at=now(), updated_by=auth.uid(), version=version+1 where id=p_salesman_id and deleted_at is null;
  if not found then raise exception 'Salesman not found'; end if;
end $$;
revoke all on function public.set_salesman_photo(text,text) from public, anon;
grant execute on function public.set_salesman_photo(text,text) to authenticated;
notify pgrst, 'reload schema';
