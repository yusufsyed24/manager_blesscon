-- Create your email/password in Authentication > Users first.
-- Replace the email below; run in SQL Editor as project owner.
do $$declare admin_email text:='REPLACE_WITH_YOUR_EMAIL';uid uuid;begin
 select id into uid from auth.users where email=admin_email;
 if uid is null then raise exception 'Create this user in Authentication first';end if;
 insert into public.profiles(id,display_name,active) values(uid,'Blesscon Owner',true) on conflict(id) do update set active=true;
 insert into public.user_roles(user_id,role) values(uid,'admin') on conflict(user_id) do update set role='admin';
end $$;
