-- BCBM v55.80: Arsalan October attendance correction (audited, idempotent).
-- BACK UP first. This explicitly records 17 Oct 2026 as present, based on the
-- user's confirmation that Arsalan worked 17 days in October. It updates an
-- existing row (including an incorrect absent/leave row) rather than doing nothing.
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
    values (v_manager_id, date '2026-10-17', 'present', now())
    on conflict (manager_user_id, attendance_date)
    do update set status = 'present', updated_at = now();
  else
    select s.id into v_salesman_id
    from public.salesmen s
    where s.active is true and s.deleted_at is null
      and lower(trim(s.name)) = lower(trim('Arsalan Khan'));
    insert into public.attendance_records(salesman_id, attendance_date, status, updated_at)
    values (v_salesman_id, date '2026-10-17', 'present', now())
    on conflict (salesman_id, attendance_date)
    do update set status = 'present', updated_at = now();
  end if;
end $$;
commit;

-- Run these queries to confirm the correct table now has 17 Oct marked present.
select p.display_name, a.attendance_date, a.status
from public.manager_attendance_records a
join public.profiles p on p.id = a.manager_user_id
where lower(trim(p.display_name)) = lower(trim('Arsalan Khan'))
  and a.attendance_date between date '2026-10-01' and date '2026-10-31'
order by a.attendance_date;

select s.name, a.attendance_date, a.status
from public.attendance_records a
join public.salesmen s on s.id = a.salesman_id
where lower(trim(s.name)) = lower(trim('Arsalan Khan'))
  and a.attendance_date between date '2026-10-01' and date '2026-10-31'
order by a.attendance_date;
