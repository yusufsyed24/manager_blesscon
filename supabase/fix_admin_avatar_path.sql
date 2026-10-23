-- Blesscon Candy v45: complete manager_daily_closings schema repair.
-- Repairs older tables created before all manager-closing columns existed.
-- Safe to rerun; preserves existing records. Run in Supabase SQL Editor.
begin;

create table if not exists public.manager_daily_closings (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid references auth.users(id),
  business_date date
);

alter table public.manager_daily_closings
  add column if not exists manager_user_id uuid references auth.users(id),
  add column if not exists business_date date,
  add column if not exists team_salesman_ids text[] not null default '{}'::text[],
  add column if not exists sales_count integer not null default 0,
  add column if not exists sales_total_paisa bigint not null default 0,
  add column if not exists collections_by_method jsonb not null default '{}'::jsonb,
  add column if not exists collections_total_paisa bigint not null default 0,
  add column if not exists cash_received_paisa bigint not null default 0,
  add column if not exists expenses_total_paisa bigint not null default 0,
  add column if not exists cash_expenses_paisa bigint not null default 0,
  add column if not exists stock_movements jsonb not null default '{}'::jsonb,
  add column if not exists opening_cash_paisa bigint not null default 0,
  add column if not exists cash_handed_over_paisa bigint not null default 0,
  add column if not exists expected_cash_paisa bigint not null default 0,
  add column if not exists actual_cash_paisa bigint not null default 0,
  add column if not exists cash_variance_paisa bigint not null default 0,
  add column if not exists cash_in_bank_paisa bigint not null default 0,
  add column if not exists cash_in_hand_paisa bigint not null default 0,
  add column if not exists cash_in_easypaisa_paisa bigint not null default 0,
  add column if not exists cash_in_jazzcash_paisa bigint not null default 0,
  add column if not exists market_credit_paisa bigint not null default 0,
  add column if not exists expected_stock jsonb not null default '{}'::jsonb,
  add column if not exists actual_stock jsonb not null default '{}'::jsonb,
  add column if not exists stock_variances jsonb not null default '{}'::jsonb,
  add column if not exists reason text not null default '',
  add column if not exists notes text not null default '',
  add column if not exists status text not null default 'submitted',
  add column if not exists version integer not null default 1,
  add column if not exists submitted_by uuid,
  add column if not exists submitted_at timestamptz not null default now(),
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists decision_by uuid,
  add column if not exists decision_at timestamptz,
  add column if not exists decision_reason text not null default '',
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists manager_daily_closings_manager_date_uidx
  on public.manager_daily_closings(manager_user_id, business_date);
create index if not exists manager_daily_closings_date_status
  on public.manager_daily_closings(business_date, status);
comment on column public.manager_daily_closings.team_salesman_ids is
  'Salesman IDs included in this manager consolidated daily closing.';
comment on column public.manager_daily_closings.sales_count is
  'Count of sales/orders included in this manager consolidated daily closing.';
commit;
notify pgrst, 'reload schema';
