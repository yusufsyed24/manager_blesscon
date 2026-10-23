-- Blesscon Candy Business Manager: create missing sales-area catalogue and assignments.
-- Additive and safe to rerun. Does not reset business data or delete records.

begin;

create table if not exists public.sales_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sales_areas_name_ci_unique
  on public.sales_areas (lower(name));

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

-- Preserve current area/territory labels as selectable catalogue entries.
insert into public.sales_areas(name, created_by)
select min(trim(coalesce(nullif(territory,''), nullif(area,'')))), null
from public.salesmen
where deleted_at is null
  and length(trim(coalesce(nullif(territory,''), nullif(area,''), ''))) > 0
group by lower(trim(coalesce(nullif(territory,''), nullif(area,''))))
on conflict do nothing;

alter table public.sales_areas enable row level security;
revoke all on public.sales_areas from anon, authenticated;
grant select, insert, update on public.sales_areas to authenticated;
drop policy if exists sales_areas_read on public.sales_areas;
create policy sales_areas_read on public.sales_areas
  for select to authenticated using (public.is_admin() or public.is_manager());
drop policy if exists sales_areas_admin_write on public.sales_areas;
create policy sales_areas_admin_write on public.sales_areas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.salesman_area_assignments enable row level security;
revoke all on public.salesman_area_assignments from anon, authenticated;
grant select, insert, update on public.salesman_area_assignments to authenticated;
drop policy if exists salesman_area_assignments_read on public.salesman_area_assignments;
create policy salesman_area_assignments_read on public.salesman_area_assignments
  for select to authenticated
  using (
    public.is_admin()
    or public.owns_salesman(salesman_id)
    or exists (
      select 1 from public.salesmen sm
      where sm.id = salesman_area_assignments.salesman_id
        and sm.manager_user_id = auth.uid()
        and public.is_manager()
        and sm.deleted_at is null
    )
  );
drop policy if exists salesman_area_assignments_manage on public.salesman_area_assignments;
create policy salesman_area_assignments_manage on public.salesman_area_assignments
  for all to authenticated
  using (
    public.is_admin()
    or (public.is_manager() and exists (
      select 1 from public.salesmen sm
      where sm.id = salesman_area_assignments.salesman_id
        and sm.manager_user_id = auth.uid()
        and sm.deleted_at is null
    ))
  )
  with check (
    public.is_admin()
    or (public.is_manager() and created_by = auth.uid() and exists (
      select 1 from public.salesmen sm
      where sm.id = salesman_area_assignments.salesman_id
        and sm.manager_user_id = auth.uid()
        and sm.deleted_at is null
    ))
  );

create or replace function public.assign_salesman_area(
  p_salesman_id text,
  p_area_name text,
  p_effective_from date,
  p_effective_to date default null,
  p_instructions text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  seller public.salesmen;
  assignment_id uuid;
  existing record;
begin
  if auth.uid() is null or not (public.is_admin() or public.is_manager()) then
    raise exception 'Admin or Manager access required';
  end if;
  select * into seller from public.salesmen
    where id = p_salesman_id and deleted_at is null for update;
  if not found then raise exception 'Salesman not found'; end if;
  if public.is_manager() and not public.is_admin()
     and seller.manager_user_id is distinct from auth.uid() then
    raise exception 'Salesman is outside your assigned team';
  end if;
  if p_area_name is null or length(trim(p_area_name)) = 0 then
    raise exception 'Area name is required';
  end if;
  if not exists (
    select 1 from public.sales_areas a
    where lower(a.name) = lower(trim(p_area_name)) and a.active
  ) then raise exception 'Choose an active area from the Admin area catalogue'; end if;
  if p_effective_from is null or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'Invalid effective dates';
  end if;

  for existing in
    select id, effective_from, effective_to
    from public.salesman_area_assignments
    where salesman_id = p_salesman_id
      and effective_from <> p_effective_from
      and daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]')
          && daterange(p_effective_from, coalesce(p_effective_to, 'infinity'::date), '[]')
    for update
  loop
    if existing.effective_from < p_effective_from then
      update public.salesman_area_assignments
      set effective_to = p_effective_from - 1, updated_at = now()
      where id = existing.id;
    else
      raise exception 'This area assignment overlaps a later assignment. Choose an end date before that assignment or edit the existing assignment.';
    end if;
  end loop;

  select id into assignment_id from public.salesman_area_assignments
    where salesman_id = p_salesman_id and effective_from = p_effective_from limit 1;
  if assignment_id is null then
    insert into public.salesman_area_assignments
      (salesman_id, area_name, effective_from, effective_to, instructions, created_by)
    values
      (p_salesman_id, trim(p_area_name), p_effective_from, p_effective_to,
       coalesce(p_instructions, ''), auth.uid())
    returning id into assignment_id;
  else
    update public.salesman_area_assignments
    set area_name = trim(p_area_name), effective_to = p_effective_to,
        instructions = coalesce(p_instructions, ''), updated_at = now()
    where id = assignment_id;
  end if;

  if p_effective_from <= current_date and (p_effective_to is null or p_effective_to >= current_date) then
    update public.salesmen
    set territory = trim(p_area_name), area = trim(p_area_name),
        updated_by = auth.uid(), updated_at = now(), version = version + 1
    where id = p_salesman_id;
  end if;
  return assignment_id;
end;
$$;
revoke all on function public.assign_salesman_area(text,text,date,date,text) from public, anon;
grant execute on function public.assign_salesman_area(text,text,date,date,text) to authenticated;

notify pgrst, 'reload schema';
commit;
