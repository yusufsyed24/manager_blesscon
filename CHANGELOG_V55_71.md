# BCBM v55.71 — Advance slip amount and Admin salary history

- Advance slips no longer display the released advance as Basic Salary. Basic Salary is marked not applicable on an advance-only slip; the actual released amount is populated in the Advance Amount field, with date, recovered-to-date and remaining balance.
- Fixed Admin salesman-profile advance history to select the advance `id`, so the View / print action receives a real record ID.
- Added posted advance-slip history to Admin manager profiles.
- Improved the Admin manager salary-slip section's error and empty states so missing records and SELECT-policy failures are distinguishable.
- No database migration included. Existing old salary payments are not automatically reconstructed into saved salary-slip records; a released salary slip must exist in `employee_salary_slips`.
- Static validation: `node --check js/app.js` and ZIP integrity check. Live Supabase permissions and browser print rendering are not tested here.
