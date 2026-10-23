-- Blesscon Candy Business Manager v54 migration (corrected execution instructions)
-- IMPORTANT: Run this as a normal SQL script in Supabase SQL Editor.
-- Do NOT choose the UI option "Run and enable RLS"; this migration contains
-- explicit ALTER TABLE ... ENABLE ROW LEVEL SECURITY statements and that UI
-- option may inject invalid ALTER TABLE statements into DO $$ blocks.
-- Run the whole file from beginning to end; do not paste only a partial selection.

-- Blesscon Candy Business Manager v54 additive connected-workflow migration (includes v53 baseline safeguards).
-- Safe to rerun. Does not reset business data, products, pricing, stock, accounts or history.

alter table public.salesmen add column if not exists date_of_birth date;
alter table public.salesmen add column if not exists manager_user_id uuid references auth.users(id) on delete set null;
alter table public.salesmen add column if not exists territory text;
alter table public.salesmen add column if not exists area text;
alter table public.attendance_records add column if not exists remarks text not null default '';
alter table public.employee_documents drop constraint if exists employee_documents_document_type_check;
alter table public.employee_documents add constraint employee_documents_document_type_check check (document_type in ('identity','education','employment','other'));

create index if not exists salesmen_manager_active_idx on public.salesmen(manager_user_id, active) where deleted_at is null;
do $$ begin
  if exists(select 1 from public.salesmen where deleted_at is null group by lower(id) having count(*)>1) then
    raise exception 'Duplicate active employee IDs differing only by case exist. Reconcile these IDs before applying v54.';
  end if;
end $$;
create unique index if not exists salesmen_employee_id_ci_unique on public.salesmen(lower(id)) where deleted_at is null;

-- Canonical area catalogue: Admin maintains area definitions; Managers assign only active areas.
create table if not exists public.sales_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sales_areas_name_ci_unique on public.sales_areas(lower(name));
alter table public.sales_areas enable row level security;
revoke all on public.sales_areas from anon, authenticated;
grant select, insert, update on public.sales_areas to authenticated;
drop policy if exists sales_areas_read on public.sales_areas;
drop policy if exists sales_areas_read on public.sales_areas;
create policy sales_areas_read on public.sales_areas for select to authenticated using (public.is_admin() or public.is_manager());
drop policy if exists sales_areas_admin_write on public.sales_areas;
drop policy if exists sales_areas_admin_write on public.sales_areas;
create policy sales_areas_admin_write on public.sales_areas for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Preserve existing territory labels as catalogue entries without renaming or rewriting employees.
with existing_territories as (
  select min(trim(coalesce(nullif(territory,''),nullif(area,'')))) as name
  from public.salesmen
  where length(trim(coalesce(nullif(territory,''),nullif(area,''),'')))>0 and deleted_at is null
  group by lower(trim(coalesce(nullif(territory,''),nullif(area,''))))
)
insert into public.sales_areas(name, created_by)
select a.name, null from existing_territories a
where not exists(select 1 from public.sales_areas existing where lower(existing.name)=lower(a.name));

-- Effective-dated area assignments preserve the historical area for reporting.
create table if not exists public.salesman_area_assignments (
  id uuid primary key default gen_random_uuid(),
  salesman_id text not null references public.salesmen(id) on delete restrict,
  area_name text not null check (length(trim(area_name)) > 0),
  effective_from date not null,
  effective_to date,
  instructions text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create index if not exists salesman_area_assignments_effective_idx
  on public.salesman_area_assignments(salesman_id, effective_from desc, effective_to);
create unique index if not exists salesman_area_assignment_no_duplicate_start
  on public.salesman_area_assignments(salesman_id, effective_from, area_name);
alter table public.salesman_area_assignments enable row level security;
revoke all on public.salesman_area_assignments from anon, authenticated;
grant select, insert, update on public.salesman_area_assignments to authenticated;
drop policy if exists salesman_area_assignments_read on public.salesman_area_assignments;
drop policy if exists salesman_area_assignments_read on public.salesman_area_assignments;
create policy salesman_area_assignments_read on public.salesman_area_assignments for select to authenticated
  using (public.is_admin() or public.owns_salesman(salesman_id) or exists (
    select 1 from public.salesmen sm where sm.id = salesman_area_assignments.salesman_id
      and sm.manager_user_id = auth.uid() and public.is_manager()
  ));
drop policy if exists salesman_area_assignments_manage on public.salesman_area_assignments;
drop policy if exists salesman_area_assignments_manage on public.salesman_area_assignments;
create policy salesman_area_assignments_manage on public.salesman_area_assignments for all to authenticated
  using (public.is_admin() or (public.is_manager() and exists (
    select 1 from public.salesmen sm where sm.id = salesman_area_assignments.salesman_id and sm.manager_user_id = auth.uid()
  )))
  with check (public.is_admin() or (public.is_manager() and created_by = auth.uid() and exists (
    select 1 from public.salesmen sm where sm.id = salesman_area_assignments.salesman_id and sm.manager_user_id = auth.uid()
  )));

-- Persistent notifications. Salesmen may only read/mark their own messages as read.
create table if not exists public.employee_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_salesman_id text not null references public.salesmen(id) on delete cascade,
  title text not null default '',
  message text not null check (length(trim(message)) > 0),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  requires_acknowledgement boolean not null default false,
  acknowledged_at timestamptz,
  read_at timestamptz,
  expires_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists employee_notifications_recipient_idx
  on public.employee_notifications(recipient_salesman_id, created_at desc);
alter table public.employee_notifications enable row level security;
revoke all on public.employee_notifications from anon, authenticated;
grant select on public.employee_notifications to authenticated;
revoke update on public.employee_notifications from authenticated;
grant update (read_at, acknowledged_at) on public.employee_notifications to authenticated;
grant insert on public.employee_notifications to authenticated;
drop policy if exists employee_notifications_read on public.employee_notifications;
drop policy if exists employee_notifications_read on public.employee_notifications;
create policy employee_notifications_read on public.employee_notifications for select to authenticated
  using (public.is_admin() or public.owns_salesman(recipient_salesman_id) or exists (
    select 1 from public.salesmen sm where sm.id = employee_notifications.recipient_salesman_id
      and sm.manager_user_id = auth.uid() and public.is_manager()
  ));
drop policy if exists employee_notifications_send on public.employee_notifications;
drop policy if exists employee_notifications_send on public.employee_notifications;
create policy employee_notifications_send on public.employee_notifications for insert to authenticated
  with check (created_by = auth.uid() and (public.is_admin() or (public.is_manager() and exists (
    select 1 from public.salesmen sm where sm.id = employee_notifications.recipient_salesman_id and sm.manager_user_id = auth.uid()
  ))));
drop policy if exists employee_notifications_read_update on public.employee_notifications;
drop policy if exists employee_notifications_read_update on public.employee_notifications;
create policy employee_notifications_read_update on public.employee_notifications for update to authenticated
  using (public.is_admin() or public.owns_salesman(recipient_salesman_id))
  with check (public.is_admin() or public.owns_salesman(recipient_salesman_id));

-- Manager-controlled employee profile/document/attendance rules. Preserve reads of own attendance/documents.
-- Remove legacy policies that allowed salesmen to write their own attendance or employee documents.
drop policy if exists attendance_self_insert on public.attendance_records;
drop policy if exists attendance_self_update on public.attendance_records;
drop policy if exists employee_documents_self_insert on public.employee_documents;
drop policy if exists salesman_photo_self_update on public.salesmen;
revoke insert, update on public.attendance_records from authenticated;
grant select on public.attendance_records to authenticated;
grant insert, update on public.attendance_records to authenticated;
drop policy if exists attendance_self_select on public.attendance_records;
drop policy if exists attendance_read_self_or_team on public.attendance_records;
drop policy if exists attendance_read_self_or_team on public.attendance_records;
create policy attendance_read_self_or_team on public.attendance_records for select to authenticated
  using (public.is_admin() or public.owns_salesman(salesman_id) or exists (select 1 from public.salesmen sm where sm.id = attendance_records.salesman_id and sm.manager_user_id = auth.uid() and public.is_manager()));
drop policy if exists attendance_manager_admin_write on public.attendance_records;
drop policy if exists attendance_manager_admin_write on public.attendance_records;
create policy attendance_manager_admin_write on public.attendance_records for all to authenticated
  using (public.is_admin() or (public.is_manager() and exists (
    select 1 from public.salesmen sm where sm.id = attendance_records.salesman_id and sm.manager_user_id = auth.uid()
  )))
  with check (public.is_admin() or (public.is_manager() and exists (
    select 1 from public.salesmen sm where sm.id = attendance_records.salesman_id and sm.manager_user_id = auth.uid()
  )));

revoke insert on public.employee_documents from authenticated;
grant select, insert, delete on public.employee_documents to authenticated;
drop policy if exists employee_documents_self_select on public.employee_documents;
drop policy if exists employee_documents_read_self_or_team on public.employee_documents;
create policy employee_documents_read_self_or_team on public.employee_documents for select to authenticated
  using (public.is_admin() or public.owns_salesman(salesman_id) or exists (select 1 from public.salesmen sm where sm.id = employee_documents.salesman_id and sm.manager_user_id = auth.uid() and public.is_manager()));
drop policy if exists employee_documents_manager_admin_write on public.employee_documents;
drop policy if exists employee_documents_manager_admin_write on public.employee_documents;
create policy employee_documents_manager_admin_write on public.employee_documents for all to authenticated
  using (public.is_admin() or (public.is_manager() and exists (
    select 1 from public.salesmen sm where sm.id = employee_documents.salesman_id and sm.manager_user_id = auth.uid()
  )))
  with check (public.is_admin() or (public.is_manager() and exists (
    select 1 from public.salesmen sm where sm.id = employee_documents.salesman_id and sm.manager_user_id = auth.uid()
  )));

-- A salesman can no longer change the profile photo path or protected identity fields.
revoke update (photo_path) on public.salesmen from authenticated;
-- Defense in depth even if a broad table-level UPDATE grant exists from an older migration.
create or replace function private.protect_salesman_identity_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_admin() or public.is_manager()) and public.owns_salesman(old.id) and (
    (to_jsonb(new)->'name') is distinct from (to_jsonb(old)->'name') or
    (to_jsonb(new)->'date_of_birth') is distinct from (to_jsonb(old)->'date_of_birth') or
    (to_jsonb(new)->'photo_path') is distinct from (to_jsonb(old)->'photo_path') or
    (to_jsonb(new)->'phone') is distinct from (to_jsonb(old)->'phone') or
    (to_jsonb(new)->'territory') is distinct from (to_jsonb(old)->'territory') or
    (to_jsonb(new)->'area') is distinct from (to_jsonb(old)->'area') or
    (to_jsonb(new)->'user_id') is distinct from (to_jsonb(old)->'user_id') or
    (to_jsonb(new)->'id') is distinct from (to_jsonb(old)->'id')
  ) then
    raise exception 'Salesman identity fields are managed by authorized management';
  end if;
  return new;
