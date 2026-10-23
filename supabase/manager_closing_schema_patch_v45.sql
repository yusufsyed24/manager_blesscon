-- Repair salesman profile & fieldwork table permissions.
-- Run this AFTER schema.sql, operational_modules.sql, manager_role.sql (if used),
-- and salesman_self_service.sql. Safe to rerun; no business data is deleted.

grant select on public.salesmen to authenticated;
grant select, insert, update on public.attendance_records to authenticated;
grant select, insert on public.employee_documents, public.customer_visits to authenticated;

alter table public.salesmen enable row level security;
alter table public.attendance_records enable row level security;
alter table public.employee_documents enable row level security;
alter table public.customer_visits enable row level security;

drop policy if exists salesman_read on public.salesmen;
create policy salesman_read on public.salesmen
  for select to authenticated
  using (public.is_admin() or public.owns_salesman(id));

drop policy if exists attendance_self_select on public.attendance_records;
create policy attendance_self_select on public.attendance_records
  for select to authenticated
  using (public.is_admin() or public.owns_salesman(salesman_id));
drop policy if exists attendance_self_insert on public.attendance_records;
create policy attendance_self_insert on public.attendance_records
  for insert to authenticated
  with check (public.is_admin() or (public.owns_salesman(salesman_id) and check_in_at is not null and status in ('present','late','pending')));
drop policy if exists attendance_self_update on public.attendance_records;
create policy attendance_self_update on public.attendance_records
  for update to authenticated
  using (public.is_admin() or public.owns_salesman(salesman_id))
  with check (public.is_admin() or public.owns_salesman(salesman_id));

drop policy if exists employee_documents_self_select on public.employee_documents;
create policy employee_documents_self_select on public.employee_documents
  for select to authenticated
  using (public.is_admin() or public.owns_salesman(salesman_id));
drop policy if exists employee_documents_self_insert on public.employee_documents;
create policy employee_documents_self_insert on public.employee_documents
  for insert to authenticated
  with check (public.is_admin() or public.owns_salesman(salesman_id));

drop policy if exists customer_visits_self_select on public.customer_visits;
create policy customer_visits_self_select on public.customer_visits
  for select to authenticated
  using (public.is_admin() or public.owns_salesman(salesman_id));
drop policy if exists customer_visits_self_insert on public.customer_visits;
create policy customer_visits_self_insert on public.customer_visits
  for insert to authenticated
  with check (public.is_admin() or public.owns_salesman(salesman_id));

notify pgrst, 'reload schema';
