# v55.45 — Paid Week Off Salary Credit

- Sunday `week_off` is now credited as one full paid attendance day in both salesman and manager salary snapshots.
- Week Off is not counted as absent and does not reduce attendance-prorated base salary or allowance.
- Half-day remains 0.5; absent, leave, and pending remain 0.
- Carton incentive still applies only to confirmed eligible cartons; Week Off does not create sales.
- Apply `supabase/paid_weekoff_salary_v55_45.sql` in Supabase SQL Editor after the Week Off and payroll schema migrations.
- The migration updates the two salary snapshot functions only; it does not change already-posted salary payments. Recalculate/review existing posted payroll separately before changing any posted amount.
