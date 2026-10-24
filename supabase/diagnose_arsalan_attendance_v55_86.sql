-- READ-ONLY diagnostic. Safe to run. Shows Arsalan's October 2026 attendance by status.
-- Expected after v55.86: present + late + week_off (1 day each) + half_day (0.5) = days shown in Admin payroll.
select s.name, a.attendance_date, a.status
from public.attendance_records a
join public.salesmen s on s.id = a.salesman_id
where s.name ilike '%arsalan%'
  and a.attendance_date between '2026-10-01' and '2026-10-31'
order by a.attendance_date;

select s.name, a.status, count(*) as days
from public.attendance_records a
join public.salesmen s on s.id = a.salesman_id
where s.name ilike '%arsalan%'
  and a.attendance_date between '2026-10-01' and '2026-10-31'
group by s.name, a.status
order by a.status;
