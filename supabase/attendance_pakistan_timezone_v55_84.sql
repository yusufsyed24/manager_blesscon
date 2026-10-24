-- BCBM v55.84: Pakistan-time attendance day boundary. Back up database first.
BEGIN;
CREATE OR REPLACE FUNCTION public.mark_sunday_weekoffs(
 p_from date DEFAULT ((now() AT TIME ZONE 'Asia/Karachi')::date),
 p_to date DEFAULT ((now() AT TIME ZONE 'Asia/Karachi')::date))
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d date; pakistan_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
 start_date date := coalesce(p_from,(now() AT TIME ZONE 'Asia/Karachi')::date);
 end_date date := least(coalesce(p_to,(now() AT TIME ZONE 'Asia/Karachi')::date),pakistan_today);
BEGIN
 IF end_date < start_date OR end_date-start_date > 400 THEN RAISE EXCEPTION 'Date range must be 0–400 days and cannot extend beyond Pakistan today (%)',pakistan_today; END IF;
 FOR d IN SELECT x::date FROM generate_series(start_date,end_date,interval '1 day') x WHERE extract(isodow FROM x)=7 LOOP
  INSERT INTO public.attendance_records(salesman_id,attendance_date,status,updated_at)
   SELECT s.id,d,'week_off',now() FROM public.salesmen s WHERE s.active IS TRUE AND s.deleted_at IS NULL ON CONFLICT(salesman_id,attendance_date) DO NOTHING;
  INSERT INTO public.manager_attendance_records(manager_user_id,attendance_date,status,updated_at)
   SELECT p.id,d,'week_off',now() FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id AND r.role='manager' ON CONFLICT(manager_user_id,attendance_date) DO NOTHING;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.mark_sunday_weekoffs(date,date) FROM PUBLIC,anon,authenticated;
SELECT public.mark_sunday_weekoffs(date_trunc('month',now() AT TIME ZONE 'Asia/Karachi')::date,(now() AT TIME ZONE 'Asia/Karachi')::date);
SELECT (now() AT TIME ZONE 'Asia/Karachi')::date AS pakistan_today,current_date AS database_session_date,current_setting('TimeZone') AS database_session_timezone;
SELECT 'salesman' AS employee_type,s.name AS employee,a.attendance_date,a.status FROM public.attendance_records a JOIN public.salesmen s ON s.id=a.salesman_id WHERE a.attendance_date>=date_trunc('month',now() AT TIME ZONE 'Asia/Karachi')::date AND a.attendance_date<=(now() AT TIME ZONE 'Asia/Karachi')::date AND lower(s.name) LIKE '%babar%'
UNION ALL SELECT 'manager',p.display_name,a.attendance_date,a.status FROM public.manager_attendance_records a JOIN public.profiles p ON p.id=a.manager_user_id WHERE a.attendance_date>=date_trunc('month',now() AT TIME ZONE 'Asia/Karachi')::date AND a.attendance_date<=(now() AT TIME ZONE 'Asia/Karachi')::date AND lower(p.display_name) LIKE '%babar%' ORDER BY attendance_date,employee_type;
COMMIT;
