-- Blesscon Candy: allow each expense to post to its explicitly selected cash/bank/wallet account.
-- Run after schema.sql and cash_bank_book.sql. Safe to re-run.
begin;

alter table public.expenses
  add column if not exists cashbook_account_key text references public.cashbook_accounts(account_key);

-- Save-master only accepts explicitly allow-listed expense fields. Extend that list safely.
do $patch$
declare def text; newdef text;
begin
  select pg_get_functiondef('private.save_master(text,jsonb,integer)'::regprocedure) into def;
  if position('cashbook_account_key' in def) > 0 then
    raise notice 'private.save_master already accepts expense cashbook_account_key';
  else
    newdef := replace(def,
      $old$when 'expenses' then allowed:=array['id','date','category','description','amount_paisa','method','attachment_path','salesman_id','salary_period'];$old$,
      $new$when 'expenses' then allowed:=array['id','date','category','description','amount_paisa','method','cashbook_account_key','attachment_path','salesman_id','salary_period'];$new$);
    if newdef = def then
      raise exception 'Could not patch private.save_master: expected expense allow-list was not found. Do not continue; check schema.sql version.';
    end if;
    execute newdef;
  end if;
end
$patch$;

create or replace function private.cashbook_post_expense()
returns trigger language plpgsql security definer set search_path=''
as $$
declare acct text; sid text;
begin
  sid := new.salesman_id;
  acct := coalesce(new.cashbook_account_key, private.cashbook_method_account(new.method,sid));
  if not exists (select 1 from public.cashbook_accounts a where a.account_key=acct and a.active and a.account_type <> 'receivable') then
    raise exception 'Expense payment account is missing, inactive, or not a cash/bank/wallet account: %', acct;
  end if;
  if tg_op='INSERT' then
    if new.deleted_at is null then
      insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,reference,description,salesman_id,created_by)
      values('expense:'||new.id||':v'||coalesce(new.version,1),new.id,new.date,acct,-new.amount_paisa,'expense','expenses',new.id::text,'','Expense — '||new.category,sid,new.created_by)
      on conflict(posting_key) do nothing;
    end if;
  elsif (old.amount_paisa,old.method,old.cashbook_account_key,old.date,old.salesman_id,old.deleted_at) is distinct from (new.amount_paisa,new.method,new.cashbook_account_key,new.date,new.salesman_id,new.deleted_at) then
    if old.deleted_at is null then
      insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,description,salesman_id,created_by)
      values('expense:'||old.id||':reverse-v'||old.version,old.id,current_date,coalesce(old.cashbook_account_key,private.cashbook_method_account(old.method,old.salesman_id)),old.amount_paisa,'reversal','expenses',old.id::text,'Reversal of edited/deleted expense',old.salesman_id,auth.uid())
      on conflict(posting_key) do nothing;
    end if;
    if new.deleted_at is null then
      insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,description,salesman_id,created_by)
      values('expense:'||new.id||':v'||coalesce(new.version,1),new.id,new.date,acct,-new.amount_paisa,'expense','expenses',new.id::text,'Expense — '||new.category,sid,new.created_by)
      on conflict(posting_key) do nothing;
    end if;
  end if;
  return new;
end $$;


-- Normalize the user-facing payment method alias without changing internal account_type='bank'.
create or replace function private.cashbook_method_account(p_method text, p_salesman_id text default null)
returns text language plpgsql security definer set search_path=''
as $$
begin
  if p_salesman_id is not null then
    return private.cashbook_ensure_salesman_account(p_salesman_id,p_method);
  end if;
  return case
    when lower(coalesce(p_method,'')) in ('easypaisa','easy paisa') then 'easypaisa'
    when lower(coalesce(p_method,''))='jazzcash' then 'jazzcash'
    when lower(coalesce(p_method,'')) in ('bank','bank account','cheque') then 'bank_default'
    else 'cash_hand'
  end;
end $$;

-- Move an existing expense posting to the explicitly selected account, rather than creating
-- a second debit. This corrects historical entries only where the saved selection is known.
update public.cashbook_entries ce
set account_key = e.cashbook_account_key
from public.expenses e
where ce.source_table='expenses'
  and ce.source_id=e.id::text
  and ce.entry_type='expense'
  and ce.amount_paisa=-e.amount_paisa
  and e.deleted_at is null
  and e.cashbook_account_key is not null
  and ce.account_key is distinct from e.cashbook_account_key;

-- Repair current expense postings that were previously created against the default account.
-- Keep the same posting row/key, but move it to the account explicitly selected on the expense.
-- This prevents a selected MCB expense from continuing to reduce the default bank balance.
update public.cashbook_entries ce
set account_key = e.cashbook_account_key
from public.expenses e
where ce.source_table = 'expenses'
  and ce.source_id = e.id::text
  and ce.entry_type = 'expense'
  and ce.amount_paisa = -e.amount_paisa
  and e.deleted_at is null
  and e.cashbook_account_key is not null
  and ce.account_key is distinct from e.cashbook_account_key;

-- Refresh the expense ledger postings once for records already carrying a selected account.
-- Existing expenses with NULL selected account retain the prior method-based posting.
insert into public.cashbook_entries(posting_key,transaction_id,business_date,account_key,amount_paisa,entry_type,source_table,source_id,description,salesman_id,created_by)
select 'expense:'||e.id||':v'||coalesce(e.version,1),e.id,e.date,e.cashbook_account_key,-e.amount_paisa,'expense','expenses',e.id::text,'Expense — '||e.category,e.salesman_id,e.created_by
from public.expenses e
where e.deleted_at is null and e.cashbook_account_key is not null
on conflict(posting_key) do nothing;

commit;

notify pgrst, 'reload schema';
