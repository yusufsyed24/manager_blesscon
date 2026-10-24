# BCBM v55.68 — Agent Salary Basis Connections

- Create Login: selecting Commission basis hides/disables monthly carton target input; commission rate fields remain available.
- Commission-basis salesman creation no longer requires a monthly carton target. A default operational target is retained in the salesman record for compatibility with unrelated reporting.
- Edit Salary: commission basis skips monthly target validation and preserves the stored operational target when its input is hidden.
- Employee self-service commission display reads the saved salary basis and product rates for the linked login user ID.
- Salary basis and rates are persisted to salesman_compensation_settings and salesman_product_commissions.
- No SQL migration included.

Validation: syntax/archive checks only. Live Supabase RLS, payroll database functions, payout posting and browser workflows are not verified.
