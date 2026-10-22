-- Blesscon Candy v55.27: editable salary advances and salary recovery.
-- Run after employee_salary_advances_v55_26.sql. Products/pricing are not touched.

BEGIN;

ALTER TABLE public.employee_salary_advances
  ADD COLUMN IF NOT EXISTS recovered_paisa bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_deducted_salary_period text,
  ADD COLUMN IF NOT EXISTS edit_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.employee_salary_advances'::regclass
      AND conname = 'employee_salary_advances_recovered_range_check'
  ) THEN
    ALTER TABLE public.employee_salary_advances
      ADD CONSTRAINT employee_salary_advances_recovered_range_check
      CHECK (recovered_paisa >= 0 AND recovered_paisa <= amount_paisa);
  END IF;
END
$constraints$;

DROP POLICY IF EXISTS employee_salary_advances_admin_update ON public.employee_salary_advances;
CREATE POLICY employee_salary_advances_admin_update
  ON public.employee_salary_advances FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
GRANT UPDATE ON public.employee_salary_advances TO authenticated;

CREATE OR REPLACE FUNCTION private.guard_and_audit_salary_advance_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  amount_or_reason_changed boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only Admin can update salary advance records';
  END IF;

  IF NEW.employee_type IS DISTINCT FROM OLD.employee_type
     OR NEW.employee_name IS DISTINCT FROM OLD.employee_name
     OR NEW.salesman_id IS DISTINCT FROM OLD.salesman_id
     OR NEW.manager_user_id IS DISTINCT FROM OLD.manager_user_id
     OR NEW.advance_date IS DISTINCT FROM OLD.advance_date
     OR NEW.account_key IS DISTINCT FROM OLD.account_key
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Employee, date, account and original transaction fields cannot be edited here';
  END IF;

  amount_or_reason_changed :=
    NEW.amount_paisa IS DISTINCT FROM OLD.amount_paisa
    OR NEW.reason IS DISTINCT FROM OLD.reason;

  IF NEW.recovered_paisa < OLD.recovered_paisa THEN
    RAISE EXCEPTION 'Salary recovery cannot be reduced by editing an advance; use an audited payroll correction';
  END IF;
  IF NEW.recovered_paisa > NEW.amount_paisa THEN
    RAISE EXCEPTION 'Edited advance amount cannot be lower than the amount already recovered through salary';
  END IF;

  IF amount_or_reason_changed THEN
    NEW.edit_revision := OLD.edit_revision + 1;
    NEW.updated_by := auth.uid();
    NEW.updated_at := now();
  ELSIF NEW.recovered_paisa IS DISTINCT FROM OLD.recovered_paisa
     OR NEW.last_deducted_salary_period IS DISTINCT FROM OLD.last_deducted_salary_period THEN
    NEW.updated_by := auth.uid();
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.post_salary_advance_edit_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  delta_paisa bigint;
BEGIN
  delta_paisa := NEW.amount_paisa - OLD.amount_paisa;
  IF delta_paisa <> 0 THEN
    INSERT INTO public.cashbook_entries (
      posting_key, transaction_id, business_date, account_key, amount_paisa,
      entry_type, source_table, source_id, reference, description,
      salesman_id, created_by
    ) VALUES (
      'salary-advance-edit:' || NEW.id::text || ':' || NEW.edit_revision::text,
      'SALADV-EDIT-' || NEW.id::text || '-' || NEW.edit_revision::text,
      current_date,
      NEW.account_key,
      -delta_paisa,
      'adjustment',
      'employee_salary_advances',
      NEW.id::text,
      COALESCE(NEW.reference, ''),
      'Advance salary amount edited for ' || NEW.employee_name || ': ' ||
        to_char(OLD.amount_paisa / 100.0, 'FM999999999990.00') || ' -> ' ||
        to_char(NEW.amount_paisa / 100.0, 'FM999999999990.00') ||
        '; reason: ' || NEW.reason,
      NEW.salesman_id,
      auth.uid()
    );
  END IF;

  INSERT INTO public.audit_log (
    table_name, record_id, action, actor_id, before_data, after_data
  ) VALUES (
    'employee_salary_advances', NEW.id::text, 'UPDATE', auth.uid(),
    jsonb_build_object(
      'amount_paisa', OLD.amount_paisa,
      'recovered_paisa', OLD.recovered_paisa,
      'reason', OLD.reason,
      'last_deducted_salary_period', OLD.last_deducted_salary_period
    ),
    jsonb_build_object(
      'amount_paisa', NEW.amount_paisa,
      'recovered_paisa', NEW.recovered_paisa,
      'reason', NEW.reason,
      'last_deducted_salary_period', NEW.last_deducted_salary_period
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS employee_salary_advance_update_guard ON public.employee_salary_advances;
CREATE TRIGGER employee_salary_advance_update_guard
  BEFORE UPDATE ON public.employee_salary_advances
  FOR EACH ROW EXECUTE FUNCTION private.guard_and_audit_salary_advance_update();

DROP TRIGGER IF EXISTS employee_salary_advance_update_posting ON public.employee_salary_advances;
CREATE TRIGGER employee_salary_advance_update_posting
  AFTER UPDATE ON public.employee_salary_advances
  FOR EACH ROW EXECUTE FUNCTION private.post_salary_advance_edit_adjustment();

COMMIT;
NOTIFY pgrst, 'reload schema';

-- Verification: outstanding_paisa should equal amount_paisa minus recovered_paisa.
SELECT id, employee_name, amount_paisa, recovered_paisa,
       amount_paisa - recovered_paisa AS outstanding_paisa,
       last_deducted_salary_period, edit_revision, status
FROM public.employee_salary_advances
ORDER BY advance_date DESC
LIMIT 50;
