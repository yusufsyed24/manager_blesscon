-- BCBM v55.49: allow Admin-only read access to order_items for payroll calculations.
-- This is deliberately scoped to Admin; it does not grant managers or salesmen access.
-- Run in Supabase SQL Editor after the existing application schema/migrations.

begin;

grant select on table public.order_items to authenticated;

alter table public.order_items enable row level security;

drop policy if exists order_items_admin_payroll_read on public.order_items;
create policy order_items_admin_payroll_read
  on public.order_items
  for select
  to authenticated
  using (public.is_admin());

commit;

-- Verify: this should return the policy above.
select schemaname, tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'order_items'
  and policyname = 'order_items_admin_payroll_read';
