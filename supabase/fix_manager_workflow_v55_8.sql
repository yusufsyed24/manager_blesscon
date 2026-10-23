-- Run each block separately in the Supabase SQL Editor and send me the results.

-- 1. Which upload rules exist on the storage bucket right now?
select policyname, cmd, permissive, with_check
from pg_policies where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- 2. Does the bucket exist?
select id, public, file_size_limit from storage.buckets;

-- 3. Roles of every login (is the uploader really admin / manager, and active?)
select p.display_name, r.role, p.active
from public.profiles p left join public.user_roles r on r.user_id = p.id
order by r.role, p.display_name;

-- 4. Salesmen: linked to a login? assigned to which manager?
select s.name, (s.user_id is not null) as has_login, m.display_name as manager
from public.salesmen s left join public.profiles m on m.id = s.manager_user_id
where s.deleted_at is null order by s.name;
