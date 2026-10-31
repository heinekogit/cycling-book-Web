-- Synthetic rows and the optional migration are rolled back together.
-- psql -X -v ON_ERROR_STOP=1 -v test_migration=1 -f supabase/tests/public_photo_access.sql
begin;
\if :{?test_migration}
\i supabase/migrations/20261025000200_public_photo_choice.sql
\endif

do $$
begin
  if exists (select 1 from auth.users where id in
      ('00000000-0000-4000-8000-000000993101', '00000000-0000-4000-8000-000000993102'))
    or exists (select 1 from public.routes where id = -993101)
    or exists (select 1 from storage.objects where bucket_id = 'route-photos'
      and name like 'routes/-993101/%') then
    raise exception 'Public-photo test fixtures already exist';
  end if;
end;
$$;

insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000993101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'public-photo-a@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000993102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'public-photo-b@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

insert into public.routes(id, name, origin, account_id, owner_account_id, is_public)
select -993101, 'Temporary public-photo test', 'drawn', account_id, account_id, true
from public.users where id = '00000000-0000-4000-8000-000000993101';

insert into public.route_spot_photos(id, route_id, user_id, image_url,
  is_privacy_hidden, is_publicly_selected, public_image_url)
values
  ('00000000-0000-4000-8000-000000993111', -993101,
   '00000000-0000-4000-8000-000000993101', 'routes/-993101/original-a.jpg',
   false, true, 'routes/-993101/public/00000000-0000-4000-8000-000000993111/copy.jpg'),
  ('00000000-0000-4000-8000-000000993112', -993101,
   '00000000-0000-4000-8000-000000993101', 'routes/-993101/original-b.jpg',
   false, false, null);

insert into storage.objects(bucket_id, name, owner_id)
values
  ('route-photos', 'routes/-993101/original-a.jpg', '00000000-0000-4000-8000-000000993101'),
  ('route-photos', 'routes/-993101/original-b.jpg', '00000000-0000-4000-8000-000000993101'),
  ('route-photos', 'routes/-993101/public/00000000-0000-4000-8000-000000993111/copy.jpg',
   '00000000-0000-4000-8000-000000993101');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993101', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.route_spot_photos where route_id = -993101) <> 2 then
    raise exception 'Owner cannot read both photos';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'route-photos'
      and name like 'routes/-993101/%') <> 3 then
    raise exception 'Owner cannot read originals and public copy';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993102', true);
do $$
begin
  if (select count(*) from public.route_spot_photos where route_id = -993101) <> 1 then
    raise exception 'Other user sees private photo or misses selected photo';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'route-photos'
      and name like 'routes/-993101/%') <> 1 then
    raise exception 'Other user sees original object or misses public copy';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$
begin
  if (select count(*) from public.route_spot_photos where route_id = -993101) <> 1 then
    raise exception 'Anonymous user sees private photo or misses selected photo';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'route-photos'
      and name like 'routes/-993101/%') <> 1 then
    raise exception 'Anonymous user sees original object or misses public copy';
  end if;
end;
$$;

reset role;
update public.route_spot_photos set is_privacy_hidden = true
where id = '00000000-0000-4000-8000-000000993111';
set local role anon;
do $$
begin
  if exists (select 1 from public.route_spot_photos where route_id = -993101)
    or exists (select 1 from storage.objects where bucket_id = 'route-photos'
      and name like 'routes/-993101/%') then
    raise exception 'Privacy-hidden photo remains visible to anonymous user';
  end if;
end;
$$;

reset role;
update public.route_spot_photos set is_privacy_hidden = false
where id = '00000000-0000-4000-8000-000000993111';
update public.routes set is_public = false where id = -993101;
set local role anon;
do $$
begin
  if exists (select 1 from public.route_spot_photos where route_id = -993101)
    or exists (select 1 from storage.objects where bucket_id = 'route-photos'
      and name like 'routes/-993101/%') then
    raise exception 'Unpublished route still exposes a photo';
  end if;
end;
$$;

rollback;
