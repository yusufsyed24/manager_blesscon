# BCBM v55.87 — Week Off rule by role (October 2026)

- **Salesmen:** Week Off counts as a paid day (unchanged; Arsalan stays at 17).
- **Managers:** for October 2026 only, Week Off is not a paid day. Present and Late = 1 day, Half day = 0.5, Week Off = 0.
- Admin payroll (`payrollCalculationFor`) now applies this by role and month. The months are listed in `MANAGER_WEEKOFF_UNPAID_MONTHS` in `js/app.js`.
- New migration `supabase/manager_weekoff_unpaid_oct2026_v55_87.sql` applies the same rule to the manager's own salary estimate in the database, so both screens agree.
