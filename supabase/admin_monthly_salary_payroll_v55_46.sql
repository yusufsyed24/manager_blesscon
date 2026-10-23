-- Blesscon Candy Business Manager v55.46
-- Admin monthly salary review/release support.
-- Additive migration: preserves all existing business data.
-- Apply after the existing v55.28 salary-release/advance migrations and v55.38 payroll migration.
-- Run in Supabase SQL Editor. Back up the database first.

BEGIN;

-- The application records a released salary as an expense row with salary_period = YYYY-MM.
-- Keep these columns available for both manager and salesman salary records.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS salary_period text,
  ADD COLUMN IF NOT EXISTS salesman_id text,
  ADD COLUMN IF NOT EXISTS manager_user_id uuid REFERENCES auth.users(id);

-- Ensure only one active salary release exists for each employee and month.
-- If the preflight finds duplicate existing rows, it stops with a clear message rather than
-- deleting or modifying records. Resolve duplicates manually, then rerun this migration.
DO $payroll_preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.expenses
    WHERE salary_period IS NOT NULL AND deleted_at IS NULL
      AND salesman_id IS NOT NULL
      AND (lower(coalesce(category,'')) LIKE '%salary%' OR lower(coalesce(description,'')) LIKE '%salary%')
    GROUP BY salesman_id, salary_period HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate active salesman salary releases exist for the same month. Review public.expenses by salesman_id and salary_period, resolve duplicates, then rerun v55.46 migration.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.expenses
    WHERE salary_period IS NOT NULL AND deleted_at IS NULL
      AND manager_user_id IS NOT NULL
    GROUP BY manager_user_id, salary_period HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate active manager salary releases exist for the same month. Review public.expenses by manager_user_id and salary_period, resolve duplicates, then rerun v55.46 migration.';
  END IF;
END
$payroll_preflight$;

-- Unique release keys: prevent accidental double salary release for the same month.
CREATE UNIQUE INDEX IF NOT EXISTS expenses_salesman_salary_period_unique
  ON public.expenses (salesman_id, salary_period)
  WHERE salesman_id IS NOT NULL
    AND salary_period IS NOT NULL
    AND deleted_at IS NULL
    AND (lower(coalesce(category,'')) LIKE '%salary%' OR lower(coalesce(description,'')) LIKE '%salary%');

CREATE UNIQUE INDEX IF NOT EXISTS expenses_manager_salary_period_unique
  ON public.expenses (manager_user_id, salary_period)
  WHERE manager_user_id IS NOT NULL
    AND salary_period IS NOT NULL
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS expenses_salary_period_lookup_idx
  ON public.expenses (salary_period)
  WHERE salary_period IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.expenses_salesman_salary_period_unique IS
  'Prevents duplicate active salesman salary releases for the same salary month.';
COMMENT ON INDEX public.expenses_manager_salary_period_unique IS
  'Prevents duplicate active manager salary releases for the same salary month.';

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verification queries (run after successful migration):
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'expenses'
  AND indexname IN (
    'expenses_salesman_salary_period_unique',
    'expenses_manager_salary_period_unique',
    'expenses_salary_period_lookup_idx'
  )
ORDER BY indexname;
