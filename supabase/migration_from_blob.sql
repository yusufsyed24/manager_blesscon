-- Historical attendance import for Arsalan and Babar Ali Khan (2026).
-- Review names before running. Run in Supabase SQL Editor as database owner.
-- Existing attendance rows are preserved; missing dates are inserted only.
-- Arsalan corrected period: 1–17 Oct; 5 and 6 Oct remain absent; Sundays are week_off.
-- Babar Ali Khan (manager): 10–22 Oct; all listed dates present.

-- Ensure the attendance tables and date uniqueness exist (normally created by the
-- existing salesman_self_service.sql and manager_profile_fieldwork.sql migrations).
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  salesman_id text not null references public.salesmen(id) on delete cascade,
  attendance_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_latitude double precision,
  check_in_longitude double precision,
  check_in_location_accuracy_m double precision,
  status text not null default 'present' check (status in ('present','late','half_day','absent','leave','pending','week_off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salesman_id, attendance_date)
);
create table if not exists public.manager_attendance_records (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references auth.users(id) on delete cascade,
  attendance_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  latitude double precision,
  longitude double precision,
  status text not null default 'present' check (status in ('present','late','half_day','absent','leave','pending','week_off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manager_user_id, attendance_date)
);

-- Required for dashboard reads; existing policies are retained if already installed.
alter table public.attendance_records enable row level security;
alter table public.manager_attendance_records enable row level security;
grant select, insert, update on public.attendance_records to authenticated;
grant select, insert, update on public.manager_attendance_records to authenticated;

DO $$
DECLARE
  v_salesman_id text;
  v_manager_id uuid;
  d date;
BEGIN
  -- Resolve Arsalan by name. If multiple profiles match, stop instead of importing to the wrong person.
  SELECT id INTO v_salesman_id
  FROM public.salesmen
  WHERE active IS TRUE AND deleted_at IS NULL AND name ILIKE '%Arsalan%'
  ORDER BY name
  LIMIT 1;
  IF v_salesman_id IS NULL THEN
    RAISE EXCEPTION 'Could not find an active salesman whose name contains Arsalan. Check public.salesmen and edit this migration with the exact ID.';
  END IF;
  IF (SELECT count(*) FROM public.salesmen WHERE active IS TRUE AND deleted_at IS NULL AND name ILIKE '%Arsalan%') > 1 THEN
    RAISE EXCEPTION 'More than one active salesman matches Arsalan. Edit this migration to use the exact salesman ID.';
  END IF;

  DELETE FROM public.attendance_records WHERE salesman_id=v_salesman_id AND attendance_date < date '2026-10-01' AND attendance_date >= date '2026-09-24';
  FOR d IN SELECT generate_series(date '2026-10-01', date '2026-10-17', interval '1 day')::date LOOP
    INSERT INTO public.attendance_records (salesman_id, attendance_date, status, updated_at)
    VALUES (v_salesman_id, d, CASE WHEN extract(isodow from d)=7 THEN 'week_off' WHEN d IN (date '2026-10-05', date '2026-10-06') THEN 'absent' ELSE 'present' END, now())
    ON CONFLICT (salesman_id, attendance_date) DO UPDATE SET status=excluded.status, updated_at=now();
  END LOOP;

  -- Resolve Babar Ali Khan's manager login by profile name + manager role.
  SELECT p.id INTO v_manager_id
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.id
  WHERE r.role = 'manager' AND p.display_name ILIKE 'Babar Ali Khan'
  ORDER BY p.created_at
  LIMIT 1;
  IF v_manager_id IS NULL THEN
    RAISE EXCEPTION 'Could not find a manager login with profile display_name Babar Ali Khan. Check public.profiles and public.user_roles.';
  END IF;
  IF (SELECT count(*) FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE r.role='manager' AND p.display_name ILIKE 'Babar Ali Khan') > 1 THEN
    RAISE EXCEPTION 'More than one manager login matches Babar Ali Khan. Edit this migration to use the exact user ID.';
  END IF;

  FOR d IN SELECT generate_series(date '2026-10-10', date '2026-10-22', interval '1 day')::date LOOP
    INSERT INTO public.manager_attendance_records (manager_user_id, attendance_date, status, updated_at)
    VALUES (v_manager_id, d, CASE WHEN extract(isodow from d)=7 THEN 'week_off' ELSE 'present' END, now())
    ON CONFLICT (manager_user_id, attendance_date) DO NOTHING;
  END LOOP;
END $$;

-- Verification: check imported rows and attendance totals. Salary snapshots count present/late=1,
-- half_day=0.5 and absent/leave/pending=0. Re-run after reviewing these results.
SELECT s.name, a.attendance_date, a.status
FROM public.attendance_records a JOIN public.salesmen s ON s.id=a.salesman_id
WHERE s.name ILIKE '%Arsalan%' AND a.attendance_date BETWEEN date '2026-10-01' AND date '2026-10-17'
ORDER BY a.attendance_date;
SELECT p.display_name, a.attendance_date, a.status
FROM public.manager_attendance_records a JOIN public.profiles p ON p.id=a.manager_user_id
WHERE p.display_name ILIKE 'Babar Ali Khan' AND a.attendance_date BETWEEN date '2026-10-10' AND date '2026-10-22'
ORDER BY a.attendance_date;