end $$;
drop trigger if exists protect_salesman_identity_fields on public.salesmen;
create trigger protect_salesman_identity_fields before update on public.salesmen
  for each row execute function private.protect_salesman_identity_fields();
-- Existing manager/admin policies remain responsible for authorized salesman profile updates.

-- Employee private storage: no salesman uploads/deletes. Admins and the assigned manager manage employee files.
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists employee_private_read on storage.objects';
    execute 'create policy employee_private_read on storage.objects for select to authenticated using (bucket_id = ''employee-private'' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text or (public.is_manager() and exists (select 1 from public.salesmen sm where sm.manager_user_id = auth.uid() and sm.user_id::text = (storage.foldername(name))[1]))))';
    execute 'drop policy if exists employee_private_insert on storage.objects';
    execute 'create policy employee_private_insert on storage.objects for insert to authenticated with check (bucket_id = ''employee-private'' and (public.is_admin() or (public.is_manager() and exists (select 1 from public.salesmen sm where sm.manager_user_id = auth.uid() and sm.user_id::text = (storage.foldername(name))[1]))))';
    execute 'drop policy if exists employee_private_delete on storage.objects';
    execute 'create policy employee_private_delete on storage.objects for delete to authenticated using (bucket_id = ''employee-private'' and (public.is_admin() or (public.is_manager() and exists (select 1 from public.salesmen sm where sm.manager_user_id = auth.uid() and sm.user_id::text = (storage.foldername(name))[1]))))';
  end if;
end $$;

notify pgrst, 'reload schema';


-- Connected Admin -> Manager -> Salesman workflow. Managers may create/edit only their assigned team,
-- and cannot alter salary, login linkage, or other restricted employee account fields.
create or replace function private.save_master(t text,r jsonb,expected integer default null) returns jsonb
language plpgsql set search_path='' as $$
declare allowed text[]; k text; old jsonb; result jsonb; cols text:=''; vals text:=''; updates text:=''; rid text:=r->>'id'; adm boolean:=public.is_admin(); mgr boolean:=public.is_manager();
begin
case t
 when 'products' then allowed:=array['id','name','category','boxes_per_carton','cost_paisa','retail_paisa','wholesale_paisa','expiry_date','active'];
 when 'price_tiers' then allowed:=array['id','product_id','min_cartons','label','rate_paisa'];
 when 'salesmen' then
   if mgr and not adm then
     allowed:=array['id','name','phone','date_of_birth','joining_date','monthly_target','active','off_days','manager_user_id'];
   else
     allowed:=array['id','name','phone','user_id','joining_date','date_of_birth','manager_user_id','base_salary_paisa','monthly_target','active','off_days'];
   end if;
 when 'customers' then allowed:=array['id','name','phone','email','address','salesman_id'];
 when 'expenses' then allowed:=array['id','date','category','description','amount_paisa','method','cashbook_account_key','attachment_path','salesman_id','salary_period'];
 when 'settings' then allowed:=array['id','value'];
 else raise exception 'Unsupported table'; end case;
if not adm and not (mgr and t='salesmen' or (t in ('products','price_tiers') and public.has_permission('products','edit')) or t='customers' or (t='expenses' and public.has_permission('expenses','create'))) then raise exception 'Admin or authorized Manager required'; end if;
if rid is null or length(rid)>180 then raise exception 'Valid record ID required'; end if;
execute format('select to_jsonb(x) from public.%I x where id=$1 for update',t) into old using rid;
if old is not null and expected is distinct from (old->>'version')::integer then raise exception 'CONFLICT: Record changed; refresh and review before saving'; end if;
if mgr and not adm and t='salesmen' then
  if coalesce(r->>'manager_user_id','')<>auth.uid()::text then raise exception 'Managers may assign employees only to their own account'; end if;
  if old is not null and coalesce(old->>'manager_user_id','')<>auth.uid()::text then raise exception 'Cannot edit a salesman assigned to another manager'; end if;
end if;
if not adm and old is not null and old->>'created_by'<>auth.uid()::text and not (mgr and t='salesmen' and old->>'manager_user_id'=auth.uid()::text) then raise exception 'Cannot edit another user record'; end if;
if t='salesmen' and (r->>'joining_date')::date < date '2000-01-01' then raise exception 'Joining date before 2000 is not supported'; end if;
if mgr and not adm and t='salesmen' then r:=r||jsonb_build_object('manager_user_id',auth.uid()); end if;
if t='settings' then
 if rid<>'business' or jsonb_typeof(r->'value')<>'object' or jsonb_array_length(r->'value'->'working_days')=0 or jsonb_array_length(r->'value'->'tiers')=0 then raise exception 'Settings require working days and tiers'; end if;
 if exists(select 1 from jsonb_array_elements(r->'value'->'tiers') v where (v->>'min')::numeric<0 or (v->>'rate_paisa')::bigint<0) then raise exception 'Invalid tier'; end if;
 if not exists(select 1 from jsonb_array_elements(r->'value'->'tiers') v where (v->>'min')::numeric=0) then raise exception 'First tier must start at zero'; end if;
