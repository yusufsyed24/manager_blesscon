# BCBM v55.69 — Salary Slip Templates and Central Cashbook Accounts

- Salary slip renderer now follows the uploaded Blesscon Candy salary slip structure for fixed salary/manager, with employee/payment metadata, earnings, deductions, advance details and net payable.
- Commission-basis slips use a separate commission layout with product/carton/commission detail rows and explicitly mark monthly carton target as not applicable.
- Released advances use an advance-specific statement layout with amount, recovery, outstanding balance, reason and payment details.
- Admin salesman profile salary advance history selects the advance ID required by the View advance slip action.
- Admin cashbook “Verify actual closing balances” excludes accounts tied to individual salesmen; non-management users still see only their own eligible account.
- No new cash/bank account is created by these changes and no database migration is included.

Validation: Node syntax check and ZIP integrity only. Live Supabase RLS, live payout flow, actual template print layout and account records have not been tested.
