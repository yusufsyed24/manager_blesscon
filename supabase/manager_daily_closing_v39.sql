-- Manager inventory editing permissions for Blesscon Candy Business Manager v31.
-- Run in Supabase SQL Editor after the current schema.sql / operational modules.
-- Gives the designated Manager product/pricing edit and stock movement permissions only.

create or replace function private.save_master(t text,r jsonb,expected integer default null) returns jsonb language plpgsql set search_path='' as $$
declare allowed text[]; k text; old jsonb; result jsonb; cols text:=''; vals text:=''; updates text:=''; rid text:=r->>'id'; adm boolean:=public.is_admin(); begin
case t
 when 'products' then allowed:=array['id','name','category','boxes_per_carton','cost_paisa','retail_paisa','wholesale_paisa','expiry_date','active'];
 when 'price_tiers' then allowed:=array['id','product_id','min_cartons','label','rate_paisa'];
 when 'salesmen' then allowed:=array['id','name','phone','user_id','joining_date','base_salary_paisa','monthly_target','active','off_days'];
 when 'customers' then allowed:=array['id','name','phone','email','address','salesman_id'];
 when 'expenses' then allowed:=array['id','date','category','description','amount_paisa','method','attachment_path','salesman_id','salary_period'];
 when 'settings' then allowed:=array['id','value'];
 else raise exception 'Unsupported table'; end case;
if not adm and not ((t in ('products','price_tiers') and public.has_permission('products','edit')) or t='customers' or (t='expenses' and public.has_permission('expenses','create'))) then raise exception 'Admin or product-edit permission required'; end if;
if rid is null or length(rid)>180 then raise exception 'Valid record ID required'; end if;
execute format('select to_jsonb(x) from public.%I x where id=$1 for update',t) into old using rid;
if old is not null and expected is distinct from (old->>'version')::integer then raise exception 'CONFLICT: Record changed; refresh and review before saving'; end if;
if not adm and old is not null and old->>'created_by'<>auth.uid()::text then raise exception 'Cannot edit another user record'; end if;
if t='customers' and not adm then select id into k from public.salesmen where user_id=auth.uid() and active and deleted_at is null; if k is null then raise exception 'Active salesman required'; end if; r:=r||jsonb_build_object('salesman_id',k); end if;
if t='salesmen' and (r->>'joining_date')::date < date '2000-01-01' then raise exception 'Joining date before 2000 is not supported'; end if;
if t='settings' then
 if rid<>'business' or jsonb_typeof(r->'value')<>'object' or jsonb_array_length(r->'value'->'working_days')=0 or jsonb_array_length(r->'value'->'tiers')=0 then raise exception 'Settings require working days and tiers'; end if;
 if exists(select 1 from jsonb_array_elements(r->'value'->'tiers') v where (v->>'min')::numeric<0 or (v->>'rate_paisa')::bigint<0) then raise exception 'Invalid tier'; end if;
 if not exists(select 1 from jsonb_array_elements(r->'value'->'tiers') v where (v->>'min')::numeric=0) then raise exception 'First tier must start at zero'; end if;
end if;
-- Only named business fields enter jsonb_populate_record; ownership/version cannot be supplied.
r:=(select jsonb_object_agg(key,value) from jsonb_each(r) where key=any(allowed));
foreach k in array allowed loop if r ? k then cols:=cols||format('%I,',k); vals:=vals||format('(jsonb_populate_record(null::public.%I,$1)).%I,',t,k); if k<>'id' then updates:=updates||format('%I=excluded.%I,',k,k); end if; end if; end loop;
if old is null then
 execute format('insert into public.%I (%s updated_by%s) select %s $2%s returning to_jsonb(%I.*)',t,cols,case when t='settings' then '' else ',created_by' end,vals,case when t='settings' then '' else ',$2' end,t) into result using r,auth.uid();
else
 execute format('insert into public.%I (%s updated_by) select %s $2 on conflict(id) do update set %s version=%I.version+1,updated_by=$2,updated_at=now() returning to_jsonb(%I.*)',t,cols,vals,updates||case when t='settings' then '' else 'deleted_at=null,' end,t,t) into result using r,auth.uid();
end if;
return result; end $$;