end if;
r:=(select jsonb_object_agg(key,value) from jsonb_each(r) where key=any(allowed));
foreach k in array allowed loop if r ? k then cols:=cols||format('%I,',k); vals:=vals||format('(jsonb_populate_record(null::public.%I,$1)).%I,',t,k); if k<>'id' then updates:=updates||format('%I=excluded.%I,',k,k); end if; end if; end loop;
if old is null then
 execute format('insert into public.%I (%s updated_by%s) select %s $2%s returning to_jsonb(%I.*)',t,cols,case when t='settings' then '' else ',created_by' end,vals,case when t='settings' then '' else ',$2' end,t) into result using r,auth.uid();
else
 execute format('insert into public.%I (%s updated_by) select %s $2 on conflict(id) do update set %s version=%I.version+1,updated_by=$2,updated_at=now() returning to_jsonb(%I.*)',t,cols,vals,updates||case when t='settings' then '' else 'deleted_at=null,' end,t,t) into result using r,auth.uid();
end if;
return result;
end $$;

-- Attendance correction remarks are retained and the one-row-per-day constraint remains authoritative.
create index if not exists employee_notifications_unread_idx on public.employee_notifications(recipient_salesman_id, read_at) where read_at is null;
notify pgrst, 'reload schema';


-- Manager/admin-only RPC for replacing a salesman profile photo. Salesmen cannot change identity media.
create or replace function public.set_salesman_photo(p_salesman_id text, p_photo_path text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not (public.is_admin() or (public.is_manager() and exists(select 1 from public.salesmen s where s.id=p_salesman_id and s.manager_user_id=auth.uid() and s.active and s.deleted_at is null))) then
    raise exception 'Only Admin or the assigned Manager may update this profile photo';
  end if;
  if p_photo_path is null or length(p_photo_path)>1024 or p_photo_path !~ ('^'||(select user_id::text from public.salesmen where id=p_salesman_id)||'/salesman-profile-') then
    raise exception 'Invalid private profile photo path';
  end if;
  update public.salesmen set photo_path=p_photo_path, updated_at=now(), updated_by=auth.uid(), version=version+1 where id=p_salesman_id;
  if not found then raise exception 'Salesman not found'; end if;
end $$;
revoke all on function public.set_salesman_photo(text,text) from public, anon;
grant execute on function public.set_salesman_photo(text,text) to authenticated;
notify pgrst, 'reload schema';


-- Audit attendance corrections and employee workflow records.
do $$ declare t text; begin
  foreach t in array array['attendance_records','employee_documents','customer_visits','salesman_area_assignments','employee_notifications'] loop
    execute format('drop trigger if exists audit_change on public.%I', t);
    execute format('create trigger audit_change after insert or update or delete on public.%I for each row execute function private.audit_change()', t);
  end loop;
end $$;
notify pgrst, 'reload schema';


-- Atomic area assignment: preserve history, prevent contradictory overlapping assignments,
-- and keep the current salesman area fields aligned with the effective assignment.
create or replace function public.assign_salesman_area(
  p_salesman_id text, p_area_name text, p_effective_from date, p_effective_to date default null, p_instructions text default ''
) returns uuid language plpgsql security definer set search_path='' as $$
declare seller public.salesmen; assignment_id uuid; existing record;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_manager()) then raise exception 'Admin or Manager access required'; end if;
  select * into seller from public.salesmen where id=p_salesman_id and deleted_at is null for update;
  if not found then raise exception 'Salesman not found'; end if;
  if public.is_manager() and not public.is_admin() and seller.manager_user_id<>auth.uid() then raise exception 'Salesman is outside your assigned team'; end if;
  if p_area_name is null or length(trim(p_area_name))=0 then raise exception 'Area name is required'; end if;
  if not exists(select 1 from public.sales_areas a where lower(a.name)=lower(trim(p_area_name)) and a.active) then raise exception 'Choose an active area from the Admin area catalogue'; end if;
  if p_effective_from is null or (p_effective_to is not null and p_effective_to<p_effective_from) then raise exception 'Invalid effective dates'; end if;
  for existing in select id,effective_from,effective_to from public.salesman_area_assignments where salesman_id=p_salesman_id and effective_from<>p_effective_from and daterange(effective_from,coalesce(effective_to,'infinity'::date),'[]') && daterange(p_effective_from,coalesce(p_effective_to,'infinity'::date),'[]') for update loop
    if existing.effective_from < p_effective_from then
      update public.salesman_area_assignments set effective_to=p_effective_from-1,updated_at=now() where id=existing.id;
    else
      raise exception 'This area assignment overlaps a later assignment. Choose an end date before that assignment or edit the existing assignment.';
    end if;
  end loop;
  select id into assignment_id from public.salesman_area_assignments where salesman_id=p_salesman_id and effective_from=p_effective_from limit 1;
  if assignment_id is null then
    insert into public.salesman_area_assignments(salesman_id,area_name,effective_from,effective_to,instructions,created_by)
    values(p_salesman_id,trim(p_area_name),p_effective_from,p_effective_to,coalesce(p_instructions,''),auth.uid()) returning id into assignment_id;
  else
    update public.salesman_area_assignments set area_name=trim(p_area_name),effective_to=p_effective_to,instructions=coalesce(p_instructions,''),updated_at=now() where id=assignment_id;
  end if;
  if p_effective_from <= private.business_today() and (p_effective_to is null or p_effective_to>=private.business_today()) then
    update public.salesmen set territory=trim(p_area_name),area=trim(p_area_name),updated_by=auth.uid(),updated_at=now(),version=version+1 where id=p_salesman_id;
  end if;
  return assignment_id;
end $$;
revoke all on function public.assign_salesman_area(text,text,date,date,text) from public,anon;
grant execute on function public.assign_salesman_area(text,text,date,date,text) to authenticated;
notify pgrst, 'reload schema';

