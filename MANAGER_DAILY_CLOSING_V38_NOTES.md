# Blesscon Candy Manager v38 — Manager Daily Closing Integration Notes

This package is based on the latest available v37 Manager Daily Closing Fix build.

## Included in the base build
- Manager role and access changes from v31–v37.
- Manager profile/fieldwork and team attendance support.
- Manager product/stock access and cash/bank book changes.
- Existing daily-closing cash and stock validation, duplicate protection, variance-reason requirement, and Admin-only approve/reject/reopen controls.
- Existing offline/local operation queue and application assets.

## Important deployment finding
The current database schema declares `daily_closings.salesman_id` as NOT NULL and has `UNIQUE (salesman_id, business_date)`. The current `closing.submit` operation also derives expected cash and stock from a selected salesman's orders, payments, expenses, and stock movements. The manager authorization branch only permits a manager to submit for an active salesman whose `salesmen.manager_user_id = auth.uid()`.

Therefore, changing only the UI or simply making `salesman_id` nullable would not safely enable a manager's personal closing. A manager-owned closing needs an explicit owner identity, separate uniqueness, visibility/RLS rules, and a defined cash/stock ledger. This package intentionally does not weaken the existing checks or introduce a dummy salesman.

## Before enabling manager-personal closing
1. Confirm the accounting scope for the manager's own cash and stock.
2. Apply a reviewed migration that adds `owner_user_id`, preserves existing salesman rows, and enforces exactly one closing owner.
3. Update `apply_operational_command`, `business_snapshot`, RLS policies, `assert_day_open`, and the UI together.
4. Run the SQL regression suite against a staging Supabase project and verify both assigned-salesman and manager-owned cases before production.

## Validation status
The included application checks are run when the build is packaged. These checks do not prove live Supabase deployment or live database behavior; production integration must be verified separately.
