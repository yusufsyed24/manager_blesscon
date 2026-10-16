-- Salesman self-service: profile media, attendance and customer field visits.
-- Additive migration: does not delete or reset existing business data.
alter table public.salesmen add column if not exists photo_path text;
alter table public.salesmen add column if not exists territory text;
alter table public.salesmen add column if not exists area text;

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  salesman_id text not null references public.salesmen(id) on delete cascade,
  attendance_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_latitude double precision,
  check_in_longitude double precision,
  check_in_location_accuracy_m double precision,
  status text not null default 'present' check (status in ('present','late','half_day','absent','leave','pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salesman_id, attendance_date),
  check (check_out_at is null or check_in_at is not null),
  check (check_out_at is null or check_out_at >= check_in_at)
);
-- Add check-in GPS columns safely for installations created before this feature.
alter table public.attendance_records add column if not exists check_in_latitude double precision;
alter table public.attendance_records add column if not exists check_in_longitude double precision;
alter table public.attendance_records add column if not exists check_in_location_accuracy_m double precision;

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  salesman_id text not null references public.salesmen(id) on delete cascade,
  document_type text not null check (document_type in ('identity','employment','other')),
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);
create table if not exists public.customer_visits (
  id uuid primary key default gen_random_uuid(),
  salesman_id text not null references public.salesmen(id) on delete cascade,
  customer_label text not null default '',
  area text not null default '',
  purpose text not null default 'Sales visit',
  notes text not null default '',
  latitude double precision,
  longitude double precision,
  location_accuracy_m double precision,
  visited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (latitude is null or latitude between -90 and 90),
  check (longitude is null or longitude between -180 and 180),
  check ((latitude is null) = (longitude is null))
);
create index if not exists attendance_salesman_date_idx on public.attendance_records(salesman_id, attendance_date desc);
create index if not exists visits_salesman_time_idx on public.customer_visits(salesman_id, visited_at desc);
create index if not exists employee_docs_salesman_idx on public.employee_documents(salesman_id, created_at desc);

alter table public.attendance_records enable row level security;
alter table public.employee_documents enable row level security;
alter table public.customer_visits enable row level security;
revoke all on public.attendance_records, public.employee_documents, public.customer_visits from anon, authenticated;
grant select, insert, update on public.attendance_records to authenticated;
grant select, insert on public.employee_documents, public.customer_visits to authenticated;

drop policy if exists attendance_self_select on public.attendance_records;
create policy attendance_self_select on public.attendance_records for select to authenticated using (public.is_admin() or public.owns_salesman(salesman_id));
drop policy if exists attendance_self_insert on public.attendance_records;
create policy attendance_self_insert on public.attendance_records for insert to authenticated with check (public.is_admin() or (public.owns_salesman(salesman_id) and check_in_at is not null and status in ('present','late','pending')));
drop policy if exists attendance_self_update on public.attendance_records;
create policy attendance_self_update on public.attendance_records for update to authenticated using (public.is_admin() or public.owns_salesman(salesman_id)) with check (public.is_admin() or public.owns_salesman(salesman_id));

drop policy if exists employee_documents_self_select on public.employee_documents;
create policy employee_documents_self_select on public.employee_documents for select to authenticated using (public.is_admin() or public.owns_salesman(salesman_id));
drop policy if exists employee_documents_self_insert on public.employee_documents;
create policy employee_documents_self_insert on public.employee_documents for insert to authenticated with check (public.is_admin() or public.owns_salesman(salesman_id));

drop policy if exists customer_visits_self_select on public.customer_visits;
create policy customer_visits_self_select on public.customer_visits for select to authenticated using (public.is_admin() or public.owns_salesman(salesman_id));
drop policy if exists customer_visits_self_insert on public.customer_visits;
create policy customer_visits_self_insert on public.customer_visits for insert to authenticated with check (public.is_admin() or public.owns_salesman(salesman_id));

-- Private employee files bucket. Access is scoped to the authenticated user's own folder or admins.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values ('employee-private','employee-private',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
    on conflict (id) do update set public=false, file_size_limit=10485760, allowed_mime_types=excluded.allowed_mime_types;
    execute 'drop policy if exists employee_private_read on storage.objects';
    execute 'create policy employee_private_read on storage.objects for select to authenticated using (bucket_id=''employee-private'' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()))';
    execute 'drop policy if exists employee_private_insert on storage.objects';
    execute 'create policy employee_private_insert on storage.objects for insert to authenticated with check (bucket_id=''employee-private'' and (storage.foldername(name))[1]=auth.uid()::text)';
    execute 'drop policy if exists employee_private_delete on storage.objects';
    execute 'create policy employee_private_delete on storage.objects for delete to authenticated using (bucket_id=''employee-private'' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()))';
  end if;
end $$;

-- Ensure authenticated admins can read salesman records for the admin fieldwork panel.
-- Some existing deployments revoked table privileges after the base schema was applied.
grant select on public.salesmen to authenticated;
drop policy if exists salesman_read on public.salesmen;
create policy salesman_read on public.salesmen for select to authenticated
  using (public.is_admin() or public.owns_salesman(id));

-- Permit a linked salesman to change only the profile-photo path; other
-- employee fields remain writable only through existing authorized workflows.
grant update (photo_path) on public.salesmen to authenticated;
drop policy if exists salesman_photo_self_update on public.salesmen;
create policy salesman_photo_self_update on public.salesmen for update to authenticated
  using (public.owns_salesman(id)) with check (public.owns_salesman(id));


-- Re-assert admin read permissions for the one-click employee profile and fieldwork view.
-- Safe to rerun; policies still scope ordinary salesman access to their own records.
grant select on public.salesmen, public.attendance_records, public.employee_documents, public.customer_visits to authenticated;
drop policy if exists attendance_self_select on public.attendance_records;
create policy attendance_self_select on public.attendance_records for select to authenticated
  using (public.is_admin() or public.owns_salesman(salesman_id));
drop policy if exists employee_documents_self_select on public.employee_documents;
create policy employee_documents_self_select on public.employee_documents for select to authenticated
  using (public.is_admin() or public.owns_salesman(salesman_id));
drop policy if exists customer_visits_self_select on public.customer_visits;
create policy customer_visits_self_select on public.customer_visits for select to authenticated
  using (public.is_admin() or public.owns_salesman(salesman_id));
notify pgrst, 'reload schema';


-- Administrator profile picture support. Each administrator may update only their own profile row.
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
grant update (avatar_path, updated_at) on public.profiles to authenticated;
drop policy if exists profile_avatar_update_self on public.profiles;
create policy profile_avatar_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
notify pgrst, 'reload schema';
