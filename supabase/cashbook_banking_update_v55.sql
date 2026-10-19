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
ORDER BY CASE account_key
  WHEN 'mcb_bank' THEN 1 WHEN 'al_habib_bank' THEN 2 WHEN 'jazzcash' THEN 3
  WHEN 'easypaisa' THEN 4 WHEN 'cash_hand' THEN 5 WHEN 'market_credit' THEN 6 ELSE 99 END;
