-- BCBM v55.77: audited Arsalan October attendance correction.
-- Apply only after reviewing the employee identity and backing up the database.
-- Ensures 17 Oct 2026 is marked present, updating an existing row for that date if needed.
-- This correction is limited to Arsalan Khan and the single specified date.
begin;
do $$
declare
  v_manager_id uuid;
  v_salesman_id text;
  v_manager_count integer;
  v_salesman_count integer;
begin
  select count(*) into v_manager_count
  from public.profiles p join public.user_roles r on r.user_id=p.id
  where r.role='manager' and p.display_name ilike 'Arsalan Khan';
  select count(*) into v_salesman_count
  from public.salesmen s
  where s.active is true and s.deleted_at is null and s.name ilike 'Arsalan Khan';

  if v_manager_count = 1 then
    select p.id into v_manager_id
    from public.profiles p join public.user_roles r on r.user_id=p.id
    where r.role='manager' and p.display_name ilike 'Arsalan Khan';
    insert into public.manager_attendance_records(manager_user_id, attendance_date, status, updated_at)
    values(v_manager_id, date '2026-10-17', 'present', now())
    on conflict (manager_user_id, attendance_date) do update
      set status='present', updated_at=now();
  elsif v_manager_count = 0 and v_salesman_count = 1 then
    select s.id into v_salesman_id from public.salesmen s
    where s.active is true and s.deleted_at is null and s.name ilike 'Arsalan Khan';
    insert into public.attendance_records(salesman_id, attendance_date, status, updated_at)
    values(v_salesman_id, date '2026-10-17', 'present', now())
    on conflict (salesman_id, attendance_date) do update
      set status='present', updated_at=now();
  else
    raise exception 'Expected exactly one Arsalan Khan manager or salesman identity; found managers %, salesmen %. No attendance changed.', v_manager_count, v_salesman_count;
  end if;
end $$;
commit;

-- Verify the corrected record and resulting attendance rows. Confirm credited total in the app before release.
select p.display_name, a.attendance_date, a.status
from public.manager_attendance_records a join public.profiles p on p.id=a.manager_user_id
where p.display_name ilike 'Arsalan Khan' and a.attendance_date between date '2026-10-01' and date '2026-10-31'
order by a.attendance_date;
select s.name, a.attendance_date, a.status
from public.attendance_records a join public.salesmen s on s.id=a.salesman_id
where s.name ilike 'Arsalan Khan' and a.attendance_date between date '2026-10-01' and date '2026-10-31'
order by a.attendance_date;
