-- Blesscon Candy v43: resolve ambiguous manager_closing_command RPC overloads.
-- Run in Supabase SQL Editor. This removes only the alternate wrapper signature;
-- it preserves public.manager_closing_command(uuid,text,jsonb), which contains the implementation.
drop function if exists public.manager_closing_command(jsonb,text,uuid);
notify pgrst, 'reload schema';