-- Tighten the business snapshot for the intended three-role flow. Manager queries are scoped
-- to assigned salesmen; global financial records remain admin/explicit-permission only.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def;
  nd := def;
  -- Salesman roster and targets: assigned team only, not every salesman with stock permission.
  nd := replace(nd,
    'where public.is_admin() or public.is_manager() or public.owns_salesman(x.id) or public.has_permission(''stock'')',
    'where public.is_admin() or public.owns_salesman(x.id) or (public.is_manager() and x.manager_user_id=auth.uid())');
  nd := replace(nd,
    'where public.is_admin() or public.owns_salesman(x.id) or public.has_permission(''stock'')',
    'where public.is_admin() or public.owns_salesman(x.id) or (public.is_manager() and x.manager_user_id=auth.uid())');
  nd := replace(nd,
    'where public.is_admin() or public.is_manager() or public.owns_salesman(x.salesman_id)',
    'where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid()))');
  nd := replace(nd,
    'where public.is_admin() or public.owns_salesman(x.salesman_id)',
    'where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid()))');
  -- Customers and sales documents are visible to the assigned Manager only for their team.
  nd := replace(nd,
    'where public.is_admin() or public.owns_salesman(x.salesman_id) or (x.created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active))',
    'where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid())) or (x.created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active))');
  nd := replace(nd,
    'where public.can_document(x.salesman_id,''orders'')',
    'where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and (exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid()) or (x.salesman_id is null and x.created_by=auth.uid()))) or public.has_permission(''orders'')');
  nd := replace(nd,
    'where public.can_document(o.salesman_id,''orders'')',
    'where public.is_admin() or public.owns_salesman(o.salesman_id) or (public.is_manager() and (exists(select 1 from public.salesmen sm where sm.id=o.salesman_id and sm.manager_user_id=auth.uid()) or (o.salesman_id is null and o.created_by=auth.uid()))) or public.has_permission(''orders'')');
  -- Invoice/payment values are limited to Admin, explicit invoice permission, the salesman's own
  -- records, and the Manager's own direct-sale records. Team-wide financial values are not exposed.
  nd := replace(nd,
    'where public.can_document(o.salesman_id,''invoices'')',
    'where public.is_admin() or public.has_permission(''invoices'') or public.owns_salesman(o.salesman_id) or (public.is_manager() and o.salesman_id is null and o.created_by=auth.uid())');
  nd := replace(nd,
    'where public.can_document(o.salesman_id,''invoices'')',
    'where public.is_admin() or public.has_permission(''invoices'') or public.owns_salesman(o.salesman_id) or (public.is_manager() and o.salesman_id is null and o.created_by=auth.uid())');
  -- Team stock and closing records are scoped by manager assignment, never by broad stock permission.
  nd := replace(nd,
    'where public.is_admin() or public.owns_salesman(x.salesman_id) or public.has_permission(''stock'')',
    'where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid())) or (not public.is_manager() and public.has_permission(''stock''))');
  nd := replace(nd,
    'where public.is_admin() or public.owns_salesman(x.salesman_id) or public.has_permission(''closing'')',
    'where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid())) or public.has_permission(''closing'')');
  -- Remove cost and wholesale prices from non-admin/non-pricing users and hide tier rates unless authorized.
  nd := replace(nd,
    'case when privileged then to_jsonb(x) else to_jsonb(x)-''cost_paisa'' end',
    'case when public.is_admin() or public.has_permission(''products'') then to_jsonb(x) else to_jsonb(x)-array[''cost_paisa''] end');
  nd := replace(nd,
    'from public.price_tiers x where exists(select 1 from public.products p where p.id=x.product_id and (public.is_admin() or public.has_permission(''products'') or public.has_permission(''stock'') or exists(select 1 from public.salesmen s where s.user_id=auth.uid() and s.active)))',
    'from public.price_tiers x where public.is_admin() or public.has_permission(''products'')');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 role-scoped business snapshot updated';
  else raise notice 'v54 snapshot was already updated or requires manual review'; end if;
end $$;
notify pgrst, 'reload schema';

