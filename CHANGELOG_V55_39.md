# v55.39 — Attendance-based salary visibility

- Salesman profile salary breakdown now explicitly shows attendance credited, configured working days, attendance percentage, attendance-adjusted base salary and allowance, target, cartons above target, incentive rate and amount, total advances, recovered advances, outstanding advances, and estimated net after outstanding advances.
- Manager profile salary breakdown shows the same attendance and target calculation fields, using the manager salary snapshot.
- Updated incentive explanation: incentive is only for confirmed cartons above target. Present/late = 1 day, half-day = 0.5 day, absent/leave/pending = 0.
- No database rows or product/stock logic changed.
- Validation: `node --check` passed for `web/js/app.js` and synced JS copies. `scripts/check.mjs` could not run because package dependency `typescript` is not installed in this build environment. Supabase migration and live profile behavior have not been tested against the deployed database.
