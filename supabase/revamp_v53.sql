-- Blesscon Candy Business Manager v53 additive revamp migration.
-- Safe to rerun. Does not reset business data, products, pricing, stock, accounts or history.

alter table public.salesmen add column if not exists date_of_birth date;
create index if not exists salesmen_manager_active_idx on public.salesmen(manager_user_id, active) where deleted_at is null;

-- Effective-dated area assignments preserve the historical area for reporting.
create table if not exists public.salesman_area_assignments (
  id uuid primary key default gen_random_uuid(),
  salesman_id text not null references public.salesmen(id) on delete restrict,
  area_name text not null check (length(trim(area_name)) > 0),
  effective_from date not null,
  effective_to date,
  instructions text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create index if not exists salesman_area_assignments_effective_idx
  on public.salesman_area_assignments(salesman_id, effective_from desc, effective_to);
create unique index if not exists salesman_area_assignment_no_duplicate_start
  on public.salesman_area_assignments(salesman_id, effective_from, area_name);
alter table public.salesman_area_assignments enable row level security;
revoke all on public.salesman_area_assignments from anon, authenticated;
grant select, insert, update on public.salesman_area_assignments to authenticated;
drop policy if exists salesman_area_assignments_read on public.salesman_area_assignments;
create policy salesman_area_assignments_read on public.salesman_area_assignments for select to authenticated
  using (public.is_admin() or public.owns_salesman(salesman_id) or exists (
    select 1 from public.salesmen sm where sm.id = salesman_area_assignments.salesman_id
      and sm.manager_user_id = auth.uid() and public.is_manager()
  ));
drop policy if exists salesman_area_assignments_manage on public.salesman_area_assignments;
create policy salesman_area_assignments_manage on public.salesman_area_assignments for all to authenticated
  using (public.is_admin() or (public.is_manager() and exists (
    select 1 from public.salesmen sm where sm.id = salesman_area_assignments.salesman_id and sm.manager_user_id = auth.uid()
  )))
  with check (public.is_admin() or (public.is_manager() and created_by = auth.uid() and exists (
    select 1 from public.salesmen sm where sm.id = salesman_area_assignments.salesman_id and sm.manager_user_id = auth.uid()
  )));

-- Persistent notifications. Salesmen may only read/mark their own messages as read.
create table if not exists public.employee_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_salesman_id text not null references public.salesmen(id) on delete cascade,
  title text not null default '',
  message text not null check (length(trim(message)) > 0),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  requires_acknowledgement boolean not null default false,
  acknowledged_at timestamptz,
  read_at timestamptz,
  expires_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists employee_notifications_recipient_idx
  on public.employee_notifications(recipient_salesman_id, created_at desc);
alter table public.employee_notifications enable row level security;
revoke all on public.employee_notifications from anon, authenticated;
grant select on public.employee_notifications to authenticated;
revoke update on public.employee_notifications from authenticated;
grant update (read_at, acknowledged_at) on public.employee_notifications to authenticated;
grant insert on public.employee_notifications to authenticated;
drop policy if exists employee_notifications_read on public.employee_notifications;
create policy employee_notifications_read on public.employee_notifications for select to authenticated
  using (public.is_admin() or public.owns_salesman(recipient_salesman_id) or exists (
    select 1 from public.salesmen sm where sm.id = employee_notifications.recipient_salesman_id
      and sm.manager_user_id = auth.uid() and public.is_manager()
  ));
drop policy if exists employee_notifications_send on public.employee_notifications;
create policy employee_notifications_send on public.employee_notifications for insert to authenticated
  with check (created_by = auth.uid() and (public.is_admin() or (public.is_manager() and exists (
    select 1 from public.salesmen sm where sm.id = employee_notifications.recipient_salesman_id and sm.manager_user_id = auth.uid()
  ))));
drop policy if exists employee_notifications_read_update on public.employee_notifications;
create policy employee_notifications_read_update on public.employee_notifications for update to authenticated
  using (public.is_admin() or public.owns_salesman(recipient_salesman_id))
  with check (public.is_admin() or public.owns_salesman(recipient_salesman_id));

-- Manager-controlled employee profile/document/attendance rules. Preserve reads of own attendance/documents.
-- Remove legacy policies that allowed salesmen to write their own attendance or employee documents.
drop policy if exists attendance_self_insert on public.attendance_records;
drop policy if exists attendance_self_update on public.attendance_records;
drop policy if exists employee_documents_self_insert on public.employee_documents;
drop policy if exists salesman_photo_self_update on public.salesmen;
revoke insert, update on public.attendance_records from authenticated;
grant select on public.attendance_records to authenticated;
grant insert, update on public.attendance_records to authenticated;
drop policy if exists attendance_self_select on public.attendance_records;
drop policy if exists attendance_read_self_or_team on public.attendance_records;
create policy attendance_read_self_or_team on public.attendance_records for select to authenticated
  using (public.is_admin() or public.owns_salesman(salesman_id) or exists (select 1 from public.salesmen sm where sm.id = attendance_records.salesman_id and sm.manager_user_id = auth.uid() and public.is_manager()));
drop policy if exists attendance_manager_admin_write on public.attendance_records;
create policy attendance_manager_admin_write on public.attendance_records for all to authenticated
  using (public.is_admin() or (public.is_manager() and exists (
    select 1 from public.salesmen sm where sm.id = attendance_records.salesman_id and sm.manager_user_id = auth.uid()
  )))
  with check (public.is_admin() or (public.is_manager() and exists (
    select 1 from public.salesmen sm where sm.id = attendance_records.salesman_id and sm.manager_user_id = auth.uid()
  )));

revoke insert on public.employee_documents from authenticated;
grant select, insert, delete on public.employee_documents to authenticated;
drop policy if exists employee_documents_self_select on public.employee_documents;
create policy employee_documents_read_self_or_team on public.employee_documents for select to authenticated
  using (public.is_admin() or public.owns_salesman(salesman_id) or exists (select 1 from public.salesmen sm where sm.id = employee_documents.salesman_id and sm.manager_user_id = auth.uid() and public.is_manager()));
drop policy if exists employee_documents_manager_admin_write on public.employee_documents;
create policy employee_documents_manager_admin_write on public.employee_documents for all to authenticated
  using (public.is_admin() or (public.is_manager() and exists (
    select 1 from public.salesmen sm where sm.id = employee_documents.salesman_id and sm.manager_user_id = auth.uid()
  )))
  with check (public.is_admin() or (public.is_manager() and exists (
    select 1 from public.salesmen sm where sm.id = employee_documents.salesman_id and sm.manager_user_id = auth.uid()
  )));

-- A salesman can no longer change the profile photo path or protected identity fields.
revoke update (photo_path) on public.salesmen from authenticated;
-- Defense in depth even if a broad table-level UPDATE grant exists from an older migration.
create or replace function private.protect_salesman_identity_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_admin() or public.is_manager()) and public.owns_salesman(old.id) and (
    (to_jsonb(new)->'name') is distinct from (to_jsonb(old)->'name') or
    (to_jsonb(new)->'date_of_birth') is distinct from (to_jsonb(old)->'date_of_birth') or
    (to_jsonb(new)->'photo_path') is distinct from (to_jsonb(old)->'photo_path') or
    (to_jsonb(new)->'phone') is distinct from (to_jsonb(old)->'phone') or
    (to_jsonb(new)->'territory') is distinct from (to_jsonb(old)->'territory') or
    (to_jsonb(new)->'area') is distinct from (to_jsonb(old)->'area') or
    (to_jsonb(new)->'user_id') is distinct from (to_jsonb(old)->'user_id') or
    (to_jsonb(new)->'id') is distinct from (to_jsonb(old)->'id')
  ) then
    raise exception 'Salesman identity fields are managed by authorized management';
  end if;
  return new;
