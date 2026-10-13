-- Run with psql -v user_a=<auth UUID> -v user_b=<different auth UUID> -f this_file.
-- Every synthetic row has a negative ID/fixed UUID and is rolled back.
\set ON_ERROR_STOP on
begin;

select set_config('test.user_a', :'user_a', true);
select set_config('test.user_b', :'user_b', true);
select set_config('test.account_a', (select account_id::text from public.users
  where id = current_setting('test.user_a')::uuid), true);
do $$
begin
  if (select count(distinct account_id) from public.users
      where id in (current_setting('test.user_a')::uuid, current_setting('test.user_b')::uuid)) <> 2 then
    raise exception 'Two existing users with different accounts are required';
  end if;
  if exists (select 1 from public.routes where id between -991004 and -991001)
    or exists (select 1 from public.runs where id between -991104 and -991101) then
    raise exception 'Synthetic test IDs already exist';
  end if;
end;
$$;

insert into public.routes(id, name, origin, account_id, owner_account_id, is_public)
select v.id, 'temporary RLS test', 'drawn', u.account_id, u.account_id, v.is_public
from (values
  (-991001::bigint, current_setting('test.user_a')::uuid, false),
  (-991002::bigint, current_setting('test.user_a')::uuid, true),
  (-991003::bigint, current_setting('test.user_b')::uuid, false)
) v(id, user_id, is_public)
join public.users u on u.id = v.user_id;
insert into public.runs(id, name, account_id, owner_account_id)
select v.id, 'temporary RLS test', u.account_id, u.account_id
from (values
  (-991101::bigint, current_setting('test.user_a')::uuid),
  (-991102::bigint, current_setting('test.user_b')::uuid)
) v(id, user_id)
join public.users u on u.id = v.user_id;
insert into public.route_spot_photos(id, route_id, user_id, image_url, is_privacy_hidden)
values
  ('00000000-0000-4000-8000-000000991001', -991001, current_setting('test.user_a')::uuid, 'routes/-991001/private.jpg', false),
  ('00000000-0000-4000-8000-000000991002', -991002, current_setting('test.user_a')::uuid, 'routes/-991002/public.jpg', false),
  ('00000000-0000-4000-8000-000000991003', -991002, current_setting('test.user_a')::uuid, 'routes/-991002/hidden.jpg', true);
insert into public.route_markers(id, route_id, latitude, longitude, is_privacy_hidden)
values
  ('00000000-0000-4000-8000-000000991011', -991002, 35, 139, false),
  ('00000000-0000-4000-8000-000000991012', -991002, 35, 139, true);
insert into public.route_private_geometries(route_id, account_id, geojson)
select -991001, account_id, '{}'::jsonb from public.users
where id = current_setting('test.user_a')::uuid;
insert into public.run_photos(id, run_id, owner_user_id, account_id, original_path, taken_at)
select '00000000-0000-4000-8000-000000991021', -991101, id, account_id,
  'runs/' || account_id || '/-991101/private.jpg', now()
from public.users where id = current_setting('test.user_a')::uuid;
insert into public.route_photo_selections(route_id, run_photo_id)
values (-991002, '00000000-0000-4000-8000-000000991021');
insert into storage.objects(bucket_id, name, owner_id)
values
  ('route-photos', 'routes/-991001/private.jpg', current_setting('test.user_a')),
  ('route-photos', 'routes/-991002/public.jpg', current_setting('test.user_a')),
  ('route-photos', 'routes/-991002/hidden.jpg', current_setting('test.user_a'));

select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.routes where id in (-991001, -991002, -991003)) <> 2
    or (select count(*) from public.runs where id in (-991101, -991102)) <> 1
    or (select count(*) from public.route_spot_photos where id in
      ('00000000-0000-4000-8000-000000991001', '00000000-0000-4000-8000-000000991002', '00000000-0000-4000-8000-000000991003')) <> 3
    or (select count(*) from public.run_photos where id = '00000000-0000-4000-8000-000000991021') <> 1
    or (select count(*) from public.route_private_geometries where route_id = -991001) <> 1
    or (select count(*) from public.route_photo_selections where route_id = -991002) <> 1 then
    raise exception 'User A cannot read all own records or can read B private records';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('test.user_b'), true);
