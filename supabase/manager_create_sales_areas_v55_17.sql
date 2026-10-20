-- Blesscon Candy Business Manager v55.17: allow Managers to create active sales areas.
-- Safe additive migration. Admin retains exclusive activate/deactivate control.
-- Run in Supabase SQL Editor as a normal SQL script.

alter table public.sales_areas enable row level security;
grant select, insert, update on public.sales_areas to authenticated;

drop policy if exists sales_areas_manager_insert on public.sales_areas;
create policy sales_areas_manager_insert
  on public.sales_areas
  for insert
  to authenticated
  with check (public.is_manager() and created_by = auth.uid() and active = true);

-- Admin policy remains responsible for all area updates/deactivation.
-- Managers may read the catalogue using the existing sales_areas_read policy.
