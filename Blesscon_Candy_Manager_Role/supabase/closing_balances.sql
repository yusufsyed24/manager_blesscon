-- Daily closing: record Cash in Bank, Cash in Hand, Cash in Easypaisa, Cash in Jazz Cash and Market Credit.
-- Run once in the Supabase SQL editor AFTER schema.sql, operational_modules.sql and (if used) manager_role.sql.
-- Safe to re-run. Existing closings keep 0 for the new balances.
-- The five amounts are recorded with the closing; they do not change expected cash or the cash variance.

alter table public.daily_closings
  add column if not exists cash_in_bank_paisa bigint not null default 0 check (cash_in_bank_paisa >= 0),
  add column if not exists cash_in_hand_paisa bigint not null default 0 check (cash_in_hand_paisa >= 0),
  add column if not exists cash_in_easypaisa_paisa bigint not null default 0 check (cash_in_easypaisa_paisa >= 0),
  add column if not exists cash_in_jazzcash_paisa bigint not null default 0 check (cash_in_jazzcash_paisa >= 0),
  add column if not exists market_credit_paisa bigint not null default 0 check (market_credit_paisa >= 0);

-- Patch apply_operational_command in place (text replace on its current definition), so earlier patches
-- such as manager_role.sql are preserved. A pattern already patched is skipped.
do $$
declare def text; nd text;
  v text:='coalesce(nullif(data->>''cash_in_bank_paisa'','''')::bigint,0),coalesce(nullif(data->>''cash_in_hand_paisa'','''')::bigint,0),coalesce(nullif(data->>''cash_in_easypaisa_paisa'','''')::bigint,0),coalesce(nullif(data->>''cash_in_jazzcash_paisa'','''')::bigint,0),coalesce(nullif(data->>''market_credit_paisa'','''')::bigint,0)';
begin
  select pg_get_functiondef('public.apply_operational_command(uuid,text,jsonb)'::regprocedure) into def;
  if position('cash_in_bank_paisa' in def)>0 then
    raise notice 'closing_balances: apply_operational_command already patched';
    return;
  end if;
  nd:=def;
  nd:=replace(nd,'if opening<0 or handed<0 or actual_cash<0 then raise exception ''Cash amounts cannot be negative''; end if;',
    'if opening<0 or handed<0 or actual_cash<0 then raise exception ''Cash amounts cannot be negative''; end if;
      if coalesce(nullif(data->>''cash_in_bank_paisa'','''')::bigint,0)<0 or coalesce(nullif(data->>''cash_in_hand_paisa'','''')::bigint,0)<0 or coalesce(nullif(data->>''cash_in_easypaisa_paisa'','''')::bigint,0)<0 or coalesce(nullif(data->>''cash_in_jazzcash_paisa'','''')::bigint,0)<0 or coalesce(nullif(data->>''market_credit_paisa'','''')::bigint,0)<0 then raise exception ''Closing balances cannot be negative''; end if;');
  nd:=replace(nd,'cash_variance_paisa=variance,expected_stock=expected_stock,',
    'cash_variance_paisa=variance,cash_in_bank_paisa=coalesce(nullif(data->>''cash_in_bank_paisa'','''')::bigint,0),cash_in_hand_paisa=coalesce(nullif(data->>''cash_in_hand_paisa'','''')::bigint,0),cash_in_easypaisa_paisa=coalesce(nullif(data->>''cash_in_easypaisa_paisa'','''')::bigint,0),cash_in_jazzcash_paisa=coalesce(nullif(data->>''cash_in_jazzcash_paisa'','''')::bigint,0),market_credit_paisa=coalesce(nullif(data->>''market_credit_paisa'','''')::bigint,0),expected_stock=expected_stock,');
  nd:=replace(nd,'cash_variance_paisa,expected_stock,actual_stock,stock_variances,reason,notes,status,submitted_by)',
    'cash_variance_paisa,cash_in_bank_paisa,cash_in_hand_paisa,cash_in_easypaisa_paisa,cash_in_jazzcash_paisa,market_credit_paisa,expected_stock,actual_stock,stock_variances,reason,notes,status,submitted_by)');
  nd:=replace(nd,'expected_cash,actual_cash,variance,expected_stock,','expected_cash,actual_cash,variance,'||v||',expected_stock,');
  if nd=def then raise exception 'closing_balances: apply_operational_command did not match the expected definition; nothing changed'; end if;
  execute nd;
  raise notice 'closing_balances: apply_operational_command patched';
end $$;

notify pgrst, 'reload schema';
