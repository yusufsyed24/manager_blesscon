-- Non-destructive migration of old business_sections payloads.
-- Run AFTER schema.sql and first_admin.sql. Originals are retained.
-- Run in SQL Editor as owner. Rerunnable; problems are listed at the end.
create table if not exists private.legacy_migrated(section text,legacy_key text,content_hash text,primary key(section,legacy_key));
create or replace function private.legacy_get(r jsonb,variadic names text[]) returns text language sql immutable set search_path='' as $$
 select value from jsonb_each_text(r) x where regexp_replace(lower(x.key),'[^a-z0-9]','','g')=any(select regexp_replace(lower(n),'[^a-z0-9]','','g') from unnest(names) n) and x.value is not null and x.value<>'' limit 1
$$;
create or replace function private.legacy_rows(payload jsonb,section text) returns setof jsonb language plpgsql set search_path='' as $$declare arr jsonb;row jsonb;h jsonb;r jsonb;i integer;begin
 if jsonb_typeof(payload)='array' then arr:=payload;
 elsif jsonb_typeof(payload->'rows')='array' then arr:=payload->'rows';
 elsif jsonb_typeof(payload->section)='array' then arr:=payload->section;
 elsif section='staff' and jsonb_typeof(payload->'salesmen')='array' then arr:=payload->'salesmen';
 elsif section='stock' and jsonb_typeof(payload->'movements')='array' then arr:=payload->'movements';
 else return next payload;return;end if;
 for row in select value from jsonb_array_elements(arr) loop
  if jsonb_typeof(row)='object' then return next row;
  elsif jsonb_typeof(row)='array' and jsonb_typeof(payload->'headers')='array' then
   r:='{}';i:=0;for h in select value from jsonb_array_elements(payload->'headers') loop r:=r||jsonb_build_object(h#>>'{}',row->i);i:=i+1;end loop;return next r;
  end if;
 end loop;end $$;
do $$declare adminid uuid;sec text;payload jsonb;r jsonb;rows jsonb;line jsonb;d jsonb;items jsonb;result jsonb;key text;hash text;pid text;cid text;sid text;name text;amount bigint;rate bigint;cost bigint;pack integer;boxes integer;ct integer;loose integer;day date;v integer;paid bigint;iid uuid;currentqty integer;desired integer;kind text;begin
 if to_regclass('public.business_sections') is null then raise notice 'No legacy business_sections table exists; nothing to migrate.';return;end if;
 select ur.user_id into adminid from public.user_roles ur join public.profiles p on p.id=ur.user_id and p.active where ur.role='admin' limit 1;
 if adminid is null then raise exception 'Create the first admin before migrating';end if;
 perform set_config('request.jwt.claim.sub',adminid::text,true);
 -- Deterministic ordering resolves references before transactions.
 foreach sec in array array['settings','products','staff','orders','invoices','quotes','stock','expenses'] loop
  execute 'select payload from public.business_sections where section=$1' into payload using sec;
  if payload is null then continue;end if;
  select coalesce(jsonb_agg(x),'[]') into rows from private.legacy_rows(payload,sec) x;
  -- Grid order rows are grouped by invoice number into line arrays.
  if sec in ('orders','invoices','quotes') then
   select coalesce(jsonb_agg(x),'[]') into rows from (
    select case when bool_or(rr ? 'lines' or rr ? 'items') then (jsonb_agg(rr)->0) else (jsonb_agg(rr)->0)||jsonb_build_object('lines',jsonb_agg(rr)) end x
    from jsonb_array_elements(rows) rr group by coalesce(private.legacy_get(rr,'Invoice ID','Invoice','number','id'),md5(rr::text))
   ) q;
  end if;
  for r in select value from jsonb_array_elements(rows) loop
   key:=coalesce(private.legacy_get(r,'id','code','Product ID','Invoice ID','number','Transaction ID'),md5(r::text));hash:=md5(r::text);
   if exists(select 1 from private.legacy_migrated where section=sec and legacy_key=key and content_hash=hash) then continue;end if;
   begin
    if sec='settings' then
     select value,version into d,v from public.settings where id='business';
     d:=d||jsonb_strip_nulls(jsonb_build_object('company_name',private.legacy_get(r,'businessName','company_name','Company Name'),'phone',private.legacy_get(r,'businessContact','phone')));
     perform private.save_master('settings',jsonb_build_object('id','business','value',d),v);
    elsif sec='products' then
     pid:=private.legacy_get(r,'code','Product ID','product_id','id');name:=private.legacy_get(r,'name','Product Name');if pid is null or name is null then raise exception 'Product ID or name missing';end if;
     select version into v from public.products where id=pid;
     d:=jsonb_build_object('id',pid,'name',name,'category',coalesce(private.legacy_get(r,'category'),''),'boxes_per_carton',coalesce(private.legacy_get(r,'perCarton','boxes_per_carton','Boxes/Carton'),'24')::integer,'cost_paisa',round(coalesce(private.legacy_get(r,'cost','Cost / box'),'0')::numeric*100),'retail_paisa',round(coalesce(private.legacy_get(r,'retail','Retail / box'),'0')::numeric*100),'wholesale_paisa',round(coalesce(private.legacy_get(r,'wholesale','WH 1-5 / box'),'230')::numeric*100),'active',coalesce((r->>'active')::boolean,true),'expiry_date',nullif(private.legacy_get(r,'expiry_date','Expiry Date','expiry'),'')::date);
     perform private.save_master('products',d,v);
     -- Current Rani defaults come from schema/settings. Historical sale rates are retained below.
    elsif sec='staff' then
     sid:=coalesce(private.legacy_get(r,'id','Salesman ID'),'SP-'||md5(coalesce(private.legacy_get(r,'name','Salesman'),'Unnamed')));name:=private.legacy_get(r,'name','Salesman');if name is null then raise exception 'Salesman name missing';end if;
     select version into v from public.salesmen where id=sid;
     perform private.save_master('salesmen',jsonb_build_object('id',sid,'name',name,'phone',coalesce(private.legacy_get(r,'phone'),''),'joining_date',coalesce(private.legacy_get(r,'joining_date','Joining Date'),current_date::text),'base_salary_paisa',round(coalesce(private.legacy_get(r,'salary','Base Salary'),'45000')::numeric*100),'monthly_target',coalesce(private.legacy_get(r,'monthly_target','Monthly Target'),'130')::numeric,'active',coalesce((r->>'active')::boolean,true)),v);
    elsif sec in ('orders','invoices','quotes') then
     key:=coalesce(private.legacy_get(r,'Invoice ID','number','id'),key);sid:=private.legacy_get(r,'staffId','salesman_id','Salesman ID');if not exists(select 1 from public.salesmen where id=sid) then sid:=null;end if;
     name:=coalesce(private.legacy_get(r,'customer','Customer Name','Shop'),'Legacy customer');cid:='LEG-CU-'||md5(name||coalesce(private.legacy_get(r,'phone','Customer Phone'),''));select version into v from public.customers where id=cid;
     perform private.save_master('customers',jsonb_build_object('id',cid,'name',name,'phone',coalesce(private.legacy_get(r,'phone','Customer Phone'),''),'email',coalesce(private.legacy_get(r,'email'),''),'address',coalesce(private.legacy_get(r,'address'),''),'salesman_id',sid),v);
     items:='[]';day:=coalesce(private.legacy_get(r,'date','Date'),current_date::text)::date;
     for line in select value from jsonb_array_elements(coalesce(r->'lines',r->'items','[]')) loop
      pid:=private.legacy_get(line,'code','product_id','Product ID');select boxes_per_carton,cost_paisa into pack,cost from public.products where id=pid;if not found then raise exception 'Unknown product %',pid;end if;
      ct:=coalesce(private.legacy_get(line,'cartons'),'0')::integer;loose:=coalesce(private.legacy_get(line,'boxes','loose_boxes','Loose Boxes'),'0')::integer;
      if ct=0 and loose=0 then boxes:=coalesce(private.legacy_get(line,'units','Total Boxes'),'0')::integer;ct:=boxes/pack;loose:=boxes%pack;end if;
      rate:=round(coalesce(private.legacy_get(line,'rate','Rate / box'),'0')::numeric*100);if rate=0 then select x.rate into rate from private.get_rate(pid,ct,'wholesale')x;end if;
      items:=items||jsonb_build_array(jsonb_build_object('product_id',pid,'cartons',ct,'loose_boxes',loose,'rate_paisa',rate,'cost_paisa',coalesce(round(private.legacy_get(line,'cost','costAtSale')::numeric*100),cost),'override_reason','Legacy migration: historical rate'));
     end loop;
     d:=jsonb_build_object('id',md5('legacy:'||key)::uuid,'number',key,'customer_id',cid,'salesman_id',sid,'date',day,'due_date',coalesce(private.legacy_get(r,'due_date','Due Date'),(day+7)::text)::date,'valid_until',greatest(day,coalesce(private.legacy_get(r,'valid','valid_until'),(day+7)::text)::date),'channel',case when lower(coalesce(private.legacy_get(r,'type','channel'),'wholesale'))='retail' then 'retail' else 'wholesale' end,'items',items,'discount_paisa',round(coalesce(private.legacy_get(r,'discount'),'0')::numeric*100),'notes',coalesce(private.legacy_get(r,'notes'),''));
     if sec='quotes' then select id,version into iid,v from public.quotations where number=key;else select id,version into iid,v from public.orders where number=key;end if;
     if iid is not null then d:=d||jsonb_build_object('id',iid,'version',v);end if;
     result:=private.save_document(d,sec='quotes',true);
     if sec<>'quotes' then
      select id into iid from public.invoices where order_id=(result->>'id')::uuid;
      if jsonb_typeof(r->'payments')='array' and jsonb_array_length(r->'payments')>0 then
       v:=0;for line in select value from jsonb_array_elements(r->'payments') loop v:=v+1;
        perform private.add_payment(jsonb_build_object('invoice_id',iid,'transaction_id','LEG-PAY-'||key||'-'||v,'date',coalesce(line->>'date',day::text),'amount_paisa',round((line->>'amount')::numeric*100),'method','Cash','reference',coalesce(line->>'note','Legacy payment'),'received_by','Legacy migration'),true);
       end loop;
      else
       paid:=round(coalesce(private.legacy_get(r,'paid','Received','Received*'),'0')::numeric*100);
       if paid>0 then perform private.add_payment(jsonb_build_object('invoice_id',iid,'transaction_id','LEG-RECEIVED-'||key,'date',day,'amount_paisa',paid,'method','Cash','reference','Legacy received balance; method not specified','received_by','Legacy migration'),true);end if;
      end if;
     end if;
    elsif sec='stock' then
     pid:=private.legacy_get(r,'code','product_id','Product ID');boxes:=coalesce(private.legacy_get(r,'delta','boxes','Total Boxes'),'0')::integer;kind:=lower(coalesce(private.legacy_get(r,'kind','Type'),'adjustment'));
     if boxes<>0 and kind not like 'sale%' then perform private.stock_entry(jsonb_build_object('transaction_id','LEG-ST-'||key,'product_id',pid,'date',coalesce(r->>'date',current_date::text),'boxes',boxes,'kind','adjustment','note',coalesce(r->>'note','Legacy movement')),true);end if;
    elsif sec='expenses' then
     select version into v from public.expenses where id=key;
     perform private.save_master('expenses',jsonb_build_object('id',key,'date',coalesce(r->>'date',current_date::text),'category',coalesce(r->>'category','Misc'),'description',coalesce(r->>'description','Legacy expense'),'amount_paisa',round(coalesce(private.legacy_get(r,'amount'),'0')::numeric*100),'method',coalesce(r->>'method','Cash')),v);
    end if;
    insert into private.legacy_migrated values(sec,key,hash) on conflict(section,legacy_key) do update set content_hash=excluded.content_hash;
   exception when others then insert into private.migration_errors(section,payload,error) values(sec,r,sqlerrm);end;
  end loop;
 end loop;
 -- The supplied old frontend's products.stock is CURRENT stock, not opening stock.
 -- Reconcile to that snapshot only on the first successful product migration, after sales are posted.
 execute 'select payload from public.business_sections where section=''products''' into payload;
 if payload is not null then for r in select * from private.legacy_rows(payload,'products') loop
  pid:=private.legacy_get(r,'code','Product ID','id');
  if r ? 'stock' and not exists(select 1 from private.legacy_migrated where section='stock_snapshot' and legacy_key=pid) then
   begin desired:=(r->>'stock')::integer;select coalesce(sum(sm.boxes),0) into currentqty from public.stock_movements sm where sm.product_id=pid;
    if desired<>currentqty then perform private.stock_entry(jsonb_build_object('transaction_id','LEG-SNAPSHOT-'||pid,'product_id',pid,'date',current_date,'boxes',desired-currentqty,'kind','adjustment','note','Reconciled to legacy current-stock snapshot'),true);end if;
    insert into private.legacy_migrated values('stock_snapshot',pid,md5(r::text));
   exception when others then insert into private.migration_errors(section,payload,error) values('stock_snapshot',r,sqlerrm);end;
  end if;
 end loop;end if;
 perform public.recalculate_targets(current_date+7);
end $$;
-- Resolve all rows below before treating migration as complete. Original payloads remain untouched.
select section,error,created_at from private.migration_errors order by id;
select section,count(*) as migrated_records from private.legacy_migrated group by section;
revoke all on function private.legacy_get(jsonb,text[]),private.legacy_rows(jsonb,text) from public,anon,authenticated;