end $$;
drop trigger if exists protect_salesman_identity_fields on public.salesmen;
create trigger protect_salesman_identity_fields before update on public.salesmen
  for each row execute function private.protect_salesman_identity_fields();
-- Existing manager/admin policies remain responsible for authorized salesman profile updates.

-- Employee private storage: no salesman uploads/deletes. Admins and the assigned manager manage employee files.
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists employee_private_read on storage.objects';
    execute 'create policy employee_private_read on storage.objects for select to authenticated using (bucket_id = ''employee-private'' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text or (public.is_manager() and exists (select 1 from public.salesmen sm where sm.manager_user_id = auth.uid() and sm.user_id::text = (storage.foldername(name))[1]))))';
    execute 'drop policy if exists employee_private_insert on storage.objects';
    execute 'create policy employee_private_insert on storage.objects for insert to authenticated with check (bucket_id = ''employee-private'' and (public.is_admin() or (public.is_manager() and exists (select 1 from public.salesmen sm where sm.manager_user_id = auth.uid() and sm.user_id::text = (storage.foldername(name))[1]))))';
    execute 'drop policy if exists employee_private_delete on storage.objects';
    execute 'create policy employee_private_delete on storage.objects for delete to authenticated using (bucket_id = ''employee-private'' and (public.is_admin() or (public.is_manager() and exists (select 1 from public.salesmen sm where sm.manager_user_id = auth.uid() and sm.user_id::text = (storage.foldername(name))[1]))))';
  end if;
end $$;

notify pgrst, 'reload schema';