set local role authenticated;
do $$
declare affected integer;
begin
  if (select count(*) from public.routes where id in (-991001, -991002, -991003)) <> 2
    or (select count(*) from public.routes where id = -991001) <> 0
    or (select count(*) from public.runs where id in (-991101, -991102)) <> 1
    or (select count(*) from public.route_spot_photos where id = '00000000-0000-4000-8000-000000991002') <> 1
    or (select count(*) from public.route_spot_photos where id in
      ('00000000-0000-4000-8000-000000991001', '00000000-0000-4000-8000-000000991003')) <> 0
    or (select count(*) from public.route_markers where id = '00000000-0000-4000-8000-000000991011') <> 1
    or (select count(*) from public.route_markers where id = '00000000-0000-4000-8000-000000991012') <> 0
    or (select count(*) from public.run_photos where id = '00000000-0000-4000-8000-000000991021') <> 0
    or (select count(*) from public.route_private_geometries where route_id = -991001) <> 0
    or (select count(*) from public.route_photo_selections where route_id = -991002) <> 0
    or (select count(*) from storage.objects where name = 'routes/-991002/public.jpg') <> 1
    or (select count(*) from storage.objects where name in ('routes/-991001/private.jpg', 'routes/-991002/hidden.jpg')) <> 0
    or has_table_privilege('authenticated', 'public.account_memberships', 'INSERT')
    or has_table_privilege('authenticated', 'public.account_memberships', 'UPDATE')
    or has_table_privilege('authenticated', 'public.plan_entitlements', 'DELETE') then
    raise exception 'User B read boundary failed';
  end if;

  update public.routes set name = 'forbidden' where id in (-991001, -991002);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'User B updated A routes'; end if;
  delete from public.routes where id in (-991001, -991002);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'User B deleted A routes'; end if;
  update public.runs set name = 'forbidden' where id = -991101;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'User B updated A run'; end if;
  delete from public.runs where id = -991101;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'User B deleted A run'; end if;
  update public.route_spot_photos set sort_order = 1 where id = '00000000-0000-4000-8000-000000991002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'User B updated A public photo'; end if;
  delete from public.route_spot_photos where id = '00000000-0000-4000-8000-000000991002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'User B deleted A public photo'; end if;
  update public.run_photos set mime_type = 'image/jpeg' where id = '00000000-0000-4000-8000-000000991021';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'User B updated A run photo'; end if;
  delete from public.run_photos where id = '00000000-0000-4000-8000-000000991021';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'User B deleted A run photo'; end if;
  update storage.objects set metadata = '{}'::jsonb where name = 'routes/-991002/public.jpg';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'User B updated A public Storage photo'; end if;
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where name = 'routes/-991002/public.jpg';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'User B deleted A public Storage photo'; end if;

  begin
    insert into public.routes(id, name, origin, account_id)
    values (-991004, 'forbidden', 'drawn', current_setting('test.account_a')::uuid);
    raise exception 'User B inserted into A account';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.route_spot_photos(id, route_id, user_id, image_url)
    values ('00000000-0000-4000-8000-000000991031', -991002, auth.uid(), 'routes/-991002/spoof.jpg');
    raise exception 'User B inserted photo into A route';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.route_markers(id, route_id, latitude, longitude)
    values ('00000000-0000-4000-8000-000000991032', -991002, 35, 139);
    raise exception 'User B inserted marker into A route';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.run_photos(id, run_id, owner_user_id, account_id, original_path, taken_at)
    values ('00000000-0000-4000-8000-000000991033', -991101, auth.uid(),
      current_setting('test.account_a')::uuid, 'runs/spoof.jpg', now());
    raise exception 'User B inserted photo into A run';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.route_photo_selections(route_id, run_photo_id)
    values (-991003, '00000000-0000-4000-8000-000000991021');
    raise exception 'User B linked A run photo to own route';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_route_publication(-991002, false);
    raise exception 'User B changed A route publication';
  exception when others then
    if sqlerrm <> 'route not found or not owned' then raise; end if;
  end;
end;
$$;

insert into public.routes(id, name, origin, account_id)
select -991004, 'B own temporary route', 'drawn', account_id from public.users where id = auth.uid();
insert into public.runs(id, name, account_id)
select -991104, 'B own temporary run', account_id from public.users where id = auth.uid();
insert into public.route_spot_photos(id, route_id, user_id, image_url)
values ('00000000-0000-4000-8000-000000991041', -991004, auth.uid(), 'routes/-991004/own.jpg');
insert into public.route_markers(id, route_id, latitude, longitude)
values ('00000000-0000-4000-8000-000000991042', -991004, 35, 139);
insert into public.run_photos(id, run_id, owner_user_id, account_id, original_path, taken_at)
values ('00000000-0000-4000-8000-000000991043', -991104, auth.uid(),
  public.current_account_id()::uuid, 'runs/own.jpg', now());
update public.routes set name = 'B edited own route' where id = -991004;
update public.runs set name = 'B edited own run' where id = -991104;
update public.route_spot_photos set sort_order = 1 where id = '00000000-0000-4000-8000-000000991041';
update public.route_markers set comment = 'edited' where id = '00000000-0000-4000-8000-000000991042';
update public.run_photos set mime_type = 'image/jpeg' where id = '00000000-0000-4000-8000-000000991043';
do $$
begin
  if (select count(*) from public.routes where id = -991004 and name = 'B edited own route') <> 1
    or (select count(*) from public.runs where id = -991104 and name = 'B edited own run') <> 1
    or (select count(*) from public.route_spot_photos where id = '00000000-0000-4000-8000-000000991041' and sort_order = 1) <> 1
    or (select count(*) from public.route_markers where id = '00000000-0000-4000-8000-000000991042' and comment = 'edited') <> 1
    or (select count(*) from public.run_photos where id = '00000000-0000-4000-8000-000000991043' and mime_type = 'image/jpeg') <> 1 then
    raise exception 'User B own create/update failed';
  end if;
end;
$$;
delete from public.route_spot_photos where id = '00000000-0000-4000-8000-000000991041';
delete from public.route_markers where id = '00000000-0000-4000-8000-000000991042';
delete from public.run_photos where id = '00000000-0000-4000-8000-000000991043';
delete from public.routes where id = -991004;
delete from public.runs where id = -991104;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;
do $$
begin
  if (select count(*) from public.routes where id in (-991001, -991002, -991003)) <> 1
    or (select count(*) from public.route_spot_photos where id in
      ('00000000-0000-4000-8000-000000991001', '00000000-0000-4000-8000-000000991002', '00000000-0000-4000-8000-000000991003')) <> 1
    or (select count(*) from storage.objects where name in
      ('routes/-991001/private.jpg', 'routes/-991002/public.jpg', 'routes/-991002/hidden.jpg')) <> 1
    or has_table_privilege('anon', 'public.routes', 'INSERT')
    or has_table_privilege('anon', 'public.runs', 'SELECT')
    or has_table_privilege('anon', 'public.account_members', 'INSERT')
    or has_function_privilege('anon', 'public.has_account_role(uuid,text[])', 'EXECUTE') then
    raise exception 'Anonymous read/write boundary failed';
  end if;
end;
$$;

rollback;
