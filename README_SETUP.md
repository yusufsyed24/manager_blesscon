
## Manager daily closing fix (v39)
Run `supabase/manager_closing_fix_v39.sql` once in the Supabase SQL editor (after `manager_role.sql` and `closing_balances.sql`), then redeploy `web/`. Managers can then submit the daily closing for any active salesman; approval stays Admin-only.

## v40: Manager team closing, manager expenses, Admin approval
Follow `DEPLOY_V40_MANAGER_CLOSING.md`: run `supabase/manager_closing_expenses_v40.sql` once in the Supabase SQL editor (after `manager_closing_fix_v39.sql`), deploy the whole folder (Netlify publishes the repository root), then run the acceptance table in that guide.


## v42 migration compatibility note
The v40 migration now recognizes an existing `private.save_master` implementation that already grants manager expense access. It no longer aborts solely because the manager permission condition was patched previously. Run `supabase/manager_closing_expenses_v40.sql` once in Supabase SQL Editor; do not run the standalone v41 wrapper first. This package has not been applied to or verified against the live Supabase project.

## v54 revamp build

See `CHANGELOG.md`, `DEPLOY_V54.md`, `ROLE_MATRIX_V54.md`, and `TEST_REPORT_V54.md`. This release preserves existing product pricing and stock update source workflows and does not reset existing business data. Apply `supabase/revamp_v54.sql` only after a backup and a staging schema review. Full live Supabase/RLS validation is still required before production use.


## v55 Cash & Bank Book update

After the base schema and `supabase/cash_bank_book.sql` are installed, run `supabase/cashbook_banking_update_v55.sql` in the Supabase SQL Editor. This is additive and preserves existing account IDs and ledger history. It adds the Admin-only idempotent Add Money RPC and reconciles the six requested account definitions when genuinely missing. Then deploy the updated static files from `web/` and test in staging first. Do not rerun any reset SQL.

### Bank destination safety (v55.1)

Payment and expense forms distinguish **MCB Bank** from **Al Habib Bank** (including cheque destinations). Always select the matching destination account. The additive SQL migration validates method/account consistency at database level and rejects missing or mismatched account selections; it does not rewrite historical entries. Apply `supabase/cashbook_banking_update_v55.sql` after the base `supabase/cash_bank_book.sql` migration and test in staging.