-- Strip monetary values from non-admin snapshots for sales orders and line items. The backend
-- remains authoritative for calculations; the client receives quantities for operational views.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def;
  nd := def;
  nd := replace(nd,
    '''orders'',(select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.orders x where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and (exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid()) or (x.salesman_id is null and x.created_by=auth.uid()))) or public.has_permission(''orders''))',
    '''orders'',(select coalesce(jsonb_agg(case when public.is_admin() or public.has_permission(''invoices'') or (public.is_manager() and x.salesman_id is null and x.created_by=auth.uid()) then to_jsonb(x) else to_jsonb(x)-array[''subtotal_paisa'',''discount_paisa'',''total_paisa''] end),''[]''::jsonb) from public.orders x where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and (exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid()) or (x.salesman_id is null and x.created_by=auth.uid()))) or public.has_permission(''orders''))');
  nd := replace(nd,
    '''order_items'',(select coalesce(jsonb_agg(case when privileged then to_jsonb(x) else to_jsonb(x)-''cost_paisa'' end),''[]''::jsonb) from public.order_items x join public.orders o on o.id=x.order_id where public.is_admin() or public.owns_salesman(o.salesman_id) or (public.is_manager() and (exists(select 1 from public.salesmen sm where sm.id=o.salesman_id and sm.manager_user_id=auth.uid()) or (o.salesman_id is null and o.created_by=auth.uid()))) or public.has_permission(''orders''))',
    '''order_items'',(select coalesce(jsonb_agg(case when public.is_admin() or public.has_permission(''invoices'') or (public.is_manager() and o.salesman_id is null and o.created_by=auth.uid()) then to_jsonb(x) else to_jsonb(x)-array[''cost_paisa'',''rate_paisa'',''unit_price_paisa'',''total_paisa'',''line_total_paisa'',''amount_paisa''] end),''[]''::jsonb) from public.order_items x join public.orders o on o.id=x.order_id where public.is_admin() or public.owns_salesman(o.salesman_id) or (public.is_manager() and (exists(select 1 from public.salesmen sm where sm.id=o.salesman_id and sm.manager_user_id=auth.uid()) or (o.salesman_id is null and o.created_by=auth.uid()))) or public.has_permission(''orders''))');
  -- Keep invoice/payment amounts out of the Manager's team view. Admins and explicit invoice
  -- permission holders retain full financial data; Manager direct sales remain available to that Manager.
  nd := replace(nd,
    'public.is_admin() or public.has_permission(''invoices'') or public.owns_salesman(o.salesman_id) or (public.is_manager() and o.salesman_id is null and o.created_by=auth.uid())',
    'public.is_admin() or public.has_permission(''invoices'') or (public.is_manager() and o.salesman_id is null and o.created_by=auth.uid())');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 monetary fields scoped in business snapshot';
  else raise notice 'v54 monetary snapshot fields already scoped or require manual review'; end if;
end $$;
notify pgrst, 'reload schema';

-- Compatibility variants for installations where manager_role.sql broadened snapshot clauses earlier.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def;
  nd := def;
  nd := replace(nd,
    'where public.is_admin() or public.is_manager() or public.owns_salesman(x.salesman_id) or (x.created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active))',
    'where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid())) or (x.created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active))');
  nd := replace(nd,
    'from public.price_tiers x where exists(select 1 from public.products p where p.id=x.product_id and (public.is_admin() or public.is_manager() or public.has_permission(''products'') or public.has_permission(''stock'') or exists(select 1 from public.salesmen s where s.user_id=auth.uid() and s.active)))',
    'from public.price_tiers x where public.is_admin() or public.has_permission(''products'')');
  nd := replace(nd,
    'where public.is_admin() or public.is_manager() or public.owns_salesman(x.salesman_id) or public.has_permission(''stock'')',
    'where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid())) or (not public.is_manager() and public.has_permission(''stock''))');
  nd := replace(nd,
    'where public.is_admin() or public.is_manager() or public.owns_salesman(x.salesman_id) or public.has_permission(''closing'')',
    'where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid())) or public.has_permission(''closing'')');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 applied compatibility scoping for manager_role snapshot variants'; end if;
end $$;
notify pgrst, 'reload schema';

-- Add attendance to the shared snapshot so the manager dashboard and attendance summaries
-- use the same persisted records as the read-only salesman history.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def;
  nd := replace(def,
    '''user_permissions'',(select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.user_permissions x where x.user_id=auth.uid() or public.is_admin()),',
    '''user_permissions'',(select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.user_permissions x where x.user_id=auth.uid() or public.is_admin()),' || chr(10) ||
    '    ''attendance_records'',(select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.attendance_records x where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid()))),');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 attendance records added to scoped snapshot'; end if;
end $$;
notify pgrst, 'reload schema';


-- Return only the authenticated salesman's own monthly compensation estimate/posted amount.
-- Salary formula is taken from the existing settings incentives; no arbitrary formula is introduced.
create or replace function public.own_salary_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare seller public.salesmen; cfg jsonb; period_start date; achieved numeric:=0; pct numeric:=0; incentive bigint:=0; posted bigint; result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into seller from public.salesmen where user_id=auth.uid() and active and deleted_at is null limit 1;
  if not found then raise exception 'No active salesman profile is linked to this login'; end if;
  period_start := date_trunc('month', private.business_today())::date;
  select value into cfg from public.settings where id='business';
  select coalesce(sum(achieved_cartons),0) into achieved from public.salesman_daily_targets where salesman_id=seller.id and date between period_start and private.business_today();
  pct := case when coalesce(seller.monthly_target,0)>0 then achieved / seller.monthly_target * 100 else 0 end;
  select coalesce((x->>'amount_paisa')::bigint,0) into incentive
    from jsonb_array_elements(coalesce(cfg->'incentives','[]'::jsonb)) x
    where coalesce((x->>'min')::numeric,0)<=pct
    order by coalesce((x->>'min')::numeric,0) desc limit 1;
  incentive := coalesce(incentive,0);
  select amount_paisa into posted from public.expenses where salesman_id=seller.id and salary_period=to_char(period_start,'YYYY-MM') and deleted_at is null limit 1;
  result := jsonb_build_object(
    'salary_period',to_char(period_start,'YYYY-MM'),
    'status',case when posted is null then 'estimate' else 'posted' end,
    'base_salary_paisa',seller.base_salary_paisa,
    'incentive_paisa',case when posted is null then incentive else greatest(0,posted-seller.base_salary_paisa) end,
    'total_paisa',coalesce(posted,seller.base_salary_paisa+incentive),
    'monthly_target',seller.monthly_target,
    'achieved_cartons',achieved,
    'achievement_percent',pct
  );
  return result;
end $$;
revoke all on function public.own_salary_snapshot() from public, anon;
grant execute on function public.own_salary_snapshot() to authenticated;
notify pgrst, 'reload schema';

-- Finalize monetary redaction after compatibility substitutions have normalized the snapshot text.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def;
  nd := def;
  nd := replace(nd,
    '''order_items'',(select coalesce(jsonb_agg(case when public.is_admin() or public.has_permission(''products'') then to_jsonb(x) else to_jsonb(x)-array[''cost_paisa''] end),''[]''::jsonb) from public.order_items x join public.orders o on o.id=x.order_id where public.is_admin() or public.owns_salesman(o.salesman_id) or (public.is_manager() and (exists(select 1 from public.salesmen sm where sm.id=o.salesman_id and sm.manager_user_id=auth.uid()) or (o.salesman_id is null and o.created_by=auth.uid()))) or public.has_permission(''orders''))',
    '''order_items'',(select coalesce(jsonb_agg(case when public.is_admin() or public.has_permission(''invoices'') or (public.is_manager() and o.salesman_id is null and o.created_by=auth.uid()) then to_jsonb(x) else to_jsonb(x)-array[''cost_paisa'',''rate_paisa'',''unit_price_paisa'',''total_paisa'',''line_total_paisa'',''amount_paisa''] end),''[]''::jsonb) from public.order_items x join public.orders o on o.id=x.order_id where public.is_admin() or public.owns_salesman(o.salesman_id) or (public.is_manager() and (exists(select 1 from public.salesmen sm where sm.id=o.salesman_id and sm.manager_user_id=auth.uid()) or (o.salesman_id is null and o.created_by=auth.uid()))) or public.has_permission(''orders''))');
  nd := replace(nd,
    '''quotations'',(select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.quotations x where public.can_document(x.salesman_id,''quotes''))',
    '''quotations'',(select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.quotations x where public.is_admin() or public.has_permission(''quotes''))');
  nd := replace(nd,
    '''quotation_items'',(select coalesce(jsonb_agg(case when public.is_admin() or public.has_permission(''products'') then to_jsonb(x) else to_jsonb(x)-array[''cost_paisa''] end),''[]''::jsonb) from public.quotation_items x join public.quotations q on q.id=x.quotation_id where public.can_document(q.salesman_id,''quotes''))',
    '''quotation_items'',(select coalesce(jsonb_agg(case when public.is_admin() or public.has_permission(''quotes'') then to_jsonb(x) else to_jsonb(x)-array[''cost_paisa'',''rate_paisa'',''unit_price_paisa'',''total_paisa'',''line_total_paisa'',''amount_paisa''] end),''[]''::jsonb) from public.quotation_items x join public.quotations q on q.id=x.quotation_id where public.is_admin() or public.has_permission(''quotes''))');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 final snapshot monetary redaction applied'; end if;
end $$;
notify pgrst, 'reload schema';

-- Permission to view invoices is never a company-wide bypass: keep it scoped to the user's
-- own salesman records or the Manager's assigned team. Admin remains company-wide.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def;
  nd := replace(def,
    'where public.is_admin() or public.has_permission(''invoices'') or (public.is_manager() and o.salesman_id is null and o.created_by=auth.uid())',
    'where public.is_admin() or (public.has_permission(''invoices'') and (public.owns_salesman(o.salesman_id) or (public.is_manager() and (exists(select 1 from public.salesmen sm where sm.id=o.salesman_id and sm.manager_user_id=auth.uid()) or (o.salesman_id is null and o.created_by=auth.uid()))))) or (public.is_manager() and o.salesman_id is null and o.created_by=auth.uid())');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 invoice permissions constrained to authorized records'; end if;
end $$;
notify pgrst, 'reload schema';

-- Target rows retain quantity progress for salesmen/managers but do not expose daily revenue values.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def;
  nd := replace(def,
    '''salesman_daily_targets'',(select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.salesman_daily_targets x where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid())))',
    '''salesman_daily_targets'',(select coalesce(jsonb_agg(case when public.is_admin() or public.has_permission(''pnl'') then to_jsonb(x) else to_jsonb(x)-array[''sales_amount'',''imported_sales_amount''] end),''[]''::jsonb) from public.salesman_daily_targets x where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid())))');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 target revenue fields removed from operational snapshots'; end if;
end $$;
notify pgrst, 'reload schema';

-- Stock issue/return RPCs permit Managers only for salesmen assigned to that Manager,
-- even if an old permission record previously granted broader stock access.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.apply_operational_command(uuid,text,jsonb)'::regprocedure) into def;
  nd := replace(def,
    'if not(public.is_admin() or public.has_permission(''stock'',''create'')) then raise exception ''Stock issue permission required''; end if;',
    'if not(public.is_admin() or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=sid and sm.manager_user_id=auth.uid() and sm.active and sm.deleted_at is null)) or (not public.is_manager() and public.has_permission(''stock'',''create''))) then raise exception ''Stock issue permission required for this assigned team''; end if;');
  nd := replace(nd,
    'if not(public.is_admin() or public.owns_salesman(sid) or public.has_permission(''stock'',''create'')) then raise exception ''Stock return permission required''; end if;',
    'if not(public.is_admin() or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=sid and sm.manager_user_id=auth.uid() and sm.active and sm.deleted_at is null)) or (not public.is_manager() and (public.owns_salesman(sid) or public.has_permission(''stock'',''create'')))) then raise exception ''Stock return permission required for this assigned team''; end if;');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 stock issue/return scope updated'; end if;
end $$;
notify pgrst, 'reload schema';

-- Restrict order/quotation writes through direct RPCs as well as the UI. Managers may work on
-- assigned-team documents (or their own direct-sale documents), never another Manager's team.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('private.save_document(jsonb,boolean,boolean,uuid)'::regprocedure) into def;
  nd := def;
  nd := replace(nd,
    'if not public.can_document(old->>''salesman_id'',case when is_quote then ''quotes'' else ''orders'' end,''edit'') then raise exception ''Not authorised''; end if;',
    'if not public.can_document(old->>''salesman_id'',case when is_quote then ''quotes'' else ''orders'' end,''edit'') or (public.is_manager() and not public.is_admin() and ((old->>''salesman_id'' is not null and not exists(select 1 from public.salesmen sm where sm.id=(old->>''salesman_id'') and sm.manager_user_id=auth.uid())) or (old->>''salesman_id'' is null and old->>''created_by''<>auth.uid()::text))) then raise exception ''Not authorised for this Manager team''; end if;');
  nd := replace(nd,
    'if not public.can_document(sid,case when is_quote then ''quotes'' else ''orders'' end,case when old is null then ''create'' else ''edit'' end) then raise exception ''Cannot use this salesman''; end if;',
    'if not public.can_document(sid,case when is_quote then ''quotes'' else ''orders'' end,case when old is null then ''create'' else ''edit'' end) or (public.is_manager() and not public.is_admin() and sid is not null and not exists(select 1 from public.salesmen sm where sm.id=sid and sm.manager_user_id=auth.uid())) then raise exception ''Cannot use a salesman outside your assigned team''; end if;');
  nd := replace(nd,
    'if not found or (not public.is_admin() and not(public.owns_salesman(c.salesman_id) or c.created_by=auth.uid())) then raise exception ''Customer not available''; end if;',
    'if not found or (not public.is_admin() and not(public.owns_salesman(c.salesman_id) or c.created_by=auth.uid() or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=c.salesman_id and sm.manager_user_id=auth.uid())))) then raise exception ''Customer not available to this role/team''; end if;');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 order/quotation RPC writes scoped to assigned Manager teams'; end if;
end $$;

-- Explicit invoice-create permission is required for a Manager to receive team payments.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('private.add_payment(jsonb,boolean)'::regprocedure) into def;
  nd := replace(def,
    'if not public.is_admin() and not(public.owns_salesman(o.salesman_id) and public.has_permission(''invoices'',''create'')) then raise exception ''Payment permission required''; end if;',
    'if not public.is_admin() and not((public.owns_salesman(o.salesman_id) and public.has_permission(''invoices'',''create'')) or (public.is_manager() and public.has_permission(''invoices'',''create'') and ((o.salesman_id is not null and exists(select 1 from public.salesmen sm where sm.id=o.salesman_id and sm.manager_user_id=auth.uid())) or (o.salesman_id is null and o.created_by=auth.uid())))) then raise exception ''Payment permission required for this assigned team''; end if;');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 payment RPC permission scoped to own/assigned records'; end if;
end $$;
notify pgrst, 'reload schema';

-- Fail fast if a schema variant prevented a critical security/workflow replacement.
do $$
declare snapshot_def text; op_def text; document_def text; payment_def text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into snapshot_def;
  select pg_get_functiondef('public.apply_operational_command(uuid,text,jsonb)'::regprocedure) into op_def;
  select pg_get_functiondef('private.save_document(jsonb,boolean,boolean,uuid)'::regprocedure) into document_def;
  select pg_get_functiondef('private.add_payment(jsonb,boolean)'::regprocedure) into payment_def;
  if position('attendance_records' in snapshot_def)=0
     or position('rate_paisa' in snapshot_def)=0
     or position('manager_user_id=auth.uid()' in snapshot_def)=0 then
    raise exception 'v54 verification failed: role-scoped business snapshot did not receive all required workflow changes';
  end if;
  if position('Stock issue permission required for this assigned team' in op_def)=0
     or position('Stock return permission required for this assigned team' in op_def)=0 then
    raise exception 'v54 verification failed: assigned-team stock guards were not applied';
  end if;
  if position('Cannot use a salesman outside your assigned team' in document_def)=0 then
    raise exception 'v54 verification failed: assigned-team document RPC guard was not applied';
  end if;
  if position('Payment permission required for this assigned team' in payment_def)=0 then
    raise exception 'v54 verification failed: scoped payment permission guard was not applied';
  end if;
  if to_regprocedure('public.own_salary_snapshot()') is null then
    raise exception 'v54 verification failed: own salary snapshot RPC is missing';
  end if;
end $$;
notify pgrst, 'reload schema';


-- Add the two named bank accounts only if no matching key or label already exists.
-- Existing account IDs/keys, opening balances and transaction history are never rewritten.
do $$
begin
  if to_regclass('public.cashbook_accounts') is not null then
    if not exists(select 1 from public.cashbook_accounts where account_key='mcb_bank' or label ilike '%MCB%') then
      insert into public.cashbook_accounts(account_key,label,account_type,payment_method,opening_balance_paisa,active)
      values('mcb_bank','MCB Bank','bank','Bank',0,true);
    end if;
    if not exists(select 1 from public.cashbook_accounts where account_key='al_habib_bank' or label ilike '%Al Habib%') then
      insert into public.cashbook_accounts(account_key,label,account_type,payment_method,opening_balance_paisa,active)
      values('al_habib_bank','Al Habib Bank','bank','Bank',0,true);
    end if;
  end if;
end $$;
notify pgrst, 'reload schema';

-- Tighten direct table policies that manager_role.sql previously broadened to every Manager.
-- Admin sees the company; Managers see only assigned operational records unless explicitly permitted.
drop policy if exists salesman_read on public.salesmen;
drop policy if exists salesman_read on public.salesmen;
create policy salesman_read on public.salesmen for select to authenticated
using (public.is_admin() or public.owns_salesman(id) or (public.is_manager() and manager_user_id=auth.uid()));
drop policy if exists customer_read on public.customers;
drop policy if exists customer_read on public.customers;
create policy customer_read on public.customers for select to authenticated
using (public.is_admin() or public.owns_salesman(salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=customers.salesman_id and sm.manager_user_id=auth.uid())) or (created_by=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active)));
drop policy if exists target_read on public.salesman_daily_targets;
drop policy if exists target_read on public.salesman_daily_targets;
create policy target_read on public.salesman_daily_targets for select to authenticated
using (public.is_admin() or public.owns_salesman(salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=salesman_daily_targets.salesman_id and sm.manager_user_id=auth.uid())));
drop policy if exists orders_read on public.orders;
drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated
using (public.is_admin() or public.owns_salesman(salesman_id) or (public.is_manager() and ((salesman_id is not null and exists(select 1 from public.salesmen sm where sm.id=orders.salesman_id and sm.manager_user_id=auth.uid())) or (salesman_id is null and created_by=auth.uid()))));
drop policy if exists quotes_read on public.quotations;
drop policy if exists quotes_read on public.quotations;
create policy quotes_read on public.quotations for select to authenticated
using (public.is_admin() or (public.has_permission('quotes','view') and (public.owns_salesman(salesman_id) or (public.is_manager() and ((salesman_id is not null and exists(select 1 from public.salesmen sm where sm.id=quotations.salesman_id and sm.manager_user_id=auth.uid())) or (salesman_id is null and created_by=auth.uid()))))));
drop policy if exists invoice_read on public.invoices;
drop policy if exists invoice_read on public.invoices;
create policy invoice_read on public.invoices for select to authenticated
using (exists(select 1 from public.orders o where o.id=order_id and (public.is_admin() or (public.has_permission('invoices','view') and (public.owns_salesman(o.salesman_id) or (public.is_manager() and ((o.salesman_id is not null and exists(select 1 from public.salesmen sm where sm.id=o.salesman_id and sm.manager_user_id=auth.uid())) or (o.salesman_id is null and o.created_by=auth.uid()))))))));
drop policy if exists payment_read on public.payments;
drop policy if exists payment_read on public.payments;
create policy payment_read on public.payments for select to authenticated
using (exists(select 1 from public.invoices i join public.orders o on o.id=i.order_id where i.id=invoice_id and (public.is_admin() or (public.has_permission('invoices','view') and (public.owns_salesman(o.salesman_id) or (public.is_manager() and ((o.salesman_id is not null and exists(select 1 from public.salesmen sm where sm.id=o.salesman_id and sm.manager_user_id=auth.uid())) or (o.salesman_id is null and o.created_by=auth.uid()))))))));
drop policy if exists tiers_read on public.price_tiers;
drop policy if exists tiers_read on public.price_tiers;
create policy tiers_read on public.price_tiers for select to authenticated
using (public.is_admin() or public.has_permission('products'));
drop policy if exists stock_admin on public.stock_movements;
drop policy if exists stock_admin on public.stock_movements;
create policy stock_admin on public.stock_movements for select to authenticated
using (public.is_admin() or (public.is_manager() and public.has_permission('stock')));
drop policy if exists salesman_stock_read on public.salesman_stock_movements;
drop policy if exists salesman_stock_read on public.salesman_stock_movements;
create policy salesman_stock_read on public.salesman_stock_movements for select to authenticated
using (public.is_admin() or public.owns_salesman(salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=salesman_stock_movements.salesman_id and sm.manager_user_id=auth.uid())));
drop policy if exists stock_voucher_read on public.stock_vouchers;
drop policy if exists stock_voucher_read on public.stock_vouchers;
create policy stock_voucher_read on public.stock_vouchers for select to authenticated
using (public.is_admin() or public.owns_salesman(salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=stock_vouchers.salesman_id and sm.manager_user_id=auth.uid())));
drop policy if exists daily_closing_read on public.daily_closings;
drop policy if exists daily_closing_read on public.daily_closings;
create policy daily_closing_read on public.daily_closings for select to authenticated
using (public.is_admin() or public.owns_salesman(salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=daily_closings.salesman_id and sm.manager_user_id=auth.uid())));

