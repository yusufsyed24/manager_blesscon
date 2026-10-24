# BCBM v55.73 — Advance slip balance removal

- Removed the **Balance Remaining** column from advance salary slip details. Advance slips now show date, amount released, and recovered so far only.
- Advance-only slips do not count the released advance as salary earnings or total earnings.
- Any genuine employee debt/deduction remains in the normal salary deductions section when recorded there; no inferred balance is calculated on an advance slip.
- Updated service-worker cache key to force clients to fetch the new static assets.

Validation: `node --check js/app.js` passed and ZIP integrity checked. Live Supabase/RLS and browser print testing were not available.
