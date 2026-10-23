-- Blesscon Candy Business Manager v55.43
-- Fix employee date of birth not persisting through private.save_master().
-- Safe to rerun; does not modify existing employee attendance or payroll records.

ALTER TABLE public.salesmen
  ADD COLUMN IF NOT EXISTS date_of_birth date;

DO $fix$
DECLARE
  fn_oid oid := to_regprocedure('private.save_master(text,jsonb,integer)');
  fn_def text;
  patched text;
  old_clause text;
  new_clause text;
BEGIN
  IF fn_oid IS NULL THEN
    RAISE EXCEPTION 'Could not find private.save_master(text,jsonb,integer). Install the main Blesscon schema first.';
  END IF;

  fn_def := pg_get_functiondef(fn_oid);
  new_clause := $new$when 'salesmen' then allowed:=array['id','name','phone','user_id','manager_user_id','joining_date','date_of_birth','base_salary_paisa','payroll_allowance_paisa','payroll_incentive_per_carton_paisa','payroll_working_days','payroll_monthly_target','monthly_target','active','off_days'];$new$;

  -- Handle the common previous allow-lists from earlier migration versions.
  old_clause := $old$when 'salesmen' then allowed:=array['id','name','phone','user_id','manager_user_id','joining_date','base_salary_paisa','monthly_target','active','off_days'];$old$;
  patched := replace(fn_def, old_clause, new_clause);
  IF patched = fn_def THEN
    old_clause := $old$when 'salesmen' then allowed:=array['id','name','phone','user_id','joining_date','base_salary_paisa','monthly_target','active','off_days'];$old$;
    patched := replace(fn_def, old_clause, new_clause);
  END IF;
  IF patched = fn_def THEN
    old_clause := $old$when 'salesmen' then allowed:=array['id','name','phone','date_of_birth','joining_date','monthly_target','active','off_days','manager_user_id'];$old$;
    patched := replace(fn_def, old_clause, new_clause);
  END IF;
  IF patched = fn_def THEN
    IF position('date_of_birth' in fn_def) > 0
       AND position('payroll_allowance_paisa' in fn_def) > 0
       AND position('payroll_incentive_per_carton_paisa' in fn_def) > 0 THEN
      RAISE NOTICE 'Employee date-of-birth and payroll fields are already allowed by private.save_master().';
      RETURN;
    END IF;
    RAISE EXCEPTION 'Could not safely patch private.save_master(): expected salesmen allow-list was not found. No function change was applied.';
  END IF;

  EXECUTE patched;
  RAISE NOTICE 'Updated private.save_master() to persist date_of_birth and current individual payroll settings.';
END
$fix$;

NOTIFY pgrst, 'reload schema';

-- Verify the column exists after the migration.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'salesmen'
  AND column_name = 'date_of_birth';
