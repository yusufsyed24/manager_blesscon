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
