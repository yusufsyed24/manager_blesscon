-- Combined setup: safe to run when v55.26 is not yet installed; applies v55.26 table/insert posting and v55.27 edit/recovery additions.

-- Blesscon Candy v55.26: Admin-issued salary advances for salesmen and managers.
-- Additive migration. Does not change product/pricing or existing salary records.

BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_salary_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_type text NOT NULL CHECK (employee_type IN ('salesman','manager')),
  employee_name text NOT NULL CHECK (length(trim(employee_name)) > 0),
  salesman_id text REFERENCES public.salesmen(id),
  manager_user_id uuid REFERENCES auth.users(id),
  advance_date date NOT NULL DEFAULT current_date,
  amount_paisa bigint NOT NULL CHECK (amount_paisa > 0),
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  account_key text NOT NULL REFERENCES public.cashbook_accounts(account_key),
  reference text,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_salary_advances_exactly_one_employee CHECK (
    (employee_type = 'salesman' AND salesman_id IS NOT NULL AND manager_user_id IS NULL)
    OR (employee_type = 'manager' AND manager_user_id IS NOT NULL AND salesman_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS employee_salary_advances_date_idx
  ON public.employee_salary_advances (advance_date DESC);
CREATE INDEX IF NOT EXISTS employee_salary_advances_salesman_idx
  ON public.employee_salary_advances (salesman_id, advance_date DESC)
  WHERE salesman_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS employee_salary_advances_manager_idx
  ON public.employee_salary_advances (manager_user_id, advance_date DESC)
  WHERE manager_user_id IS NOT NULL;

ALTER TABLE public.employee_salary_advances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_salary_advances_admin_select ON public.employee_salary_advances;
CREATE POLICY employee_salary_advances_admin_select
  ON public.employee_salary_advances FOR SELECT TO authenticated
  USING (public.is_admin());
DROP POLICY IF EXISTS employee_salary_advances_admin_insert ON public.employee_salary_advances;
CREATE POLICY employee_salary_advances_admin_insert
  ON public.employee_salary_advances FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND created_by = auth.uid());
REVOKE ALL ON public.employee_salary_advances FROM anon, public;
GRANT SELECT, INSERT ON public.employee_salary_advances TO authenticated;

CREATE OR REPLACE FUNCTION private.post_employee_salary_advance_to_cashbook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  acct public.cashbook_accounts;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() OR NEW.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only Admin can issue salary advances';
  END IF;

  SELECT * INTO acct
  FROM public.cashbook_accounts
  WHERE account_key = NEW.account_key AND active = true
    AND account_type IN ('cash','bank','wallet','salesman')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active payment account; Market Credit/receivables cannot fund a salary advance';
  END IF;

  INSERT INTO public.cashbook_entries (
    posting_key, transaction_id, business_date, account_key, amount_paisa,
    entry_type, source_table, source_id, reference, description,
    salesman_id, created_by
  ) VALUES (
    'salary-advance:' || NEW.id::text,
    'SALADV-' || NEW.id::text,
    NEW.advance_date,
    NEW.account_key,
    -NEW.amount_paisa,
    'expense',
    'employee_salary_advances',
    NEW.id::text,
    COALESCE(NEW.reference, ''),
    'Salary advance to ' || NEW.employee_name || ': ' || NEW.reason,
    NEW.salesman_id,
    NEW.created_by
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS employee_salary_advance_cashbook_post ON public.employee_salary_advances;
CREATE TRIGGER employee_salary_advance_cashbook_post
  AFTER INSERT ON public.employee_salary_advances
  FOR EACH ROW EXECUTE FUNCTION private.post_employee_salary_advance_to_cashbook();

COMMIT;
NOTIFY pgrst, 'reload schema';

-- Verification
SELECT id, employee_type, employee_name, advance_date,
       amount_paisa, reason, account_key, status, created_at
FROM public.employee_salary_advances
ORDER BY created_at DESC
LIMIT 20;


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


-- Blesscon Candy v55.28: manager salary release with the same advance-deduction rules as salesman payroll.
-- Additive migration. Back up the database before applying. Does not alter products or pricing.
BEGIN;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES auth.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS expenses_manager_salary_period_unique
  ON public.expenses (manager_user_id, salary_period)
  WHERE manager_user_id IS NOT NULL AND salary_period IS NOT NULL AND deleted_at IS NULL;

-- Extend the existing save_master allowlist without replacing its other security checks.
DO $migration$
DECLARE
  function_source text;
  old_fragment text := '''salary_period''];';
  new_fragment text := '''salary_period'',''manager_user_id''];';
BEGIN
  function_source := pg_get_functiondef('private.save_master(text,jsonb,integer)'::regprocedure);
  IF position(old_fragment in function_source) = 0 THEN
    IF position('''manager_user_id'']' in function_source) > 0 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Could not safely extend private.save_master expenses allowlist. Inspect its definition and apply this migration manually.';
  END IF;
  function_source := replace(function_source, old_fragment, new_fragment);
  EXECUTE function_source;
END
$migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verification: should show manager_user_id and the manager payroll uniqueness index.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'expenses'
  AND column_name = 'manager_user_id';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'expenses'
  AND indexname = 'expenses_manager_salary_period_unique';
