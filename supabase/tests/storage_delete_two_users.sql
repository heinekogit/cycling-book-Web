-- Run with psql -X -v ON_ERROR_STOP=1 -f this_file against a test Supabase DB.
-- Synthetic Auth, route, run, and Storage rows exist only inside this transaction.
begin;
\if :{?test_migration}
\i supabase/migrations/20261018000300_limit_storage_photo_delete_to_owner.sql
do $$
begin
  if exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'cycling_book_route_objects_delete'
      and qual like '%can_access_cycling_photo_object%'
  ) then
    raise exception 'Broad public-photo delete permission remains';
  end if;
end;
$$;
\endif

do $$
begin
  if exists (select 1 from auth.users where id in
      ('00000000-0000-4000-8000-000000992101', '00000000-0000-4000-8000-000000992102'))
    or exists (select 1 from public.routes where id = -992101)
    or exists (select 1 from public.runs where id = -992102)
    or exists (select 1 from storage.objects where bucket_id = 'route-photos'
      and name like 'routes/-992101/%') then
    raise exception 'Storage delete test fixtures already exist';
  end if;
end;
$$;

insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000992101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'storage-delete-a@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000992102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'storage-delete-b@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

do $$
begin
  if (select count(distinct account_id) from public.users where id in
      ('00000000-0000-4000-8000-000000992101', '00000000-0000-4000-8000-000000992102')) <> 2 then
    raise exception 'Test users require different accounts';
  end if;
end;
$$;

insert into public.routes(id, name, origin, account_id, owner_account_id, is_public)
select -992101, 'Temporary public photo route', 'drawn', account_id, account_id, true
from public.users where id = '00000000-0000-4000-8000-000000992101';
insert into public.runs(id, name, account_id, owner_account_id)
select -992102, 'Temporary photo run', account_id, account_id
from public.users where id = '00000000-0000-4000-8000-000000992101';
insert into public.route_spot_photos(id, route_id, user_id, image_url, is_privacy_hidden)
values ('00000000-0000-4000-8000-000000992111', -992101,
  '00000000-0000-4000-8000-000000992101', 'routes/-992101/public.jpg', false);
insert into storage.objects(bucket_id, name, owner_id)
values
  ('route-photos', 'routes/-992101/public.jpg', '00000000-0000-4000-8000-000000992101'),
  ('route-photos', 'runs/' || (select account_id::text from public.users
    where id = '00000000-0000-4000-8000-000000992101') || '/-992102/private.jpg',
   '00000000-0000-4000-8000-000000992101');

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000992102', true);
set local role authenticated;
do $$
declare affected integer;
begin
  if (select count(*) from storage.objects where bucket_id = 'route-photos'
      and name = 'routes/-992101/public.jpg') <> 1 then
    raise exception 'Other user must be able to read public photo';
  end if;
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'route-photos'
    and name = 'routes/-992101/public.jpg';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other user deleted public photo'; end if;
  delete from storage.objects where bucket_id = 'route-photos'
    and name like 'runs/%/-992102/private.jpg';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other user deleted run photo'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000992101', true);
do $$
declare affected integer;
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'route-photos'
    and name = 'routes/-992101/public.jpg';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner could not delete route photo'; end if;
  delete from storage.objects where bucket_id = 'route-photos'
    and name like 'runs/%/-992102/private.jpg';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner could not delete run photo'; end if;
end;
$$;

rollback;
