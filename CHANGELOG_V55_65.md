# BCBM v55.65 — Conditional salary configuration

- Admin Edit Salary now groups fixed-salary fields (base salary, monthly allowance, incentive rate, working days) in a dedicated section.
- Selecting Fixed salary shows and requires those fixed-salary fields; commission rate fields are hidden and disabled.
- Selecting Commission basis hides and disables fixed-salary fields and shows/requires product-wise commission-per-carton rates.
- Existing saved salary basis and commission rates continue to load from the compensation tables.
- Preserves the v55.62 month-wise salary and advance-slip features.

Validation performed: JavaScript syntax and ZIP integrity. Live Supabase and browser workflow are not verified here.
