-- Fix for: Could not find the 'avatar_path' column of 'profiles' in the schema cache.
-- Run this script in Supabase SQL Editor, then hard-refresh the application.
-- Safe to run repeatedly.
alter table public.profiles add column if not exists avatar_path text;
grant select on public.profiles to authenticated;
grant update (avatar_path, updated_at) on public.profiles to authenticated;
alter table public.profiles enable row level security;
drop policy if exists profile_avatar_update_self on public.profiles;
create policy profile_avatar_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
notify pgrst, 'reload schema';