-- Managers do not receive global cashbook access simply because they have the Manager role.
drop policy if exists cashbook_accounts_read on public.cashbook_accounts;
drop policy if exists cashbook_accounts_read on public.cashbook_accounts;
create policy cashbook_accounts_read on public.cashbook_accounts for select to authenticated using (
  public.is_admin() or public.has_permission('cashbook','view') or (salesman_id is not null and public.owns_salesman(salesman_id))
);
drop policy if exists cashbook_entries_read on public.cashbook_entries;
drop policy if exists cashbook_entries_read on public.cashbook_entries;
create policy cashbook_entries_read on public.cashbook_entries for select to authenticated using (
  public.is_admin() or public.has_permission('cashbook','view') or (salesman_id is not null and public.owns_salesman(salesman_id))
);
drop policy if exists cashbook_closings_read on public.cashbook_daily_closings;
drop policy if exists cashbook_closings_read on public.cashbook_daily_closings;
create policy cashbook_closings_read on public.cashbook_daily_closings for select to authenticated using (
  public.is_admin() or public.has_permission('cashbook','view') or exists(select 1 from public.cashbook_accounts a where a.account_key=cashbook_daily_closings.account_key and a.salesman_id is not null and public.owns_salesman(a.salesman_id))
);

-- The warehouse balance RPC is operationally available to Admin/Manager, not to Salesmen.
create or replace function public.stock_balances()
returns table(product_id text,boxes bigint) language sql stable security definer set search_path=''
as $$
  select p.id,
    (coalesce(sum(m.boxes),0)-coalesce((select sum(sm.boxes)::bigint from public.salesman_stock_movements sm where sm.product_id=p.id),0))::bigint
  from public.products p left join public.stock_movements m on m.product_id=p.id
  where public.is_admin() or public.is_manager()
  group by p.id
