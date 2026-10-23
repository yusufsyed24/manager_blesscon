-- BCBM v55.50 — salesman fixed/commission compensation basis
-- Run in Supabase SQL Editor after the existing BCBM schema and payroll migrations.
-- Commission amounts are stored as integer paisa per carton.

begin;

create table if not exists public.salesman_compensation_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  salesman_id text not null,
  salary_basis text not null default 'fixed' check (salary_basis in ('fixed','commission')),
  updated_at timestamptz not null default now()
);

create table if not exists public.salesman_product_commissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  salesman_id text not null,
  product_id text not null,
  product_name text not null default '',
  commission_per_carton_paisa bigint not null default 0 check (commission_per_carton_paisa >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists salesman_product_commissions_salesman_idx
  on public.salesman_product_commissions (salesman_id, product_id);

alter table public.salesman_compensation_settings enable row level security;
alter table public.salesman_product_commissions enable row level security;

grant select, insert, update on public.salesman_compensation_settings to authenticated;
grant select, insert, update, delete on public.salesman_product_commissions to authenticated;

drop policy if exists salesman_compensation_admin_all on public.salesman_compensation_settings;
create policy salesman_compensation_admin_all on public.salesman_compensation_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists salesman_compensation_read_self on public.salesman_compensation_settings;
create policy salesman_compensation_read_self on public.salesman_compensation_settings
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists salesman_commissions_admin_all on public.salesman_product_commissions;
create policy salesman_commissions_admin_all on public.salesman_product_commissions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists salesman_commissions_read_self on public.salesman_product_commissions;
create policy salesman_commissions_read_self on public.salesman_product_commissions
  for select to authenticated
  using (user_id = auth.uid());

commit;

select table_name, policy_name, cmd
from (
  select tablename as table_name, policyname as policy_name, cmd
  from pg_policies
  where schemaname = 'public'
    and tablename in ('salesman_compensation_settings','salesman_product_commissions')
) p
order by table_name, policy_name;
