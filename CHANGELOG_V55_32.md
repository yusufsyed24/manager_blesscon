# v55.32 — Expense scope, loss chart color, salary and advance visibility

- Managers can add daily expenses, but the Expenses page now filters to entries created by the signed-in manager; Admin retains the all-expenses view.
- The database migration tightens manager expense SELECT scope and adds read-only self-visibility for the manager's own salary payment and the employee's own salary advance history.
- Expense category chart renders categories whose label contains “Loss” in red.
- Manager profile displays salary payment history and advance taken/recovered/outstanding details.
- Salesman profile and salary breakdown display salary advance records and outstanding balances; Admin's salesman profile includes salary payment and advance history.
- Admin Users & Access manager rows show latest net salary payment, salary-period description (including gross/deduction notes when stored), and the advance balance when available in the loaded state. Admin can also review the full advance history from Release advance salary.
- Added `supabase/expense_salary_visibility_v55_32.sql`. Run this migration in Supabase after the existing v55.28 salary and manager-expense migrations. The live database is not changed by this build.
