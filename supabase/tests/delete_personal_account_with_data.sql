-- Development-only transactional test. The new migration is included once and
-- rolled back; no account or schema change survives this file.
begin;
\if :{?test_migration}
\i supabase/migrations/20261103000100_delete_personal_account_with_data.sql
\i supabase/migrations/20261103000200_guard_shared_photos_on_account_deletion.sql
\i supabase/migrations/20261108000100_record_deleted_auth_users.sql
\endif

do $$
begin
  if exists (select 1 from auth.users where id in ('00000000-0000-4000-8000-000000994101', '00000000-0000-4000-8000-000000994102'))
    or exists (select 1 from public.routes where id = -994101)
    or exists (select 1 from storage.objects where bucket_id = 'route-photos' and name like 'routes/-994101/%')
    or exists (select 1 from app_private.deleted_auth_users where auth_user_id in
      ('00000000-0000-4000-8000-000000994101', '00000000-0000-4000-8000-000000994102'))
  then raise exception 'Deletion test fixture already exists'; end if;
end;
$$;

insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000994101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'delete-test-a@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-000000994102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'delete-test-b@example.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

insert into public.routes(id, name, origin, account_id, owner_account_id, is_public)
select -994101, 'Temporary deletion test', 'drawn', account_id, account_id, true
from public.users where id = '00000000-0000-4000-8000-000000994101';
insert into public.runs(id, name, account_id, owner_account_id)
select -994101, 'Temporary deletion test', account_id, account_id
from public.users where id = '00000000-0000-4000-8000-000000994101';
insert into public.route_spot_photos(id, route_id, user_id, image_url)
values ('00000000-0000-4000-8000-000000994111', -994101,
  '00000000-0000-4000-8000-000000994101', 'routes/-994101/original.jpg');
insert into public.route_spot_photos(id, route_id, user_id, image_url)
values ('00000000-0000-4000-8000-000000994112', -994101,
  '00000000-0000-4000-8000-000000994102', 'routes/-994101/other-user.jpg');
insert into storage.objects(bucket_id, name, owner_id)
values ('route-photos', 'routes/-994101/original.jpg', '00000000-0000-4000-8000-000000994101');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000994102', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
do $$
begin
  begin
    perform public.prepare_my_account_deletion();
    raise exception 'Other user with external photo should be blocked';
  exception when others then
    if sqlerrm <> 'Shared or external account data requires review' then raise; end if;
  end;
  if not (select is_public from public.routes where id = -994101)
  then raise exception 'Other user hid owner route'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000994101', true);
set local role authenticated;
do $$
begin
  begin
    perform public.prepare_my_account_deletion();
    raise exception 'Shared photo did not block deletion';
  exception when others then
    if sqlerrm <> 'Shared or external account data requires review' then raise; end if;
  end;
end;
$$;
reset role;
delete from public.route_spot_photos where id = '00000000-0000-4000-8000-000000994112';
set local role authenticated;
do $$
declare targets jsonb;
begin
  targets := public.prepare_my_account_deletion();
  if jsonb_array_length(targets) <> 1
    or targets->0->>'path' <> 'routes/-994101/original.jpg'
    or (select is_public from public.routes where id = -994101)
  then raise exception 'Preparation did not hide route and inventory photo'; end if;
  begin
    perform public.complete_my_account_deletion();
    raise exception 'Completion accepted remaining Storage object';
  exception when others then
    if sqlerrm <> 'Storage objects remain' then raise; end if;
  end;
end;
$$;
reset role;
do $$
begin
  if exists (select 1 from app_private.deleted_auth_users where auth_user_id = '00000000-0000-4000-8000-000000994101')
  then raise exception 'Rejected deletion produced a receipt'; end if;
end;
$$;
set local role authenticated;
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'route-photos' and name = 'routes/-994101/original.jpg';
select public.complete_my_account_deletion();
reset role;
do $$
begin
  if exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000994101')
    or exists (select 1 from public.routes where id = -994101)
    or exists (select 1 from public.runs where id = -994101)
    or exists (select 1 from public.route_spot_photos where route_id = -994101)
    or not exists (select 1 from app_private.deleted_auth_users where auth_user_id = '00000000-0000-4000-8000-000000994101')
  then raise exception 'Account data remains after completion'; end if;
end;
$$;
rollback;
