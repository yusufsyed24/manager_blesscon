-- Blesscon Candy v41: fix manager_closing_command PostgREST RPC argument signature.
-- Run this in Supabase SQL Editor AFTER manager_closing_expenses_v40.sql has completed successfully.
create or replace function public.manager_closing_command(data jsonb, kind text, op_id uuid)
returns jsonb language sql security definer set search_path=''
as $$ select public.manager_closing_command(op_id, kind, data); $$;
revoke all on function public.manager_closing_command(jsonb,text,uuid) from public, anon;
grant execute on function public.manager_closing_command(jsonb,text,uuid) to authenticated;
notify pgrst, 'reload schema';
