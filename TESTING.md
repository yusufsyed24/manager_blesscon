# Testing status

## DSR, stock issue/return and daily closing

- Added `tests/reports.test.js` coverage for separate current sales, collection, prior-invoice recovery, partial balances, overdue amounts and product-wise stock movements.
- Added `tests/operations-local.test.js` for offline warehouse issue, salesman sale, saleable return and damaged return arithmetic.
- Added `tests/operations.test.js` for isolated PGlite migration, duplicate issue idempotency, 240-box issue, sale deduction, saleable return, cash closing math, discrepancy reason, admin-only approval, approved-day lock and salesman cost/salary snapshot restrictions.
- `tests/db-helper.js` now applies `supabase/operational_modules.sql` and `supabase/cash_bank_book.sql` after the base schema. `tests/cashbook.test.js` covers invoice receivable postings, payment/expense postings, account transfers, daily closing variance approval and the approved-day posting lock.
- These automated tests are authored but **not executed** in this environment. Node.js 22 is available, but the dependency install (`npm ci`) did not complete, so Vitest and PGlite were unavailable. Run `npm ci`, then `npm test` and `npm run check` with Node.js 22+ before deployment.
- The migration must also be run against an isolated staging Supabase project to verify PostgreSQL-version behavior, RLS, role grants, PostgREST schema refresh and real phone workflows. No live database was modified.

### Operational staging smoke test

1. Create a staging project/database and apply `schema.sql`, then `operational_modules.sql`, then `cash_bank_book.sql`.
2. Receive/open 1,000 units to the warehouse, issue 240 units to a salesman, sell 48, return 48 saleable and 24 damaged. Verify warehouse 808, salesman 120, and total saleable stock 928. Repeat the saleable return reference and verify no balance changes a second time.
3. Record PKR 8,000 cash receipt and PKR 1,500 cash expense against a PKR 20,000 invoice. With PKR 2,000 opening and PKR 7,000 handed over, verify expected cash is PKR 1,500.
4. Submit the close as the salesman, approve as admin, then confirm linked edits fail until admin reopens it with a reason.
5. Verify a salesman snapshot omits cost/salary and direct product cost queries are denied; admin snapshot retains authorized fields.
6. In Cash & Bank Book, verify cash, bank, EasyPaisa, JazzCash and salesman collection balances; submit an actual count, approve a variance, and confirm an audited adjustment brings the ledger closing to the verified count. Attempt a new transaction dated to an approved account/day and confirm the database rejects it.

## Product form submit fix

- `node --check js/app.js`: passed.
- Root/web copies are generated from root using `node scripts/release.mjs`.
- Added a Vitest UI regression for product creation through the form in local practice mode.
- The full Vitest suite must be run in an environment with the dependencies from `package-lock.json` installed. Do not treat this change as live-Supabase verified until a real product create and update are confirmed against the target project.

## Required staging smoke test

1. Sign in as an admin with the updated `product.save` migration installed.
2. Products & pricing → + Product → enter name, boxes/carton, cost, retail and wholesale; save.
3. Edit the new product's expiry date and wholesale price; save.
4. Enable tier overrides and try an invalid tier; verify the dialog stays open and displays an inline error.
5. Confirm the saved product appears in order and quotation product pickers.

## Manager access candidate build notes
- `node scripts/check.mjs` requires the project's TypeScript dependency; in the current build environment it could not run because that dependency was unavailable.
- Run the full check suite in the project's normal development environment before deployment.
- Verify Supabase RLS for Manager product edits, stock movements, fieldwork uploads/attendance, and daily closing clone workflow against a staging database.
