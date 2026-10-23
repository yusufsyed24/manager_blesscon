-- Blesscon Candy v55.13: allow the bank-specific payment method labels used by the UI.
-- Fixes offline order/payment sync failures caused by payments_method_check allowing only
-- the legacy values Cash, Bank, JazzCash, Easypaisa, and Cheque.
-- Safe/additive: no payment rows are deleted or rewritten; the finite allow-list remains enforced.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.payments') IS NULL THEN
    RAISE EXCEPTION 'public.payments is missing. Apply the base schema before this migration.';
  END IF;

  ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
  ALTER TABLE public.payments
    ADD CONSTRAINT payments_method_check
    CHECK (method IN (
      'Cash',
      'Bank',
      'Bank Account',
      'JazzCash',
      'Easypaisa',
      'EasyPaisa',
      'Cheque',
      'MCB Bank',
      'Al Habib Bank',
      'Cheque — MCB Bank',
      'Cheque - MCB Bank',
      'Cheque — Al Habib Bank',
      'Cheque - Al Habib Bank'
    ));
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
