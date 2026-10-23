-- Blesscon Candy: prevent duplicate stock references from silently discarding a new stock quantity.
-- Safe for existing data: this changes function behavior only; it does not update/delete stock or sales rows.
-- Apply once in Supabase SQL Editor, then refresh the app. Existing exact retries remain idempotent.
create or replace function private.stock_entry(d jsonb,imported boolean default false) returns jsonb language plpgsql set search_path='' as $$declare old public.stock_movements; delta integer:=(d->>'boxes')::integer; result jsonb; tx text:=nullif(trim(d->>'transaction_id'),''); movement_date date:=(d->>'date')::date; movement_kind text:=d->>'kind'; movement_note text:=coalesce(d->>'note',''); begin
 if not public.is_admin() then raise exception 'Admin required'; end if;
 if tx is null then raise exception 'A unique stock transaction reference is required'; end if;
 perform 1 from public.products where id=d->>'product_id' for update; if not found then raise exception 'Unknown product'; end if;
 if delta is null or (delta=0 and not imported) then raise exception 'Nonzero whole boxes required'; end if;
 if movement_kind not in ('opening','in','out','damage','adjustment') then raise exception 'Invalid manual movement type'; end if;
 select * into old from public.stock_movements where transaction_id=tx;
 if old.id is null and delta=0 then return jsonb_build_object('ignored_zero',true);end if;
 if old.id is not null then
  if not imported then
   if old.product_id is distinct from d->>'product_id' or old.date is distinct from movement_date or old.boxes is distinct from delta or old.kind is distinct from movement_kind or coalesce(old.note,'') is distinct from movement_note then
    raise exception 'Duplicate stock transaction reference with different details. Use a new unique reference; existing stock was not changed.';
   end if;
   return to_jsonb(old);
  end if;
  if old.product_id<>d->>'product_id' then raise exception 'Transaction product changed; correct with adjustment'; end if;
  select delta-coalesce(sum(boxes),0)::integer into delta from public.stock_movements where transaction_id=tx or note='Import correction of '||tx;
  if delta=0 then return to_jsonb(old); end if;
  tx:=tx||':correction:'||gen_random_uuid();
 end if;
 if not imported and (select coalesce(sum(boxes),0)+delta from public.stock_movements where product_id=d->>'product_id')<0 and (select coalesce((value->>'block_negative_stock')::boolean,true) from public.settings where id='business') then raise exception 'Movement would make stock negative'; end if;
 insert into public.stock_movements(transaction_id,product_id,date,boxes,kind,note,created_by) values(tx,d->>'product_id',movement_date,delta,case when old.id is not null then 'adjustment' else movement_kind end,case when old.id is not null then 'Import correction of '||old.transaction_id else movement_note end,auth.uid()) returning to_jsonb(stock_movements.*) into result; return result; end $$;
notify pgrst, 'reload schema';
