-- v55.44: Automatic Sunday Week Off for all salesmen and managers.
-- Run in Supabase SQL Editor as database owner after backing up the database.
-- Existing punched/recorded Sundays are preserved. Only missing Sunday records are added.

DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname, conrelid::regclass AS tbl FROM pg_constraint
           WHERE contype='c' AND conrelid IN ('public.attendance_records'::regclass,'public.manager_attendance_records'::regclass)
             AND pg_get_constraintdef(oid) ILIKE '%status%' LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;
ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_status_check
  CHECK (status IN ('present','late','half_day','absent','leave','pending','week_off'));
ALTER TABLE public.manager_attendance_records ADD CONSTRAINT manager_attendance_records_status_check
  CHECK (status IN ('present','late','half_day','absent','leave','pending','week_off'));

CREATE OR REPLACE FUNCTION public.mark_sunday_weekoffs(p_from date DEFAULT current_date, p_to date DEFAULT current_date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d date;
BEGIN
  IF p_to < p_from OR p_to - p_from > 400 THEN RAISE EXCEPTION 'Date range must be 0–400 days'; END IF;
  FOR d IN SELECT x::date FROM generate_series(p_from,p_to,interval '1 day') x WHERE extract(isodow FROM x)=7 LOOP
    INSERT INTO public.attendance_records(salesman_id,attendance_date,status,updated_at)
      SELECT s.id,d,'week_off',now() FROM public.salesmen s
      WHERE s.active IS TRUE AND s.deleted_at IS NULL
      ON CONFLICT(salesman_id,attendance_date) DO NOTHING;
    INSERT INTO public.manager_attendance_records(manager_user_id,attendance_date,status,updated_at)
      SELECT p.id,d,'week_off',now() FROM public.profiles p
      JOIN public.user_roles r ON r.user_id=p.id AND r.role='manager'
      ON CONFLICT(manager_user_id,attendance_date) DO NOTHING;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.mark_sunday_weekoffs(date,date) FROM PUBLIC, anon, authenticated;

-- Backfill Sundays from the start of the current month through today for every user.
SELECT public.mark_sunday_weekoffs(date_trunc('month',current_date)::date,current_date);

-- Optional unattended automation: schedule hourly when pg_cron is installed and available.
-- Function only inserts today's missing rows if today is Sunday; existing punches/statuses remain unchanged.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname='blesscon-sunday-weekoff-daily';
    PERFORM cron.schedule('blesscon-sunday-weekoff-daily','0 * * * *',
      'select public.mark_sunday_weekoffs(current_date,current_date)');
  ELSE
    RAISE NOTICE 'pg_cron is not installed; run SELECT public.mark_sunday_weekoffs(date_trunc(''month'',current_date)::date,current_date); periodically, or enable pg_cron for automatic daily marking.';
  END IF;
EXCEPTION WHEN undefined_table OR undefined_function OR insufficient_privilege THEN
  RAISE NOTICE 'Could not configure pg_cron automatically. Sunday marking function and backfill are installed; schedule it in Supabase Cron if available.';
END $$;

-- Verification
SELECT 'salesman' AS employee_type, s.name AS employee, a.attendance_date, a.status
FROM public.attendance_records a JOIN public.salesmen s ON s.id=a.salesman_id
WHERE extract(isodow FROM a.attendance_date)=7 AND a.attendance_date >= date_trunc('month',current_date)::date
UNION ALL
SELECT 'manager', p.display_name, a.attendance_date, a.status
FROM public.manager_attendance_records a JOIN public.profiles p ON p.id=a.manager_user_id
WHERE extract(isodow FROM a.attendance_date)=7 AND a.attendance_date >= date_trunc('month',current_date)::date
ORDER BY attendance_date, employee;
