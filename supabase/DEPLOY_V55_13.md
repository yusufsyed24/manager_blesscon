# Deploy v55.13 — Payment method sync fix

This release fixes `new row for relation "payments" violates check constraint "payments_method_check"` when an offline order/payment sync includes a bank-specific method selected in the UI.

## 1. Apply the database migration first

1. Open Supabase project `ggfjddhqevcvosxberua`.
2. Go to **SQL Editor → New query**. Do not use Bash for SQL.
3. Open `supabase/fix_payment_method_constraint_v55_13.sql` from this ZIP and paste the entire file into the SQL Editor.
4. Click **Run** and confirm it completes successfully.

The migration expands the finite allowed values for `payments.method` to include the bank-specific methods already used by the app. It does not delete, rewrite, or clear payment rows and does not disable the check constraint.

## 2. Retry the pending transaction

1. Open the app while connected to the internet and sign in with the same account that created the order.
2. Open **Pending Sync** (or the sync status area).
3. Retry sync for the existing pending transaction. Do not delete the pending item or recreate the order.
4. Confirm the order and payment appear once in the sales/orders and payment records.

## 3. Publish the website package

Publish the updated `web/` files to GitHub Pages. If the repository serves root-level copies as well, keep those files synchronized with the matching `web/` files. Commit and push, wait for deployment, then hard-refresh with `Ctrl + Shift + R`.

## Validation and safety

The migration is transactional and retains a finite allow-list. It is additive to the current schema and does not reset business data. This package has not been applied to the live Supabase project, and live sync cannot be verified from this environment. If the SQL fails, stop and share the complete error text; keep the pending transaction intact.
