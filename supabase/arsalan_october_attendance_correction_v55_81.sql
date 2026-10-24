-- BCBM v55.81: user-confirmed correction for Arsalan Khan, 18 Oct 2026.
-- BACK UP first. Updates an existing attendance row or inserts one.
-- Safeguard: abort unless exactly one active matching identity exists across manager/salesman records.
begin;
do $$
declare
  v_manager_id uuid;
  v_salesman_id text;
  v_manager_count integer;
  v_salesman_count integer;
begin
  select count(*) into v_manager_count
  from public.profiles p join public.user_roles r on r.user_id = p.id
  where r.role = 'manager' and lower(trim(p.display_name)) = lower(trim('Arsalan Khan'));

  select count(*) into v_salesman_count
  from public.salesmen s
  where s.active is true and s.deleted_at is null
    and lower(trim(s.name)) = lower(trim('Arsalan Khan'));

  if v_manager_count + v_salesman_count <> 1 then
    raise exception 'Expected exactly one active Arsalan Khan identity across manager and salesman records; found managers %, salesmen %. No change made.', v_manager_count, v_salesman_count;
  end if;

  if v_manager_count = 1 then
    select p.id into v_manager_id
    from public.profiles p join public.user_roles r on r.user_id = p.id
    where r.role = 'manager' and lower(trim(p.display_name)) = lower(trim('Arsalan Khan'));
    insert into public.manager_attendance_records(manager_user_id, attendance_date, status, updated_at)
    values (v_manager_id, date '2026-10-18', 'present', now())
    on conflict (manager_user_id, attendance_date)
    do update set status = 'present', updated_at = now();
  else
    select s.id into v_salesman_id
    from public.salesmen s
    where s.active is true and s.deleted_at is null
      and lower(trim(s.name)) = lower(trim('Arsalan Khan'));
    insert into public.attendance_records(salesman_id, attendance_date, status, updated_at)
    values (v_salesman_id, date '2026-10-18', 'present', now())
    on conflict (salesman_id, attendance_date)
    do update set status = 'present', updated_at = now();
  end if;
end $$;
commit;

-- Verify the October 18 row. Exactly one of these queries should return the employee row.
select p.display_name, a.attendance_date, a.status
from public.manager_attendance_records a
join public.profiles p on p.id = a.manager_user_id
where lower(trim(p.display_name)) = lower(trim('Arsalan Khan'))
  and a.attendance_date = date '2026-10-18';

select s.name, a.attendance_date, a.status
from public.attendance_records a
join public.salesmen s on s.id = a.salesman_id
where lower(trim(s.name)) = lower(trim('Arsalan Khan'))
  and a.attendance_date = date '2026-10-18';
