# v55.48 — Admin payroll data loading fix

- Admin refresh now loads payroll source tables directly from Supabase instead of depending only on the business_snapshot RPC projection.
- Loads salesmen, profiles, user roles, confirmed orders and order items, employee/manager attendance, manager salary settings, salary advances, and expenses independently.
- If a table read is denied or a migration/table is missing, the Admin Salary & Payroll page shows the exact data-loading error rather than silently presenting all-zero calculations.
- This is a client-side data-loading correction. It does not alter or delete business records and does not automatically release or recalculate previously posted salary payments.

## Validation
- `node --check js/store.js` passed.
- `node --check js/app.js` passed.
- Live Supabase permissions and payroll figures still require verification in the target project.
