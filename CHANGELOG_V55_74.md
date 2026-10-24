# BCBM v55.74 — Automatic Advance Recovery on Salary Release

- Reinforced and clarified automatic recovery of outstanding posted salary advances for both managers and salesmen at salary release.
- Advances are applied oldest-first, capped at the gross salary, and recorded against each advance; the employee receives only the net salary after the deduction.
- Salary release confirmation and manager preview explicitly identify the automatic advance deduction.
- Saved manager salary slip breakdown labels the recovery as an automatic advance recovery this month.
- Retains the prior fix removing the “Balance Remaining” column from the advance salary slip.
- Service-worker cache version bumped to v55.74 so deployed clients fetch updated assets.

## Verification
- `node --check js/app.js` passed.
- ZIP integrity check passed.
- No live Supabase, RLS, or browser-generated PDF verification was performed. Salary advance records must be readable/updatable by the Admin session for the recovery to post successfully.
