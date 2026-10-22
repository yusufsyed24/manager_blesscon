# v55.33 — Manager expense access and payroll visibility

- Added the Expenses page to the manager role's built-in navigation permissions. Managers can now open the page without needing a separate explicit permission; the existing manager-created-expense filter remains in place.
- Added `employee_salary_advances` to the synchronized store table list so Admin payroll panels can read advance history when permitted by Supabase RLS.
- No product, pricing, stock, order, or payment records are modified by this build.

## Important
- Run the existing salary-advance visibility migration(s) in Supabase if advance rows still return a permission error.
- Per-carton incentive and allowance rates have not been changed in this build because the provided schema copy does not specify the business's approved amounts or formula. Confirm those amounts before activating a payroll formula.
- Creating Arsalan's Auth login requires a valid email and a temporary password through Admin → Users & Access (or the configured admin-create-user Edge Function). A schema-only SQL export cannot create a secure Auth user by itself.
