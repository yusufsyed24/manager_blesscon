-- BCBM v55.90 (optional, additive): lets a Manager see the salary basis (fixed / commission) of their
-- own assigned salesmen, so the dashboard can show "cartons sold" instead of a target for commission salesmen.
-- Read-only. Admin already has full access. Back up first; safe to re-run.
drop policy if exists salesman_compensation_manager_read on public.salesman_compensation_settings;
create policy salesman_compensation_manager_read on public.salesman_compensation_settings
  for select to authenticated
  using (
    public.is_manager() and exists (
      select 1 from public.salesmen sm
      where sm.id = salesman_compensation_settings.salesman_id
        and sm.manager_user_id = auth.uid()
        and sm.deleted_at is null
    )
  );
notify pgrst, 'reload schema';
