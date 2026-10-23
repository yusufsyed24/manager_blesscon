-- v55.30.1: tolerant manager customer-save fix.
-- The previous patch expected one exact formatting of save_master and safely stopped
-- when the deployed function used a different variant. This patch supports the known
-- v55.12 and original customer-guard variants and does not overwrite the whole function.
begin;
do $patch$
declare
  fn text;
  old_a text := $old$if t='customers' and not adm then select id into k from public.salesmen where user_id=auth.uid() and active and deleted_at is null; if k is null then raise exception 'Active salesman required'; end if; r:=r||jsonb_build_object('salesman_id',k); end if;$old$;
  new_a text := $new$if t='customers' and not adm then
 if exists(select 1 from public.user_roles where user_id=auth.uid() and role='manager') then
   k:=nullif(r->>'salesman_id','');
   if k is not null and not exists(select 1 from public.salesmen s where s.id=k and s.active and s.deleted_at is null and s.manager_user_id=auth.uid()) then
     raise exception 'Manager can assign a customer only to an active salesman on their own team';
   end if;
   r:=r||jsonb_build_object('salesman_id',k);
 else
   select id into k from public.salesmen where user_id=auth.uid() and active and deleted_at is null;
   if k is null then raise exception 'Active salesman required'; end if;
   r:=r||jsonb_build_object('salesman_id',k);
 end if;
end if;$new$;
  old_b text := $old$if t='customers' and not adm then select id into k from public.salesmen where user_id=auth.uid() and active and deleted_at is null; if k is null then raise exception 'Active salesman required'; end if; r:=r||jsonb_build_object('salesman_id',k); end if;$old$;
  new_b text := $new$if t='customers' and not adm then select id into k from public.salesmen where user_id=auth.uid() and active and deleted_at is null; if k is not null then r:=r||jsonb_build_object('salesman_id',k); elsif public.is_manager() then if nullif(r->>'salesman_id','') is not null and not exists(select 1 from public.salesmen sm where sm.id=r->>'salesman_id' and sm.manager_user_id=auth.uid() and sm.active and sm.deleted_at is null) then raise exception 'Manager can assign a customer only to an active salesman on their own team'; end if; else raise exception 'Active salesman required'; end if; end if;$new$;
begin
  select pg_get_functiondef(to_regprocedure('private.save_master(text,jsonb,integer)')) into fn;
  if fn is null then raise exception 'private.save_master(text,jsonb,integer) was not found. Install the main Blesscon schema first.'; end if;
  if position('Manager can assign a customer only to an active salesman on their own team' in fn)>0 then
    raise notice 'Manager customer-save guard is already installed; no change needed.';
  elsif position(old_a in fn)>0 then
    execute replace(fn,old_a,new_a);
    raise notice 'Patched original manager customer-save guard.';
  elsif position('elsif public.is_manager() then if nullif(r->>''salesman_id''' in fn)>0 then
    -- Existing v55.12-style branch: tighten its team check to require active/non-deleted.
    fn := replace(fn,
      'sm.manager_user_id=auth.uid() and sm.deleted_at is null',
      'sm.manager_user_id=auth.uid() and sm.active and sm.deleted_at is null');
    if position('Manager can assign a customer only to an active salesman on their own team' in fn)=0 then
      fn := replace(fn,
        'r:=r||jsonb_build_object(''salesman_id'',null);',
        'raise exception ''Manager can assign a customer only to an active salesman on their own team'';');
    end if;
    execute fn;
    raise notice 'Patched v55.12-style manager customer-save guard.';
  elsif position('Active salesman required' in fn)=0 then
    raise notice 'No salesman-only customer guard found; no change needed.';
  else
    raise exception 'Unsupported private.save_master customer guard variant. No change applied; export its definition for a targeted patch.';
  end if;
end;
$patch$;

-- Also allow managers to create orders for customers assigned to their own active team.
do $docpatch$
declare
  fn_oid regprocedure := to_regprocedure('private.save_document(jsonb,boolean,boolean,uuid)');
  fn text;
  old_chk text := $old$if not found or (not public.is_admin() and not(public.owns_salesman(c.salesman_id) or c.created_by=auth.uid())) then raise exception 'Customer not available'; end if;$old$;
  new_chk text := $new$if not found or (not public.is_admin() and not(public.owns_salesman(c.salesman_id) or c.created_by=auth.uid() or (public.is_manager() and exists(select 1 from public.salesmen sm where sm.id=c.salesman_id and sm.manager_user_id=auth.uid() and sm.active and sm.deleted_at is null)))) then raise exception 'Customer not available'; end if;$new$;
begin
  if fn_oid is null then raise notice 'save_document signature not found; skipped this optional patch.'; return; end if;
  select pg_get_functiondef(fn_oid) into fn;
  if position('c.manager_user_id' in fn)>0 or position('sm.manager_user_id=auth.uid() and sm.active and sm.deleted_at is null' in fn)>0 then
    raise notice 'Manager team customer access appears already installed.';
  elsif position(old_chk in fn)>0 then
    execute replace(fn,old_chk,new_chk);
    raise notice 'Patched order customer access for manager team.';
  else
    raise notice 'save_document customer check differs from known versions; left unchanged to preserve security.';
  end if;
end;
$docpatch$;
notify pgrst, 'reload schema';
commit;
