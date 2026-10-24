# v55.76 — Commission-basis salary release preview

- Fixed the Admin `Release salary` preview for commission-basis salesmen. It no longer uses the fixed-salary attendance calculation, which displayed Rs. 0 for employees without a fixed base salary.
- The preview now loads the saved salary basis and product-wise commission rates, totals confirmed personal sales for the selected month, converts boxes to cartons using each order item's packing or the configured default, and displays cartons/rate/earned commission by product.
- Outstanding advance deduction and net payment preview are based on the commission gross, matching the commission calculation already used by the salary submission handler.
- Fixed-salary employees continue to use the attendance-based calculation.

## Validation
- `node --check js/app.js` passed.
- ZIP integrity check passed.
- Live Supabase/RLS and end-to-end salary release were not tested in this environment. Before release, confirm the salesman has product commission rates configured and confirmed orders for the selected month.
