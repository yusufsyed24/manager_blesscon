-- Read-only preflight for manager daily-closing migration.
-- Run this before any schema changes. It does not modify data.

select column_name, is_nullable, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'daily_closings'
order by ordinal_position;

select c.conname as constraint_name,
       c.contype as constraint_type,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid = 'public.daily_closings'::regclass
order by c.conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'daily_closings'
order by indexname;

-- Show whether the active manager currently has active assigned salesmen.
select sm.id, sm.name, sm.active, sm.deleted_at, sm.manager_user_id
from public.salesmen sm
where sm.manager_user_id = 'd2cf42d4-3806-44f1-9deb-369920e2f152'::uuid
order by sm.name;
