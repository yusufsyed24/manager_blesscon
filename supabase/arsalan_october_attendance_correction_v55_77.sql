-- BCBM v55.79: explicit, audited attendance correction.
-- BACK UP first. This marks 17 Oct 2026 as present for exactly one active
-- Arsalan Khan identity. If both a manager and salesman match (or duplicates
-- exist), it aborts rather than silently updating the wrong employee.
begin;
do $$
declare
  v_manager_id uuid;
  v_salesman_id text;
  v_manager_count integer;
  v_salesman_count integer;
begin
  select count(*) into v_manager_count
  from public.profiles p
  join public.user_roles r on r.user_id = p.id
  where lower(trim(coalesce(p.display_name,''))) = lower('Arsalan Khan')
    and lower(trim(r.role)) = 'manager';

  select count(*) into v_salesman_count
  from public.salesmen s
  where s.active is true and s.deleted_at is null
    and lower(trim(coalesce(s.name,''))) = lower('Arsalan Khan');

  if v_manager_count + v_salesman_count <> 1 then
    raise exception 'Attendance correction stopped: expected exactly one matching identity; managers %, active salesmen %. Review the identity before retrying.', v_manager_count, v_salesman_count;
  end if;

  if v_manager_count = 1 then
    select p.id into v_manager_id
    from public.profiles p
    join public.user_roles r on r.user_id = p.id
    where lower(trim(coalesce(p.display_name,''))) = lower('Arsalan Khan')
      and lower(trim(r.role)) = 'manager';

    insert into public.manager_attendance_records
      (manager_user_id, attendance_date, status, updated_at)
    values (v_manager_id, date '2026-10-17', 'present', now())
    on conflict (manager_user_id, attendance_date)
    do update set status = 'present', updated_at = now();
  else
    select s.id into v_salesman_id
    from public.salesmen s
    where s.active is true and s.deleted_at is null
      and lower(trim(coalesce(s.name,''))) = lower('Arsalan Khan');

    insert into public.attendance_records
      (salesman_id, attendance_date, status, updated_at)
    values (v_salesman_id, date '2026-10-17', 'present', now())
    on conflict (salesman_id, attendance_date)
    do update set status = 'present', updated_at = now();
  end if;
end $$;
commit;

-- Verification: the target date should show status = present.
select p.display_name, a.attendance_date, a.status
from public.manager_attendance_records a
join public.profiles p on p.id = a.manager_user_id
where lower(trim(coalesce(p.display_name,''))) = lower('Arsalan Khan')
  and a.attendance_date between date '2026-10-01' and date '2026-10-31'
order by a.attendance_date;

select s.name, a.attendance_date, a.status
from public.attendance_records a
join public.salesmen s on s.id = a.salesman_id
where lower(trim(coalesce(s.name,''))) = lower('Arsalan Khan')
  and a.attendance_date between date '2026-10-01' and date '2026-10-31'
order by a.attendance_date;