create or replace function private.stock_entry(d jsonb,imported boolean default false) returns jsonb language plpgsql set search_path='' as $$declare old public.stock_movements; delta integer:=(d->>'boxes')::integer; result jsonb; tx text:=nullif(trim(d->>'transaction_id'),''); movement_date date:=(d->>'date')::date; movement_kind text:=d->>'kind'; movement_note text:=coalesce(d->>'note',''); begin
 if not public.is_admin() and not (public.has_permission('stock','create') or public.has_permission('stock','edit')) then raise exception 'Admin or stock-edit permission required'; end if;
 if tx is null then raise exception 'A unique stock transaction reference is required'; end if;
 perform 1 from public.products where id=d->>'product_id' for update; if not found then raise exception 'Unknown product'; end if;
 if delta is null or (delta=0 and not imported) then raise exception 'Nonzero whole boxes required'; end if;
 if movement_kind not in ('opening','in','out','damage','adjustment') then raise exception 'Invalid manual movement type'; end if;
 select * into old from public.stock_movements where transaction_id=tx;
 if old.id is null and delta=0 then return jsonb_build_object('ignored_zero',true);end if;
 if old.id is not null then
  if not imported then
   -- Safe retry: return the prior row only when the request is identical. A reused
   -- reference with a different quantity/product/date/kind must never look successful.
   if old.product_id is distinct from d->>'product_id' or old.date is distinct from movement_date or old.boxes is distinct from delta or old.kind is distinct from movement_kind or coalesce(old.note,'') is distinct from movement_note then
    raise exception 'Duplicate stock transaction reference with different details. Use a new unique reference; existing stock was not changed.';
   end if;
   return to_jsonb(old);
  end if;
  if old.product_id<>d->>'product_id' then raise exception 'Transaction product changed; correct with adjustment'; end if;
  -- Effective source amount includes all prior import corrections. The original remains immutable.
  select delta-coalesce(sum(boxes),0)::integer into delta from public.stock_movements where transaction_id=tx or note='Import correction of '||tx;
  if delta=0 then return to_jsonb(old); end if;
  tx:=tx||':correction:'||gen_random_uuid();
 end if;
 if not imported and (select coalesce(sum(boxes),0)+delta from public.stock_movements where product_id=d->>'product_id')<0 and (select coalesce((value->>'block_negative_stock')::boolean,true) from public.settings where id='business') then raise exception 'Movement would make stock negative'; end if;
 insert into public.stock_movements(transaction_id,product_id,date,boxes,kind,note,created_by) values(tx,d->>'product_id',movement_date,delta,case when old.id is not null then 'adjustment' else movement_kind end,case when old.id is not null then 'Import correction of '||old.transaction_id else movement_note end,auth.uid()) returning to_jsonb(stock_movements.*) into result; return result; end $$;

-- Manager account: BABAR ALI KHAN
insert into public.user_permissions(user_id,section,can_view,can_create,can_edit,can_delete,can_export,can_share)
values
 ('d2cf42d4-3806-44f1-9deb-369920e2f152','products',true,true,true,false,true,false),
 ('d2cf42d4-3806-44f1-9deb-369920e2f152','stock',true,true,true,false,true,false)
on conflict(user_id,section) do update set
 can_view=excluded.can_view,
 can_create=excluded.can_create,
 can_edit=excluded.can_edit,
 can_delete=false,
 can_export=excluded.can_export,
 can_share=false,
 updated_at=now();

-- Keep reads scoped to active authenticated profiles with the relevant permission.
drop policy if exists product_read on public.products;
create policy product_read on public.products for select to authenticated
 using(public.is_admin() or public.has_permission('products') or exists(select 1 from public.salesmen s where s.user_id=auth.uid() and s.active));

drop policy if exists tiers_read on public.price_tiers;
create policy tiers_read on public.price_tiers for select to authenticated
 using(public.is_admin() or public.has_permission('products') or exists(select 1 from public.products p where p.id=product_id));

drop policy if exists stock_admin on public.stock_movements;
create policy stock_admin on public.stock_movements for select to authenticated
 using(public.is_admin() or public.has_permission('stock'));

notify pgrst, 'reload schema';
