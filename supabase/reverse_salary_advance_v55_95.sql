-- v55.95: Reverse a mistaken salary advance and credit the account back.
-- Run in Supabase SQL Editor. Nothing is deleted; a reversal entry is added to the cash book (audit trail kept).

-- STEP 1 — find the advance. Check employee, amount, account and WHO created it / WHEN.
select a.id, a.employee_name, a.advance_date, a.amount_paisa/100.0 as amount_pkr, a.recovered_paisa,
       a.account_key, a.status, a.reason, a.created_at, a.created_by,
       (select email from auth.users u where u.id = a.created_by) as created_by_email
from public.employee_salary_advances a
where a.employee_name ilike '%arsalan%'
order by a.created_at desc;

-- STEP 2 — paste the id from STEP 1 below, then run this whole block.
do $$
declare
  v_id uuid := '00000000-0000-0000-0000-000000000000';   -- <-- PASTE ADVANCE ID HERE
  adv public.employee_salary_advances;
begin
  select * into adv from public.employee_salary_advances where id = v_id for update;
  if not found then raise exception 'Advance % not found', v_id; end if;
  if adv.status <> 'posted' then raise exception 'Advance is already %', adv.status; end if;
  if coalesce(adv.recovered_paisa,0) <> 0 then raise exception 'Part of this advance was already recovered through salary; reverse manually'; end if;
  if exists (select 1 from public.cashbook_entries where posting_key = 'salary-advance-reversal:' || v_id::text) then
    raise exception 'Reversal already posted';
  end if;

  -- Credit the account back (the original entry is -amount, so the reversal is +amount).
  insert into public.cashbook_entries (posting_key, transaction_id, business_date, account_key, amount_paisa,
         entry_type, source_table, source_id, reference, description, salesman_id, reversal_of, created_by)
  values ('salary-advance-reversal:' || v_id::text, 'SALADV-REV-' || v_id::text, current_date, adv.account_key,
         adv.amount_paisa, 'reversal', 'employee_salary_advances', v_id::text, coalesce(adv.reference,''),
         'Reversal of mistaken salary advance to ' || adv.employee_name, adv.salesman_id,
         'salary-advance:' || v_id::text, adv.created_by);

  -- Mark the advance reversed so it disappears from Expenses, payroll and outstanding-advance balances.
  update public.employee_salary_advances set status = 'reversed' where id = v_id;
end $$;

-- STEP 3 — verify: the account balance should be back, and the advance shows 'reversed'.
select id, employee_name, amount_paisa/100.0 as amount_pkr, status from public.employee_salary_advances where employee_name ilike '%arsalan%' order by created_at desc;
