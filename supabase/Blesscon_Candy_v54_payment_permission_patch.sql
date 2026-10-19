-- Targeted repair for the existing private.add_payment(jsonb, boolean) function.
-- This changes only the payment permission guard; it preserves the rest of the function.
-- Run in Supabase SQL Editor using the normal Run option.

do $repair$
declare
  fn_def text;
  old_guard text := $old$if not public.is_admin() and not(public.is_manager() and o.salesman_id is null) and not(public.owns_salesman(o.salesman_id) and public.has_permission('invoices','create')) then raise exception 'Payment permission required'; end if;$old$;
  new_guard text := $new$if not public.is_admin() and not((public.owns_salesman(o.salesman_id) and public.has_permission('invoices','create')) or (public.is_manager() and public.has_permission('invoices','create') and ((o.salesman_id is not null and exists(select 1 from public.salesmen sm where sm.id=o.salesman_id and sm.manager_user_id=auth.uid())) or (o.salesman_id is null and o.created_by=auth.uid())))) then raise exception 'Payment permission required for this assigned team'; end if;$new$;
begin
  select pg_get_functiondef('private.add_payment(jsonb,boolean)'::regprocedure)
    into fn_def;

  if position('Payment permission required for this assigned team' in fn_def) > 0 then
    raise notice 'The scoped payment permission guard is already applied; no change needed.';
    return;
  end if;

  if position(old_guard in fn_def) = 0 then
    raise exception 'Patch stopped safely: expected current payment permission guard was not found. No function changes were made.';
  end if;

  fn_def := replace(fn_def, old_guard, new_guard);
  execute fn_def;
  raise notice 'Updated private.add_payment with Manager-team-scoped payment permission.';
end
$repair$;

-- Verify the guard text after applying the patch.
select case
  when position(
    'Payment permission required for this assigned team'
    in pg_get_functiondef('private.add_payment(jsonb,boolean)'::regprocedure)
  ) > 0
  and position(
    'manager_user_id=auth.uid()'
    in pg_get_functiondef('private.add_payment(jsonb,boolean)'::regprocedure)
  ) > 0
  then 'PASS: scoped payment permission guard is present'
  else 'FAIL: scoped payment permission guard is missing'
end as verification;
