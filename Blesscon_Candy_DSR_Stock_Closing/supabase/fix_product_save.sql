-- Product create/update migration for existing installations.
-- Apply this whole file in Supabase SQL Editor, then hard-refresh the app.
-- It intentionally replaces apply_command with the exact current function from schema.sql
-- so payment, stock, quote and admin command branches are not lost.
create or replace function public.apply_command(op_id uuid,kind text,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cached private.commands; result jsonb; o public.orders; q public.quotations; r jsonb; v_table_name text; v integer; old jsonb; inv public.invoices; params jsonb; rid text; a bigint; n bigint; begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Active login required'; end if;
 -- Serialises stock, numbering, payments and conversions, including retries from offline devices.
 lock table private.commands in exclusive mode;
 select * into cached from private.commands where id=op_id;
 if cached.id is not null then if cached.user_id<>auth.uid() or cached.kind<>kind then raise exception 'Operation ID belongs to another request'; end if; return cached.result; end if;
 case kind
 when 'master.save' then result:=private.save_master(data->>'table',data->'record',(data->>'expected_version')::integer);
 when 'product.save' then
  if not public.is_admin() then raise exception 'Admin required'; end if;
  if jsonb_typeof(data->'record')<>'object' then raise exception 'Product details are missing'; end if;
  if nullif(trim(data#>>'{record,id}'),'') is null or length(data#>>'{record,id}')>180 then raise exception 'Product ID must be 1–180 characters'; end if;
  if nullif(trim(data#>>'{record,name}'),'') is null then raise exception 'Product name is required'; end if;
  if coalesce(nullif(data#>>'{record,boxes_per_carton}','')::integer,0)<1 then raise exception 'Boxes per carton must be at least 1'; end if;
  if coalesce(nullif(data#>>'{record,cost_paisa}','')::bigint,-1)<0 or coalesce(nullif(data#>>'{record,retail_paisa}','')::bigint,-1)<0 or coalesce(nullif(data#>>'{record,wholesale_paisa}','')::bigint,-1)<0 then raise exception 'Cost, retail and wholesale prices must be valid non-negative amounts'; end if;
  select to_jsonb(p) into old from public.products p where p.id=data#>>'{record,id}' for update;
  if old is not null and nullif(data->>'expected_version','') is null then
   if old->>'deleted_at' is not null then raise exception 'This Product ID belongs to a deleted product. Restore it or choose a different ID.';
   else raise exception 'This Product ID is already in use. Choose a unique ID.'; end if;
  end if;
  result:=private.save_master('products',data->'record',nullif(data->>'expected_version','')::integer);
  params:=coalesce(data->'tiers','[]'::jsonb);
  if jsonb_typeof(params)<>'array' then raise exception 'Product tiers must be an array'; end if;
  if jsonb_array_length(params)>0 and (not exists(select 1 from jsonb_array_elements(params) x where (x->>'min_cartons')::numeric=0) or exists(select 1 from (select (x->>'min_cartons')::numeric n,count(*) c from jsonb_array_elements(params) x group by 1 having count(*)>1) z) or exists(select 1 from jsonb_array_elements(params) x where (x->>'min_cartons')::numeric<0 or (x->>'rate_paisa')::bigint<0 or length(trim(coalesce(x->>'label','')))=0)) then raise exception 'Product tiers need unique minimums starting at 0 and valid labels/rates'; end if;
  update public.price_tiers set deleted_at=now(),version=version+1,updated_by=auth.uid(),updated_at=now() where product_id=data#>>'{record,id}' and deleted_at is null and not exists(select 1 from jsonb_array_elements(params) x where (x->>'min_cartons')::numeric=price_tiers.min_cartons);
  for r in select value from jsonb_array_elements(params) loop
   insert into public.price_tiers(id,product_id,min_cartons,label,rate_paisa,created_by,updated_by,deleted_at)
   values(coalesce(nullif(r->>'id',''),(data#>>'{record,id}')||':'||(r->>'min_cartons')),data#>>'{record,id}',(r->>'min_cartons')::numeric,r->>'label',(r->>'rate_paisa')::bigint,auth.uid(),auth.uid(),null)
   on conflict(product_id,min_cartons) do update set label=excluded.label,rate_paisa=excluded.rate_paisa,deleted_at=null,version=public.price_tiers.version+1,updated_by=auth.uid(),updated_at=now();
  end loop;
  result:=jsonb_build_object('product',(select to_jsonb(p) from public.products p where p.id=data#>>'{record,id}'),'tiers',(select coalesce(jsonb_agg(to_jsonb(pt)),'[]'::jsonb) from public.price_tiers pt where pt.product_id=data#>>'{record,id}' and pt.deleted_at is null));
 when 'master.delete' then
  if not public.is_admin() then raise exception 'Admin required for deletion'; end if;
  v_table_name:=data->>'table';if v_table_name not in ('products','customers','salesmen','expenses','price_tiers') then raise exception 'Invalid table'; end if;
  execute format('update public.%I set deleted_at=now(),version=version+1,updated_by=$1 where id=$2 and version=$3 returning to_jsonb(%I.*)',v_table_name,v_table_name) into result using auth.uid(),data->>'id',(data->>'version')::integer;
  if result is null then raise exception 'CONFLICT: Record changed'; end if;
 when 'order.save' then
  result:=private.save_document(data,false);
  if coalesce(data#>>'{payment,status}','unpaid')<>'unpaid' then
   select total_paisa into n from public.orders where id=(result->>'id')::uuid;
   params:=data->'payment';
   if coalesce(params->>'status','')='partial' and (nullif(params->>'amount_paisa','') is null or (params->>'amount_paisa')::bigint<=0 or (params->>'amount_paisa')::bigint>=n) then raise exception 'Part payment must be greater than zero and less than the order total'; end if;
   result:=result||jsonb_build_object('payment_result',private.add_payment(jsonb_build_object('invoice_id',(result->>'id'),'transaction_id',params->>'transaction_id','date',coalesce(params->>'date',private.business_today()::text),'amount_paisa',case when params->>'status'='paid' then n else (params->>'amount_paisa')::bigint end,'method',coalesce(params->>'method','Cash'),'reference',coalesce(params->>'reference',''),'received_by',coalesce(nullif(params->>'received_by',''),'Owner'))));
  end if;
 when 'order.cancel' then
  if not public.is_admin() then raise exception 'Admin required for cancellation'; end if;
  select * into strict o from public.orders where id=(data->>'id')::uuid for update;
  if o.status='cancelled' then result:=to_jsonb(o); else
   if o.version is distinct from (data->>'version')::integer then raise exception 'CONFLICT: Order changed'; end if;
   if exists(select 1 from public.payments p join public.invoices i on i.id=p.invoice_id where i.order_id=o.id and p.voided_at is null) then raise exception 'Void/refund recorded payments before cancelling'; end if;
   insert into public.stock_movements(transaction_id,product_id,date,boxes,kind,order_id,note,created_by) select 'cancel:'||o.id||':'||product_id,product_id,private.business_today(),boxes,'reversal',o.id,coalesce(data->>'reason','Cancelled'),auth.uid() from public.order_items where order_id=o.id;
   update public.orders set status='cancelled',version=version+1,updated_by=auth.uid(),updated_at=now() where id=o.id returning to_jsonb(orders.*) into result;
   update public.invoices set share_token=null,share_expires_at=null where order_id=o.id;
  end if;
 when 'quote.save' then result:=private.save_document(data,true);
 when 'quote.status' then
  select * into strict q from public.quotations where id=(data->>'id')::uuid for update;
  if not public.can_document(q.salesman_id,'quotes','edit') or q.deleted_at is not null then raise exception 'Not authorised'; end if;
  if q.version is distinct from (data->>'version')::integer then raise exception 'CONFLICT: Quotation changed'; end if;
  if not((q.status='Draft' and data->>'status'='Sent') or (q.status='Sent' and data->>'status' in ('Accepted','Rejected','Expired'))) then raise exception 'Invalid status transition'; end if;
  update public.quotations set status=data->>'status',version=version+1,updated_by=auth.uid(),updated_at=now() where id=q.id returning to_jsonb(quotations.*) into result;
 when 'quote.delete' then
  if not public.is_admin() then raise exception 'Admin required for deletion'; end if;
  select * into strict q from public.quotations where id=(data->>'id')::uuid for update;
  if q.status='Converted' or q.order_id is not null then raise exception 'Cannot delete converted quotation'; end if;
  if q.version is distinct from (data->>'version')::integer then raise exception 'CONFLICT: Quotation changed'; end if;
  if coalesce((data->>'hard')::boolean,false) then delete from public.quotations where id=q.id; result:=jsonb_build_object('deleted',q.id);
  else update public.quotations set deleted_at=now(),version=version+1,share_token=null,updated_by=auth.uid() where id=q.id returning to_jsonb(quotations.*) into result; end if;
 when 'quote.convert' then
  select * into strict q from public.quotations where id=(data->>'id')::uuid for update;
  if not public.can_document(q.salesman_id,'quotes','edit') then raise exception 'Not authorised'; end if;
  if q.status='Converted' or q.order_id is not null then raise exception 'Quotation already converted'; end if;
  if q.status in ('Rejected','Expired') or q.deleted_at is not null or q.valid_until<private.business_today() then raise exception 'Quotation expired or rejected'; end if;
  if q.version is distinct from (data->>'version')::integer then raise exception 'CONFLICT: Quotation changed'; end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into params from public.quotation_items x where quotation_id=q.id;
  if coalesce((data->>'reprice')::boolean,false) then select jsonb_agg(value-'rate_paisa'-'override_reason') into params from jsonb_array_elements(params); end if;
  params:=to_jsonb(q)||jsonb_build_object('id',coalesce(nullif(data->>'order_id','')::uuid,gen_random_uuid()),'date',private.business_today(),'due_date',coalesce((data->>'due_date')::date,private.business_today()+7),'version',null,'items',params);
  result:=private.save_document(params,false,false,case when coalesce((data->>'reprice')::boolean,false) then null else q.id end);
  update public.orders set quotation_id=q.id where id=(result->>'id')::uuid;
  update public.quotations set status='Converted',order_id=(result->>'id')::uuid,version=version+1,updated_by=auth.uid() where id=q.id;
  if coalesce(data#>>'{payment,status}','unpaid')<>'unpaid' then
   select total_paisa into n from public.orders where id=(result->>'id')::uuid;
   params:=data->'payment';
   if coalesce(params->>'status','')='partial' and (nullif(params->>'amount_paisa','') is null or (params->>'amount_paisa')::bigint<=0 or (params->>'amount_paisa')::bigint>=n) then raise exception 'Part payment must be greater than zero and less than the order total'; end if;
   perform private.add_payment(jsonb_build_object('invoice_id',(result->>'id'),'transaction_id',params->>'transaction_id','date',coalesce(params->>'date',private.business_today()::text),'amount_paisa',case when params->>'status'='paid' then n else (params->>'amount_paisa')::bigint end,'method',coalesce(params->>'method','Cash'),'reference',coalesce(params->>'reference',''),'received_by',coalesce(nullif(params->>'received_by',''),'Owner')));
  end if;
 when 'payment.add' then result:=private.add_payment(data);
 when 'payment.void' then
  if not public.is_admin() or length(trim(coalesce(data->>'reason','')))=0 then raise exception 'Admin and reason required'; end if;
  update public.payments set voided_at=now(),void_reason=data->>'reason' where id=(data->>'id')::uuid and voided_at is null returning to_jsonb(payments.*) into result;
  if result is null then raise exception 'Payment already voided or missing'; end if;
 when 'stock.add' then result:=private.stock_entry(data);
 when 'share.create' then
  if data->>'type'='quote' then
   select * into strict q from public.quotations where id=(data->>'id')::uuid and deleted_at is null;
   if not public.can_document(q.salesman_id,'quotes','share') then raise exception 'Share permission required'; end if;
   update public.quotations set share_token=gen_random_uuid(),share_expires_at=now()+interval '30 days' where id=q.id returning jsonb_build_object('token',share_token,'expires',share_expires_at) into result;
  else
   select * into strict inv from public.invoices where id=(data->>'id')::uuid;
   select * into strict o from public.orders where id=inv.order_id and status='confirmed';
   if not public.can_document(o.salesman_id,'invoices','share') then raise exception 'Share permission required'; end if;
   update public.invoices set share_token=gen_random_uuid(),share_expires_at=now()+interval '30 days' where id=inv.id returning jsonb_build_object('token',share_token,'expires',share_expires_at) into result;
  end if;
 when 'share.revoke' then
  if data->>'type'='quote' then select * into strict q from public.quotations where id=(data->>'id')::uuid; if not public.can_document(q.salesman_id,'quotes','share') then raise exception 'Not authorised'; end if;update public.quotations set share_token=null,share_expires_at=null where id=q.id;
  else select * into strict inv from public.invoices where id=(data->>'id')::uuid;select * into strict o from public.orders where id=inv.order_id;if not public.can_document(o.salesman_id,'invoices','share') then raise exception 'Not authorised';end if;update public.invoices set share_token=null,share_expires_at=null where id=inv.id;end if;result:='{"revoked":true}';
 when 'import.batch' then
  if not public.is_admin() then raise exception 'Admin required'; end if;
  select coalesce(max(id),0) into a from public.audit_log;
  if a is distinct from (data->>'audit_cursor')::bigint then raise exception 'CONFLICT: Business data changed since preview; import again'; end if;
  foreach v_table_name in array array['settings','products','price_tiers','salesmen','customers'] loop
   for r in select value from jsonb_array_elements(case when v_table_name='settings' then jsonb_build_array(data->'settings') else coalesce(data->v_table_name,'[]') end) loop
    execute format('select version from public.%I where id=$1',v_table_name) into v using r->>'id';perform private.save_master(v_table_name,r,v);
   end loop;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(data->'stock_movements','[]')) loop perform private.stock_entry(r,true);end loop;
  for r in select value from jsonb_array_elements(coalesce(data->'orders','[]')) loop
   select to_jsonb(x) into old from public.orders x where number=r->>'number';
   if old is not null then r:=r||jsonb_build_object('id',old->>'id','version',old->'version');end if;
   perform private.save_document(r,false,true);
  end loop;
  for r in select value from jsonb_array_elements(coalesce(data->'payments','[]')) loop perform private.add_payment(r,true);end loop;
  for r in select value from jsonb_array_elements(coalesce(data->'expenses','[]')) loop select version into v from public.expenses where id=r->>'id';perform private.save_master('expenses',r,v);end loop;
  for r in select value from jsonb_array_elements(coalesce(data->'daily_actuals','[]')) loop
   insert into public.salesman_daily_targets(id,date,salesman_id,base_target,carried_forward_in,effective_target,imported_actual_cartons,imported_actual_boxes,imported_sales_amount)
   values(r->>'id',(r->>'date')::date,r->>'salesman_id',0,0,0,(r->>'imported_actual_cartons')::numeric,(r->>'imported_actual_boxes')::integer,(r->>'imported_sales_amount')::bigint)
   on conflict(id) do update set imported_actual_cartons=excluded.imported_actual_cartons,imported_actual_boxes=excluded.imported_actual_boxes,imported_sales_amount=excluded.imported_sales_amount;
  end loop;
  result:=jsonb_build_object('imported',true,'products',jsonb_array_length(data->'products'),'orders',jsonb_array_length(data->'orders'));
 when 'user.provision' then
  if not public.is_admin() then raise exception 'Admin required';end if;
  if data->>'role' not in ('admin','salesman','user') or length(trim(data->>'display_name'))<2 then raise exception 'Invalid user fields';end if;
  if not exists(select 1 from auth.users where id=(data->>'user_id')::uuid) then raise exception 'Auth user missing';end if;
  insert into public.profiles(id,display_name,active) values((data->>'user_id')::uuid,data->>'display_name',true);
  insert into public.user_roles(user_id,role) values((data->>'user_id')::uuid,data->>'role');
  if nullif(data->>'salesman_id','') is not null then
   update public.salesmen set user_id=(data->>'user_id')::uuid,updated_by=auth.uid(),version=version+1 where id=data->>'salesman_id' and user_id is null and active and deleted_at is null;
   if not found then raise exception 'Salesman missing or already linked';end if;
  end if;
  update public.admin_user_requests set status='complete',created_user_id=(data->>'user_id')::uuid where id=op_id and actor_id=auth.uid();
  result:=jsonb_build_object('user_id',data->>'user_id');
 when 'user.update' then
  if not public.is_admin() then raise exception 'Admin required';end if;
  if data->>'id'=auth.uid()::text then raise exception 'Use another admin to change your own access';end if;
  update public.profiles set active=(data->>'active')::boolean,updated_at=now() where id=(data->>'id')::uuid;
  update public.user_roles set role=data->>'role',updated_at=now() where user_id=(data->>'id')::uuid;
  for r in select value from jsonb_array_elements(coalesce(data->'permissions','[]')) loop
   if r->>'section' not in ('dashboard','orders','invoices','quotes','stock','products','staff','expenses','pnl','settings','users','ledger') then raise exception 'Invalid section';end if;
   insert into public.user_permissions(user_id,section,can_view,can_create,can_edit,can_delete,can_export,can_share) values((data->>'id')::uuid,r->>'section',coalesce((r->>'can_view')::boolean,false),coalesce((r->>'can_create')::boolean,false),coalesce((r->>'can_edit')::boolean,false),false,coalesce((r->>'can_export')::boolean,false),coalesce((r->>'can_share')::boolean,false)) on conflict(user_id,section) do update set can_view=excluded.can_view,can_create=excluded.can_create,can_edit=excluded.can_edit,can_delete=false,can_export=excluded.can_export,can_share=excluded.can_share;
  end loop; result:='{"updated":true}';
 else raise exception 'Unknown command';end case;
 if kind in ('order.save','order.cancel','quote.convert','import.batch','master.save') then perform public.recalculate_targets(private.business_today()+7);end if;
 insert into private.commands(id,user_id,kind,result) values(op_id,auth.uid(),kind,coalesce(result,'{}'));
 return coalesce(result,'{}');end $$;
-- Public document access is by unguessable, expiring, revocable token only.
create or replace function public.shared_document(token uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare i public.invoices;q public.quotations;o public.orders;doc jsonb;cfg jsonb;begin
 select jsonb_build_object('company_name',value->'company_name','address',value->'address','phone',value->'phone','email',value->'email','website',value->'website','ntn',value->'ntn','bank_details',value->'bank_details','terms',value->'terms','signature_name',value->'signature_name') into cfg from public.settings where id='business';
 select * into i from public.invoices where share_token=token and share_expires_at>now();
 if found then select * into strict o from public.orders where id=i.order_id and status='confirmed' and deleted_at is null;
  select jsonb_build_object('type','invoice','settings',cfg,'document',to_jsonb(o)-'created_by'-'updated_by','invoice',to_jsonb(i)-'share_token','customer',(select to_jsonb(c)-'created_by'-'updated_by' from public.customers c where id=o.customer_id),'salesman',(select name from public.salesmen where id=o.salesman_id),'items',(select jsonb_agg(to_jsonb(l)-'cost_paisa'-'override_reason') from public.order_items l where order_id=o.id),'payments',(select coalesce(jsonb_agg(jsonb_build_object('date',p.date,'amount_paisa',p.amount_paisa,'method',p.method)),'[]') from public.payments p where invoice_id=i.id and voided_at is null)) into doc;return doc;
 end if;
 select * into q from public.quotations where share_token=token and share_expires_at>now() and deleted_at is null;
 if not found then raise exception 'Link expired or unavailable';end if;
 return jsonb_build_object('type','quote','settings',cfg,'document',to_jsonb(q)-'share_token'-'created_by'-'updated_by','customer',(select to_jsonb(c)-'created_by'-'updated_by' from public.customers c where id=q.customer_id),'salesman',(select name from public.salesmen where id=q.salesman_id),'items',(select jsonb_agg(to_jsonb(l)-'cost_paisa'-'override_reason') from public.quotation_items l where quotation_id=q.id),'payments','[]'::jsonb);
end $$;
revoke all on all functions in schema private from public,anon,authenticated;

revoke all on function public.apply_command(uuid,text,jsonb),public.recalculate_targets(date),public.app_settings(),public.stock_balances(),public.shared_document(uuid),public.is_admin(),public.has_permission(text,text),public.owns_salesman(text),public.can_document(text,text,text) from public,anon;
grant execute on function public.apply_command(uuid,text,jsonb),public.recalculate_targets(date),public.app_settings(),public.stock_balances(),public.is_admin(),public.has_permission(text,text),public.owns_salesman(text),public.can_document(text,text,text) to authenticated;
notify pgrst, 'reload schema';
