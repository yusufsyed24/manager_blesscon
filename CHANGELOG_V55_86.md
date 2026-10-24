# BCBM v55.86 — Admin payroll attendance-days fix (Week Off)

**Problem:** Arsalan Khan's profile (and the employee salary estimate from the database) showed 17 paid days, but Admin → Salary calculations showed 15.0 days, which lowered his salary.

**Cause:** The Admin payroll calculation in `js/app.js` (`payrollCalculationFor`) credited only Present, Late and Half-day. It did not credit **Week Off**, which the database rules (and the on-screen note "Week Off is a paid day") count as a full paid day.

**Fix:** `week_off` now counts as 1 paid day in the Admin payroll calculation, matching the database. This also corrects the "View calculation" window and the "Review & release" salary amount, because they use the same function. Still one credit per calendar date.

**Also:** service-worker cache name and app version bumped so devices load the new code.

No database migration is required for this fix.
