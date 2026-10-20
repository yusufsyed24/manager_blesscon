-- v55.15: manager inbox + hierarchical Admin announcements + Manager Cash & Bank Book UI policy support.
-- Additive migration. Preserves existing employee_notifications rows and business history.

alter table public.employee_notifications
  alter column recipient_salesman_id drop not null;

alter table public.employee_notifications
  add column if not exists recipient_user_id uuid references auth.users(id) on delete cascade;

-- Exactly one recipient is required: either a salesman profile or a login account.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.employee_notifications'::regclass
      and conname = 'employee_notifications_exactly_one_recipient_check'
  ) then
    alter table public.employee_notifications
      add constraint employee_notifications_exactly_one_recipient_check
      check ((recipient_salesman_id is not null) <> (recipient_user_id is not null));
  end if;
end $$;

create index if not exists employee_notifications_recipient_user_idx
  on public.employee_notifications(recipient_user_id, created_at desc)
  where recipient_user_id is not null;

alter table public.employee_notifications enable row level security;
revoke all on public.employee_notifications from anon, authenticated;
grant select, insert on public.employee_notifications to authenticated;
grant update (read_at, acknowledged_at) on public.employee_notifications to authenticated;

drop policy if exists employee_notifications_read on public.employee_notifications;
create policy employee_notifications_read on public.employee_notifications
  for select to authenticated
  using (
    public.is_admin()
    or (recipient_user_id = auth.uid() and public.is_manager())
    or (recipient_salesman_id is not null and public.owns_salesman(recipient_salesman_id))
    or (recipient_salesman_id is not null and exists (
      select 1 from public.salesmen sm
      where sm.id = employee_notifications.recipient_salesman_id
        and sm.manager_user_id = auth.uid() and public.is_manager()
    ))
  );

drop policy if exists employee_notifications_send on public.employee_notifications;
create policy employee_notifications_send on public.employee_notifications
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.is_admin()
      or (
        public.is_manager()
        and recipient_user_id is null
        and recipient_salesman_id is not null
        and exists (
          select 1 from public.salesmen sm
          where sm.id = employee_notifications.recipient_salesman_id
            and sm.manager_user_id = auth.uid()
        )
      )
    )
  );

drop policy if exists employee_notifications_read_update on public.employee_notifications;
create policy employee_notifications_read_update on public.employee_notifications
  for update to authenticated
  using (
    public.is_admin()
    or (recipient_user_id = auth.uid() and public.is_manager())
    or (recipient_salesman_id is not null and public.owns_salesman(recipient_salesman_id))
  )
  with check (
    public.is_admin()
    or (recipient_user_id = auth.uid() and public.is_manager())
    or (recipient_salesman_id is not null and public.owns_salesman(recipient_salesman_id))
  );

notify pgrst, 'reload schema';
