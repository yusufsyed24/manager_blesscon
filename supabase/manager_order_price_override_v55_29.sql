-- Blesscon Candy Business Manager v55.29
-- Allows Admins and Managers to save manual product rates on documents they are
-- already authorized to create/edit. Existing can_document/team-scope checks remain
-- in force. Salesmen and other roles still cannot override prices.
begin;
do $$
declare
  definition text;
  updated_definition text;
  old_guard text := 'if not public.is_admin() or reason is null then raise exception ''PRICE_CHANGED: Review current price or provide an admin override reason''; end if;';
  new_guard text := 'if not (public.is_admin() or public.is_manager()) or reason is null then raise exception ''PRICE_CHANGED: Review current price or provide an Admin/Manager override reason''; end if;';
begin
  select pg_get_functiondef('private.save_document(jsonb,boolean,boolean,uuid)'::regprocedure)
    into definition;
  updated_definition := replace(definition, old_guard, new_guard);
  if updated_definition = definition then
    if position(new_guard in definition) = 0 then
      raise exception 'Could not locate expected manual-price guard in private.save_document; no changes applied. Check current schema/migrations.';
    end if;
  else
    execute updated_definition;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
