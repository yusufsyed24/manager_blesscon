# Expense account selector — v49

1. Back up the Supabase project before applying database changes.
2. In Supabase SQL Editor, run `supabase/expense_specific_cashbook_account.sql` after the existing schema and Cash & Bank Book migration.
3. Deploy this ZIP's files.
4. Open Expenses → + Expense. Select the exact “Pay from account” account before saving.
5. Create a small test expense against `pk80mucb1156654281004446` and verify the matching account's balance decreases by that amount and other bank accounts do not change.

The form includes the supplied account key as a fallback dropdown option in case account metadata has not loaded. The database foreign key still requires that account key to exist in `public.cashbook_accounts`. This migration does not rewrite old expenses or automatically repair historical negative balances. Review and reconcile those separately.
