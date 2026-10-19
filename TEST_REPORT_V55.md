# Blesscon Candy Business Manager v55.1 — Validation report

## Implemented

- Cash & Bank Book account cards and ledger drill-down from v55 retained.
- Payment-method choices now distinguish **MCB Bank** from **Al Habib Bank**, including separate cheque destinations, in sales orders, invoice collections, quotation conversion, and expense forms.
- Payment and expense forms require an explicit destination account. Client-side checks reject a bank/method mismatch before submission.
- Additive SQL installs a database trigger that rejects missing/inactive accounts and mismatched MCB/Al Habib, cash, bank, and wallet destinations before the posting transaction can commit.
- The payment posting trigger maps bank-specific method names to bank receipts rather than cash receipts.
- Removed the stale hardcoded MCB expense account fallback. Expense destination options are sourced from active accounts; the legacy generic bank account is hidden when both named bank accounts are present.
- Product Pricing and Stock Update code was not changed.
- No reset, truncate, opening-balance rewrite, or historical ledger deletion is included.

## Checks performed in this environment

- `node --check js/app.js` passed.
- `node scripts/release.mjs` completed and regenerated `web/` from canonical root source.
- Root and `web/` `app.js` files match.
- Static checks confirmed the SQL includes bank-specific method validation, payment/expense triggers, Add Money RPC, and schema-cache notification.

## Checks not performed

- `node scripts/check.mjs` could not complete because the local dependency `typescript` is not installed.
- Automated Vitest/PGlite tests and live Supabase/RLS/RPC tests were not run in this environment.
- This SQL has not been executed against the user's Supabase project. Apply in staging first, then test mismatched destinations (which must be rejected), correct MCB/Al Habib postings, cash/wallet receipts, expenses, transfers, and account balances before production deployment.
