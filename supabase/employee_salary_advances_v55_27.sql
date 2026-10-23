-- Blesscon Candy v55: reconcile the requested six-account Cash & Bank Book.
-- Safe/additive: does not truncate data, rewrite account IDs, alter opening balances,
-- or delete historical entries. Run AFTER supabase/cash_bank_book.sql. This patch is independent of the v54 migration script.

DO $$
DECLARE
  item record;
BEGIN
  IF to_regclass('public.cashbook_accounts') IS NULL OR to_regclass('public.cashbook_entries') IS NULL THEN
    RAISE EXCEPTION 'Cash & Bank Book tables are missing. Apply supabase/cash_bank_book.sql first.';
  END IF;

  FOR item IN
    SELECT * FROM (VALUES
      ('mcb_bank','MCB Bank','bank','Bank'),
      ('al_habib_bank','Al Habib Bank','bank','Bank'),
      ('jazzcash','JazzCash','wallet','JazzCash'),
      ('easypaisa','EasyPaisa','wallet','Easypaisa'),
      ('cash_hand','Cash in Hand','cash','Cash'),
      ('market_credit','Market Credit — Receivables','receivable',NULL::text)
    ) AS v(account_key,label,account_type,payment_method)
  LOOP
    -- Reuse an existing exact key or clear display-name match; never duplicate an account
    -- merely because a legacy installation uses a different key.
    IF NOT EXISTS (
      SELECT 1 FROM public.cashbook_accounts
      WHERE account_key = item.account_key
         OR lower(trim(label)) = lower(trim(item.label))
         OR (item.account_key='al_habib_bank' AND lower(label) LIKE '%al habib%')
         OR (item.account_key='mcb_bank' AND lower(label) LIKE '%mcb%')
         OR (item.account_key='jazzcash' AND lower(label) LIKE '%jazz%cash%')
         OR (item.account_key='easypaisa' AND lower(label) LIKE '%easy%paisa%')
         OR (item.account_key='cash_hand' AND lower(label) LIKE '%cash in hand%')
         OR (item.account_key='market_credit' AND (lower(label) LIKE '%market credit%' OR lower(label) LIKE '%receivable%'))
    ) THEN
      INSERT INTO public.cashbook_accounts(account_key,label,account_type,payment_method,opening_balance_paisa,active)
      VALUES(item.account_key,item.label,item.account_type,item.payment_method,0,true)
      ON CONFLICT(account_key) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Dedicated, idempotent RPC for new external funds. Transfers use the existing paired
