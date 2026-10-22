-- Manager profile, attendance, documents, fieldwork and linked-salesman attendance.
-- Additive and safe to re-run. Does not delete or reset business records.

alter table public.profiles add column if not exists avatar_path text;
alter table public.salesmen add column if not exists manager_user_id uuid references auth.users(id) on delete set null;

-- Link existing active salesmen to the configured Manager account if they have not yet been assigned.
-- BABAR ALI KHAN Manager auth user ID.
update public.salesmen
set manager_user_id = 'd2cf42d4-3806-44f1-9deb-369920e2f152'::uuid
where active is true and manager_user_id is null;

create table if not exists public.manager_attendance_records (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users(id) on delete cascade,
  attendance_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  latitude double precision,
  longitude double precision,
  status text not null default 'present' check (status in ('present','late','half_day','absent','leave','pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(manager_user_id, attendance_date),
  check (check_out_at is null or check_in_at is not null),
  check (check_out_at is null or check_out_at >= check_in_at),
  check ((latitude is null) = (longitude is null)),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create table if not exists public.manager_employee_documents (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null default 'other' check (document_type in ('identity','employment','other')),
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);

create table if not exists public.manager_customer_visits (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users(id) on delete cascade,
  customer_label text not null default '',
  area text not null default '',
  purpose text not null default 'Sales visit',
  notes text not null default '',
  latitude double precision,
  longitude double precision,
  visited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180)
);

create index if not exists manager_attendance_date_idx on public.manager_attendance_records(manager_user_id, attendance_date desc);
create index if not exists manager_docs_created_idx on public.manager_employee_documents(manager_user_id, created_at desc);
create index if not exists manager_visits_created_idx on public.manager_customer_visits(manager_user_id, visited_at desc);
create index if not exists salesmen_manager_idx on public.salesmen(manager_user_id, active);

alter table public.manager_attendance_records enable row level security;
alter table public.manager_employee_documents enable row level security;
alter table public.manager_customer_visits enable row level security;

grant select, insert, update on public.manager_attendance_records to authenticated;
grant select, insert on public.manager_employee_documents, public.manager_customer_visits to authenticated;
grant select on public.salesmen, public.attendance_records to authenticated;
grant select, update (avatar_path, updated_at) on public.profiles to authenticated;

-- Manager can manage their own profile and fieldwork. Admin can review every Manager record.
drop policy if exists manager_attendance_self on public.manager_attendance_records;
create policy manager_attendance_self on public.manager_attendance_records for select to authenticated
using (manager_user_id = auth.uid() or public.is_admin());
drop policy if exists manager_attendance_insert_self on public.manager_attendance_records;
create policy manager_attendance_insert_self on public.manager_attendance_records for insert to authenticated
with check ((manager_user_id = auth.uid() and public.is_manager()) or public.is_admin());
drop policy if exists manager_attendance_update_self on public.manager_attendance_records;
create policy manager_attendance_update_self on public.manager_attendance_records for update to authenticated
using ((manager_user_id = auth.uid() and public.is_manager()) or public.is_admin())
with check ((manager_user_id = auth.uid() and public.is_manager()) or public.is_admin());

drop policy if exists manager_docs_self on public.manager_employee_documents;
create policy manager_docs_self on public.manager_employee_documents for select to authenticated
using (manager_user_id = auth.uid() or public.is_admin());
drop policy if exists manager_docs_insert_self on public.manager_employee_documents;
create policy manager_docs_insert_self on public.manager_employee_documents for insert to authenticated
with check ((manager_user_id = auth.uid() and public.is_manager()) or public.is_admin());

drop policy if exists manager_visits_self on public.manager_customer_visits;
create policy manager_visits_self on public.manager_customer_visits for select to authenticated
using (manager_user_id = auth.uid() or public.is_admin());
drop policy if exists manager_visits_insert_self on public.manager_customer_visits;
create policy manager_visits_insert_self on public.manager_customer_visits for insert to authenticated
with check ((manager_user_id = auth.uid() and public.is_manager()) or public.is_admin());

-- Managers may view only attendance of salesmen assigned to them; admins retain company-wide visibility.
drop policy if exists attendance_self_select on public.attendance_records;
create policy attendance_self_select on public.attendance_records for select to authenticated
using (public.is_admin() or public.owns_salesman(salesman_id) or exists (
  select 1 from public.salesmen s where s.id = attendance_records.salesman_id and s.manager_user_id = auth.uid() and public.is_manager()
));

drop policy if exists salesman_read on public.salesmen;
create policy salesman_read on public.salesmen for select to authenticated
using (public.is_admin() or public.is_manager() and manager_user_id = auth.uid() or public.owns_salesman(id));

-- Manager profile images and documents live in the private bucket. Managers can access their own folder;
-- admins can access all folders; managers can read files inside folders belonging to their linked salesmen.
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists employee_private_read on storage.objects';
    execute $pol$create policy employee_private_read on storage.objects for select to authenticated using (
      bucket_id = 'employee-private' and (
        (storage.foldername(name))[1] = auth.uid()::text
        or public.is_admin()
        or exists(select 1 from public.salesmen s where s.user_id::text = (storage.foldername(name))[1] and s.manager_user_id = auth.uid() and public.is_manager())
      )
    )$pol$;
    execute 'drop policy if exists employee_private_insert on storage.objects';
    execute $pol$create policy employee_private_insert on storage.objects for insert to authenticated with check (
      bucket_id = 'employee-private' and (storage.foldername(name))[1] = auth.uid()::text
    )$pol$;
    execute 'drop policy if exists employee_private_delete on storage.objects';
    execute $pol$create policy employee_private_delete on storage.objects for delete to authenticated using (
      bucket_id = 'employee-private' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
    )$pol$;
  end if;
end $$;

-- Admin profile avatar update remains self-scoped; role policies above permit Admin to review Manager rows.
drop policy if exists profile_avatar_update_self on public.profiles;
create policy profile_avatar_update_self on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

notify pgrst, 'reload schema';
