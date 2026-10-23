-- v55.32: Manager expense isolation and employee salary/advance visibility.
-- Run in Supabase SQL Editor after the existing v55.28 salary and manager expense migrations.
-- This migration preserves existing transactions and does not alter product, stock, or pricing data.

-- Managers may see only the daily expenses they created. Admin expense access remains governed
-- by the existing Admin/permission policies. Salary payments are visible only in salary/profile
-- views for the linked employee, not in the manager's general Expenses ledger.
CREATE OR REPLACE FUNCTION public.manager_expense_visible(p_created_by uuid, p_salesman_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.is_manager() AND p_created_by = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.manager_expense_visible(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.manager_expense_visible(uuid,text) TO authenticated;

DROP POLICY IF EXISTS expense_manager_read ON public.expenses;
CREATE POLICY expense_manager_read ON public.expenses FOR SELECT TO authenticated
USING (public.manager_expense_visible(created_by, salesman_id));

-- A manager can read their own salary expense in their profile/pay history only.
DROP POLICY IF EXISTS manager_own_salary_expense_read ON public.expenses;
CREATE POLICY manager_own_salary_expense_read ON public.expenses FOR SELECT TO authenticated
USING (
  public.is_manager()
  AND manager_user_id = auth.uid()
  AND salary_period IS NOT NULL
  AND deleted_at IS NULL
);

-- Employee advance details are visible to Admin and to the employee concerned.
-- These policies are SELECT-only; only Admin can issue/edit advances through the existing workflow.
DROP POLICY IF EXISTS employee_salary_advances_read_self ON public.employee_salary_advances;
CREATE POLICY employee_salary_advances_read_self
ON public.employee_salary_advances FOR SELECT TO authenticated
USING (
  (employee_type = 'manager' AND manager_user_id = auth.uid())
  OR
  (employee_type = 'salesman' AND EXISTS (
    SELECT 1 FROM public.salesmen s
    WHERE s.id = employee_salary_advances.salesman_id
      AND s.user_id = auth.uid()
  ))
);

GRANT SELECT ON public.employee_salary_advances TO authenticated;

COMMENT ON POLICY expense_manager_read ON public.expenses IS
  'Managers can read only daily expenses they created; Admin visibility is controlled separately.';
COMMENT ON POLICY manager_own_salary_expense_read ON public.expenses IS
  'A manager may read their own posted salary expense for profile/pay-history display.';
COMMENT ON POLICY employee_salary_advances_read_self ON public.employee_salary_advances IS
  'Employees may read their own salary advance history; write operations remain Admin-controlled.';
