# BCBM v55.66 — Stable salary basis selector position

- Moved the Admin Edit Salary payment-method selector above both conditional salary panels.
- Fixed salary fields and commission fields now appear below the selector; changing salary basis no longer moves the selector up/down the form.
- Preserves v55.65 conditional required/disabled behavior and previous salary slip features.

Validation: `node --check js/app.js` and ZIP integrity check. Live Supabase/browser testing not performed.