-- cashbook.transfer command; opening balance corrections remain in the restricted adjustment workflow.
CREATE OR REPLACE FUNCTION public.cashbook_add_money_command(op_id uuid, kind text, data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  acct public.cashbook_accounts;
  amt bigint;
  dt date;
  ref text;
  reason text;
  existing public.cashbook_entries;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only Admin can add external funds';
  END IF;
  IF kind <> 'cashbook.deposit' THEN
    RAISE EXCEPTION 'Unsupported Add Money command';
  END IF;
  IF op_id IS NULL THEN RAISE EXCEPTION 'A unique operation ID is required'; END IF;

  SELECT * INTO acct
  FROM public.cashbook_accounts
  WHERE account_key = data->>'account_key' AND active = true
    AND account_type IN ('cash','bank','wallet')
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active cash, bank, or wallet account'; END IF;

  amt := NULLIF(data->>'amount_paisa','')::bigint;
  IF amt IS NULL OR amt <= 0 THEN RAISE EXCEPTION 'Amount must be positive whole paisa'; END IF;
  dt := COALESCE(NULLIF(data->>'date','')::date,current_date);
  ref := COALESCE(data->>'reference','');
  reason := trim(COALESCE(data->>'description',''));
  IF reason = '' THEN RAISE EXCEPTION 'A source or reason is required'; END IF;

  SELECT * INTO existing FROM public.cashbook_entries WHERE posting_key='command:'||op_id::text;
  IF FOUND THEN
    IF existing.account_key IS DISTINCT FROM acct.account_key
       OR existing.amount_paisa IS DISTINCT FROM amt
       OR existing.business_date IS DISTINCT FROM dt
       OR existing.description IS DISTINCT FROM ('External funds introduced: '||reason)
       OR existing.reference IS DISTINCT FROM ref THEN
      RAISE EXCEPTION 'Duplicate Add Money operation ID with different details';
    END IF;
    RETURN jsonb_build_object('ok',true,'transaction_id',op_id::text,'duplicate',true);
  END IF;

  INSERT INTO public.cashbook_entries(
    posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,
    source_table,source_id,reference,description,created_by
  ) VALUES (
    'command:'||op_id::text,op_id::text,dt,acct.account_key,amt,'receipt',
    'cashbook',op_id::text,ref,'External funds introduced: '||reason,auth.uid()
  );
  RETURN jsonb_build_object('ok',true,'transaction_id',op_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.cashbook_add_money_command(uuid,text,jsonb) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.cashbook_add_money_command(uuid,text,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- Verification output: canonical account key/label/type and active state.
SELECT account_key,label,account_type,payment_method,opening_balance_paisa,active
FROM public.cashbook_accounts
WHERE account_key IN ('mcb_bank','al_habib_bank','jazzcash','easypaisa','cash_hand','market_credit')
   OR lower(label) LIKE '%mcb%' OR lower(label) LIKE '%al habib%'
   OR lower(label) LIKE '%jazz%cash%' OR lower(label) LIKE '%easy%paisa%'
   OR lower(label) LIKE '%cash in hand%' OR lower(label) LIKE '%market credit%'
ORDER BY CASE account_key
  WHEN 'mcb_bank' THEN 1 WHEN 'al_habib_bank' THEN 2 WHEN 'jazzcash' THEN 3
  WHEN 'easypaisa' THEN 4 WHEN 'cash_hand' THEN 5 WHEN 'market_credit' THEN 6 ELSE 99 END;

-- Strict destination validation: the selected account key, not the generic word "Bank",
-- controls where a payment/expense is posted. A mismatch aborts the whole transaction.
CREATE OR REPLACE FUNCTION private.cashbook_validate_account_method()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  acct public.cashbook_accounts%rowtype;
  m text := lower(trim(coalesce(NEW.method,'')));
  expected_type text;
  specific_bank text := '';
BEGIN
  IF NULLIF(trim(NEW.cashbook_account_key),'') IS NULL THEN
    RAISE EXCEPTION 'Select the exact receiving/paying account before saving this transaction';
  END IF;

  SELECT * INTO acct
  FROM public.cashbook_accounts
  WHERE account_key = NEW.cashbook_account_key AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected account is missing or inactive. Choose an active account';
  END IF;

  IF m IN ('mcb bank','cheque — mcb bank','cheque - mcb bank') THEN
    expected_type := 'bank'; specific_bank := 'mcb';
  ELSIF m IN ('al habib bank','cheque — al habib bank','cheque - al habib bank') THEN
    expected_type := 'bank'; specific_bank := 'al habib';
  ELSIF m IN ('bank','bank account','cheque') THEN
    expected_type := 'bank';
  ELSIF m IN ('jazzcash') THEN
    expected_type := 'wallet';
  ELSIF m IN ('easypaisa','easy paisa') THEN
    expected_type := 'wallet';
  ELSE
    expected_type := 'cash';
  END IF;

  IF specific_bank <> '' THEN
    IF acct.account_type <> 'bank' THEN
      RAISE EXCEPTION '%, must be selected as the destination account for this payment method',
        CASE WHEN specific_bank='mcb' THEN 'MCB Bank' ELSE 'Al Habib Bank' END;
    END IF;
    IF specific_bank='mcb' AND NOT (acct.account_key='mcb_bank' OR acct.account_key='pk80mucb1156654281004446' OR lower(acct.label) LIKE '%mcb%') THEN
      RAISE EXCEPTION 'Payment method is MCB Bank, but the selected account is %', acct.label;
    END IF;
    IF specific_bank='al habib' AND NOT (acct.account_key='al_habib_bank' OR lower(acct.label) LIKE '%al habib%') THEN
      RAISE EXCEPTION 'Payment method is Al Habib Bank, but the selected account is %', acct.label;
    END IF;
  ELSIF acct.account_type='salesman' THEN
    IF lower(coalesce(acct.payment_method,'')) NOT IN
      (CASE WHEN expected_type='bank' THEN 'bank account' WHEN expected_type='wallet' THEN lower(m) ELSE 'cash' END,
       CASE WHEN expected_type='wallet' AND m='easypaisa' THEN 'easypaisa' ELSE 'cash' END) THEN
      RAISE EXCEPTION 'Selected salesman collection account does not match payment method %', NEW.method;
    END IF;
  ELSIF acct.account_type <> expected_type THEN
    RAISE EXCEPTION 'Payment method % does not match selected account %', NEW.method, acct.label;
  END IF;

  IF expected_type='wallet' AND acct.account_type='wallet'
     AND lower(coalesce(acct.payment_method,'')) NOT IN (m, CASE WHEN m='easy paisa' THEN 'easypaisa' ELSE m END) THEN
    RAISE EXCEPTION 'Payment method % does not match selected wallet %', NEW.method, acct.label;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cashbook_validate_payment_account ON public.payments;
CREATE TRIGGER cashbook_validate_payment_account
BEFORE INSERT OR UPDATE OF method, cashbook_account_key ON public.payments
FOR EACH ROW EXECUTE FUNCTION private.cashbook_validate_account_method();

DROP TRIGGER IF EXISTS cashbook_validate_expense_account ON public.expenses;
CREATE TRIGGER cashbook_validate_expense_account
BEFORE INSERT OR UPDATE OF method, cashbook_account_key ON public.expenses
FOR EACH ROW EXECUTE FUNCTION private.cashbook_validate_account_method();

-- Ensure the posting trigger treats bank-specific methods as bank receipts, not cash.
DO $$
DECLARE def text; nd text;
BEGIN
  SELECT pg_get_functiondef('private.cashbook_post_payment()'::regprocedure) INTO def;
  nd := replace(def,
    $old$when lower(coalesce(new.method,'')) in ('bank','bank account','cheque') then 'Bank Account'$old$,
    $new$when lower(coalesce(new.method,'')) in ('bank','bank account','cheque','mcb bank','al habib bank','cheque — mcb bank','cheque - mcb bank','cheque — al habib bank','cheque - al habib bank') then 'Bank Account'$new$);
  IF nd = def OR position('cheque — al habib bank' in nd) = 0 THEN
    RAISE EXCEPTION 'Could not safely patch cashbook_post_payment method mapping. Do not proceed with bank-specific payment methods until the function definition is reviewed.';
  END IF;
  EXECUTE nd;
END $$;

REVOKE ALL ON FUNCTION private.cashbook_validate_account_method() FROM public, anon, authenticated;
NOTIFY pgrst, 'reload schema';
