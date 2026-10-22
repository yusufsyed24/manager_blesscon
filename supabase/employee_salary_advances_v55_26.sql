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
