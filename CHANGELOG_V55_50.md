# v55.50 — Salesman commission basis

- Added salary basis selection to Admin's Create Login form: Fixed salary or Commission basis.
- Commission basis reveals per-active-product commission-per-carton fields.
- Commission settings and product rates are saved to dedicated Supabase tables.
- Commission-basis salesmen see a monthly product-by-product commission earning breakdown on their profile overview.
- Fixed-salary salesmen continue using the existing salary snapshot and calculation.
- Added `supabase/salesman_commission_basis_v55_50.sql` for schema and row-level security policies.

Validation: JavaScript syntax and ZIP integrity checks only. Test against a backup/staging Supabase project before production use.
