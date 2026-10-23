-- BCBM v55.61 payroll slips, month-wise history and release notifications.
-- Run in Supabase SQL Editor after the existing BCBM schema/payroll migrations.
begin;
create table if not exists public.employee_salary_slips (
  id text primary key,
  employee_user_id uuid references auth.users(id) on delete set null,
  salesman_id text,
  manager_user_id uuid references auth.users(id) on delete set null,
  employee_name text not null,
  employee_type text not null check (employee_type in ('salesman','manager')),
  salary_period text not null check (salary_period ~ '^\d{4}-\d{2}$'),
  salary_basis text not null default 'fixed' check (salary_basis in ('fixed','commission')),
  gross_paisa bigint not null default 0,
  arrears_paisa bigint not null default 0,
  advance_deduction_paisa bigint not null default 0,
  net_paid_paisa bigint not null default 0,
  payment_date date not null default current_date,
  payment_account_key text,
  payment_reference text not null default '',
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists employee_salary_slips_period_unique on public.employee_salary_slips(employee_type, (coalesce(salesman_id, manager_user_id::text)), salary_period);
alter table public.employee_salary_slips enable row level security;
grant select, insert on public.employee_salary_slips to authenticated;
drop policy if exists employee_salary_slips_read on public.employee_salary_slips;
create policy employee_salary_slips_read on public.employee_salary_slips for select to authenticated
using (public.is_admin() or employee_user_id=auth.uid() or manager_user_id=auth.uid() or exists(select 1 from public.salesmen s where s.id=salesman_id and s.user_id=auth.uid()));
drop policy if exists employee_salary_slips_admin_insert on public.employee_salary_slips;
create policy employee_salary_slips_admin_insert on public.employee_salary_slips for insert to authenticated
with check (public.is_admin());
-- Extend existing notifications to support manager recipients as well as salesmen.
alter table public.employee_notifications alter column recipient_salesman_id drop not null;
alter table public.employee_notifications add column if not exists recipient_user_id uuid references auth.users(id) on delete cascade;
create index if not exists employee_notifications_user_recipient_idx on public.employee_notifications(recipient_user_id, created_at desc);
drop policy if exists employee_notifications_read on public.employee_notifications;
create policy employee_notifications_read on public.employee_notifications for select to authenticated
using (public.is_admin() or recipient_user_id=auth.uid() or (recipient_salesman_id is not null and (public.owns_salesman(recipient_salesman_id) or exists(select 1 from public.salesmen sm where sm.id=recipient_salesman_id and sm.manager_user_id=auth.uid() and public.is_manager()))));
drop policy if exists employee_notifications_send on public.employee_notifications;
create policy employee_notifications_send on public.employee_notifications for insert to authenticated
with check (created_by=auth.uid() and public.is_admin() and ((recipient_user_id is not null and recipient_salesman_id is null) or (recipient_salesman_id is not null and recipient_user_id is null)));
-- Salary notifications are kept in the existing employee_notifications inbox.
notify pgrst, 'reload schema';
commit;
