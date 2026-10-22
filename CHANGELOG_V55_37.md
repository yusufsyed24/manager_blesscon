# v55.37 — Carton-based salary calculation

- Added Admin-configurable monthly allowance and per-carton incentive defaults for salesmen and managers in Settings.
- Added a manager base salary setting; existing salesman base salary remains the salesman base.
- Added SQL migration `supabase/payroll_carton_incentive_v55_37.sql` to calculate confirmed carton-equivalent sales for the current month and expose salary snapshots to the relevant employee.
- Manager's own confirmed orders are counted for their own incentive and remain excluded from the team target.
- Rates default to zero unless configured by Admin; no rates were invented.
- Existing salary releases and advances remain separate records. The salary estimate is not a payment and does not modify live data until the migration is applied and a salary is released through the existing workflow.

## Deployment
1. Back up the project and database.
2. Deploy the source files.
3. Run `supabase/payroll_carton_incentive_v55_37.sql` in Supabase SQL Editor.
4. Open Admin → Settings and configure the base salary, allowance, and incentive-per-carton rates for each role.
5. Test a salesman and manager account against confirmed orders and salary advances before production handover.

Money values are stored in integer paisa. Full automated project checks may require the project dependencies to be installed.
