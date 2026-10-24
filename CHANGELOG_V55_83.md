# BCBM v55.83 — Salary-basis form visibility fix

- Fixed Create user + employee profile so per-product commission controls are visible and enabled only when `Commission basis` is selected for a salesman.
- Fixed fixed-salary inputs so they are hidden, disabled, and not required when `Commission basis` is selected.
- Hardened the existing Edit Staff salary-basis toggle with explicit `hidden`, `aria-hidden`, and important display state so global panel CSS cannot leave both sections visible.
- No database migration is required for these UI changes.

Validation performed: `node --check js/app.js`; ZIP integrity check. Not verified against the live deployed site or database.