$$;
revoke all on function public.stock_balances() from public,anon;
grant execute on function public.stock_balances() to authenticated;

-- Cashbook command RPC: account creation and balance adjustments remain Admin-only;
-- transfer/approval needs explicit cashbook edit permission, never Manager role alone.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.cashbook_record_command(uuid,text,jsonb)'::regprocedure) into def;
  nd := replace(def,
    'and not (public.is_admin() or exists(select 1 from public.user_roles where user_id=auth.uid() and role=''manager'')) then',
    'and not (public.is_admin() or public.has_permission(''cashbook'',''edit'')) then');
  nd := replace(nd,
    'elsif kind=''cashbook.transfer'' then',
    'elsif kind=''cashbook.transfer'' then' || chr(10) || '    if not (public.is_admin() or public.has_permission(''cashbook'',''edit'')) then raise exception ''Cashbook edit permission required''; end if;');
  nd := replace(nd,
    'elsif kind=''cashbook.adjust'' then',
    'elsif kind=''cashbook.adjust'' then' || chr(10) || '    if not public.is_admin() then raise exception ''Only Admin can add money or adjust a cashbook balance''; end if;');
  nd := replace(nd,
    'if not (public.is_admin() or exists(select 1 from public.user_roles where user_id=auth.uid() and role=''manager'') or (acct.salesman_id is not null and public.owns_salesman(acct.salesman_id))) then raise exception ''You cannot close account %'',acct.label; end if;',
    'if not (public.is_admin() or public.has_permission(''cashbook'',''view'') or (acct.salesman_id is not null and public.owns_salesman(acct.salesman_id))) then raise exception ''You cannot close account %'',acct.label; end if;');
  nd := replace(nd,
    'if not (public.is_admin() or exists(select 1 from public.user_roles where user_id=auth.uid() and role=''manager'')) then raise exception ''Management approval required''; end if;',
    'if not (public.is_admin() or public.has_permission(''cashbook'',''edit'')) then raise exception ''Admin or explicit cashbook edit permission required''; end if;');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 cashbook RPC guards tightened'; end if;
end $$;
notify pgrst, 'reload schema';

-- Do not let a broad legacy stock permission reveal every warehouse movement to Salesmen.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def;
  nd := replace(def,
    '''stock_movements'',(select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.stock_movements x where public.is_admin() or public.has_permission(''stock''))',
    '''stock_movements'',(select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.stock_movements x where public.is_admin() or (public.is_manager() and public.has_permission(''stock'')))');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 warehouse movement snapshot scoped'; end if;
end $$;

-- Verify the critical direct-table RLS policies exist with team-scope predicates.
do $$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='salesmen' and policyname='salesman_read' and qual like '%manager_user_id%') then
    raise exception 'v54 verification failed: salesman RLS is not scoped to assigned managers';
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='cashbook_accounts' and policyname='cashbook_accounts_read' and qual like '%has_permission%') then
    raise exception 'v54 verification failed: cashbook account RLS is missing explicit permission checks';
  end if;
end $$;
notify pgrst, 'reload schema';

-- Scope snapshot expenses to Admin, the user's own salesman records, or the Manager's own/team
-- expense records. An explicit permission never turns the Manager view into company-wide access.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def;
  nd := replace(def,
    '''expenses'',(select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.expenses x where public.is_admin() or public.has_permission(''expenses'') or public.owns_salesman(x.salesman_id))',
    '''expenses'',(select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from public.expenses x where public.is_admin() or public.owns_salesman(x.salesman_id) or (public.is_manager() and (x.created_by=auth.uid() or (x.salesman_id is not null and exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid())))) or (not public.is_manager() and public.has_permission(''expenses'') and x.created_by=auth.uid()))');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 expense snapshot scoped to owner/assigned team'; end if;
end $$;
notify pgrst, 'reload schema';

