# v55.64 — Add salary-basis selection to Admin Edit Salary

- Fixed the specific missing workflow: Admin → employee Edit → Edit employee details & salary now has a Fixed salary / Commission basis selector.
- Existing saved salary basis and per-product commission rates are loaded from `salesman_compensation_settings` and `salesman_product_commissions` when editing a linked salesman.
- Selecting Commission basis reveals per-product commission-per-carton fields; saving persists the basis and rates to Supabase.
- Preserves v55.62 month-wise salary slips and released advance salary slips, and the v55.63 create-login salary-basis selector.
- Validation: `node --check js/app.js` and ZIP integrity check. Live Supabase/RLS and browser workflow not tested.