-- Preserve the established manager expense workflow while keeping salary and cross-team expenses protected.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('private.save_master(text,jsonb,integer)'::regprocedure) into def;
  nd := replace(def,
    'when ''expenses'' then allowed:=array[''id'',''date'',''category'',''description'',''amount_paisa'',''method'',''cashbook_account_key'',''attachment_path'',''salesman_id'',''salary_period''];',
    'when ''expenses'' then if mgr and not adm then allowed:=array[''id'',''date'',''category'',''description'',''amount_paisa'',''method'',''cashbook_account_key'',''attachment_path'',''salesman_id'']; else allowed:=array[''id'',''date'',''category'',''description'',''amount_paisa'',''method'',''cashbook_account_key'',''attachment_path'',''salesman_id'',''salary_period'']; end if;');
  nd := replace(nd,
    'or (t=''expenses'' and public.has_permission(''expenses'',''create''))',
    'or (t=''expenses'' and (public.has_permission(''expenses'',''create'') or (mgr and public.manager_expense_visible(auth.uid(),nullif(r->>''salesman_id'','''')))))');
  nd := replace(nd,
    'if t=''salesmen'' and (r->>''joining_date'')::date < date ''2000-01-01'' then raise exception ''Joining date before 2000 is not supported''; end if;',
    'if t=''salesmen'' and (r->>''joining_date'')::date < date ''2000-01-01'' then raise exception ''Joining date before 2000 is not supported''; end if;' || chr(10) ||
    'if mgr and not adm and t=''customers'' and nullif(r->>''salesman_id'','''') is not null and not exists(select 1 from public.salesmen sm where sm.id=r->>''salesman_id'' and sm.manager_user_id=auth.uid()) then raise exception ''Customer may only be linked to your assigned team''; end if;' || chr(10) ||
    'if mgr and not adm and t=''expenses'' then if nullif(r->>''salary_period'','''') is not null or lower(coalesce(r->>''category'','''')) like ''%salary%'' then raise exception ''Manager cannot post salary expenses''; end if; if (r->>''date'')::date > private.business_today() then raise exception ''Future expenses are not allowed''; end if; if not public.manager_expense_visible(auth.uid(),nullif(r->>''salesman_id'','''')) then raise exception ''Expenses may be linked only to assigned salesmen''; end if; end if;');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 retained scoped manager expenses without salary posting'; end if;
end $$;
notify pgrst, 'reload schema';

-- Replace the legacy Manager-wide can_document grant with assigned-team authorization.
create or replace function public.can_document(sid text, section text, action text default 'view') returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if public.is_admin() then return true; end if;
  if action not in ('view','create','edit','share','export') then return false; end if;
  if public.is_manager() then
    if sid is null then return false; end if;
    if not exists(select 1 from public.salesmen sm where sm.id=sid and sm.manager_user_id=auth.uid() and sm.active and sm.deleted_at is null) then return false; end if;
    if section in ('quotes','invoices') then return public.has_permission(section,action); end if;
    return section='orders' and action in ('view','create','edit');
  end if;
  if public.owns_salesman(sid) then
    if section in ('quotes','invoices') then return public.has_permission(section,action); end if;
    return section='orders' and action in ('view','create','edit');
  end if;
  return false;
end $$;
revoke all on function public.can_document(text,text,text) from public,anon;
grant execute on function public.can_document(text,text,text) to authenticated;

do $$
declare def text; nd text;
begin
  select pg_get_functiondef('private.save_document(jsonb,boolean,boolean,uuid)'::regprocedure) into def;
  nd := replace(def,
    'if not public.can_document(old->>''salesman_id'',case when is_quote then ''quotes'' else ''orders'' end,''edit'') or (public.is_manager() and not public.is_admin() and ((old->>''salesman_id'' is not null and not exists(select 1 from public.salesmen sm where sm.id=(old->>''salesman_id'') and sm.manager_user_id=auth.uid())) or (old->>''salesman_id'' is null and old->>''created_by''<>auth.uid()::text))) then raise exception ''Not authorised for this Manager team''; end if;',
    'if (not public.can_document(old->>''salesman_id'',case when is_quote then ''quotes'' else ''orders'' end,''edit'') and not (public.is_manager() and not public.is_admin() and not is_quote and old->>''salesman_id'' is null and old->>''created_by''=auth.uid()::text)) or (public.is_manager() and not public.is_admin() and ((old->>''salesman_id'' is not null and not exists(select 1 from public.salesmen sm where sm.id=(old->>''salesman_id'') and sm.manager_user_id=auth.uid())) or (old->>''salesman_id'' is null and old->>''created_by''<>auth.uid()::text))) then raise exception ''Not authorised for this Manager team''; end if;');
  nd := replace(nd,
    'if not public.can_document(sid,case when is_quote then ''quotes'' else ''orders'' end,case when old is null then ''create'' else ''edit'' end) or (public.is_manager() and not public.is_admin() and sid is not null and not exists(select 1 from public.salesmen sm where sm.id=sid and sm.manager_user_id=auth.uid())) then raise exception ''Cannot use a salesman outside your assigned team''; end if;',
    'if (not public.can_document(sid,case when is_quote then ''quotes'' else ''orders'' end,case when old is null then ''create'' else ''edit'' end) and not (public.is_manager() and not public.is_admin() and not is_quote and sid is null and (old is null or old->>''created_by''=auth.uid()::text))) or (public.is_manager() and not public.is_admin() and sid is not null and not exists(select 1 from public.salesmen sm where sm.id=sid and sm.manager_user_id=auth.uid())) then raise exception ''Cannot use a salesman outside your assigned team''; end if;');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 direct document write guards aligned with scoped can_document'; end if;
end $$;
notify pgrst, 'reload schema';

-- An explicit orders permission is still scoped to owned/assigned documents; it is not a global bypass.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def;
  nd := replace(def, ' or public.has_permission(''orders''))', '))');
  if nd <> def then nd := replace(nd, 'auth.uid()))))),', 'auth.uid())))),'); execute nd; raise notice 'v54 order snapshot permission bypass removed'; end if;
end $$;
notify pgrst, 'reload schema';

-- Quote permissions remain record-scoped for salesmen and Managers; permission never grants every quote.
do $$
declare def text; nd text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into def;
  nd := replace(def,
    'where public.is_admin() or public.has_permission(''quotes''))',
    'where public.is_admin() or (public.has_permission(''quotes'') and (public.owns_salesman(x.salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=x.salesman_id and sm.manager_user_id=auth.uid())))))');
  nd := replace(nd,
    'where public.is_admin() or public.has_permission(''quotes''))',
    'where public.is_admin() or (public.has_permission(''quotes'') and (public.owns_salesman(q.salesman_id) or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=q.salesman_id and sm.manager_user_id=auth.uid())))))');
  if nd <> def then execute nd; raise notice 'v54 quote snapshots scoped to authorized records'; end if;
end $$;
notify pgrst, 'reload schema';

-- Final v54 security and wiring verification; abort migration if a critical replacement was missed.
do $$
declare snapshot_def text; document_acl text; cashbook_def text; stock_def text;
begin
  select pg_get_functiondef('public.business_snapshot()'::regprocedure) into snapshot_def;
  select pg_get_functiondef('public.can_document(text,text,text)'::regprocedure) into document_acl;
  select pg_get_functiondef('public.cashbook_record_command(uuid,text,jsonb)'::regprocedure) into cashbook_def;
  select pg_get_functiondef('public.stock_balances()'::regprocedure) into stock_def;
  if position('manager_user_id=auth.uid()' in document_acl)=0 then
    raise exception 'v54 verification failed: can_document is not Manager-team scoped';
  end if;
  if position('Only Admin can add money or adjust a cashbook balance' in cashbook_def)=0
     or position('Cashbook edit permission required' in cashbook_def)=0
     or position('exists(select 1 from public.user_roles where user_id=auth.uid() and role=''manager'')' in cashbook_def)>0 then
    raise exception 'v54 verification failed: cashbook command guards were not applied';
  end if;
  if position('public.is_manager()' in stock_def)=0
     or position('salesman_stock_movements' in stock_def)=0 then
    raise exception 'v54 verification failed: warehouse stock balance scope/reconciliation is incorrect';
  end if;
  if to_regclass('public.sales_areas') is null or to_regclass('public.employee_notifications') is null then
    raise exception 'v54 verification failed: connected workflow tables are missing';
  end if;
end $$;
notify pgrst, 'reload schema';
