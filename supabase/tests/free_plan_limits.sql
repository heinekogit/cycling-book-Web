-- Run after 20261025000100_initial_free_limits.sql in a development database.
-- All synthetic Auth users and routes are rolled back.
begin;

do $$
begin
  if exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000992001')
    or exists (select 1 from public.routes where id between -992021 and -992001) then
    raise exception 'free plan synthetic IDs already exist';
  end if;
end;
$$;

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000992001',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'free-limit-test@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

do $$
declare
  v_account_id uuid;
begin
  select u.account_id into v_account_id from public.users u
  where u.id = '00000000-0000-4000-8000-000000992001';
  if v_account_id is null or not exists (
    select 1 from public.subscriptions s
    where s.account_id = v_account_id and s.plan_id = 'free' and s.status = 'active'
  ) then
    raise exception 'free subscription was not created';
  end if;

  insert into public.routes(id, name, origin, account_id, owner_account_id, is_public)
  select -992000 - n, 'free limit test', 'drawn', v_account_id, v_account_id, true
  from generate_series(1, 20) as n;
  insert into public.routes(id, name, origin, account_id, owner_account_id, is_public)
  values (-992021, 'free limit test', 'drawn', v_account_id, v_account_id, false);

  begin
    update public.routes set is_public = true where id = -992021;
    raise exception '21st public route was accepted';
  exception when others then
    if sqlerrm <> 'free_public_route_limit_reached' then raise; end if;
  end;

  update public.routes set name = 'still public' where id = -992001;
  update public.routes set is_public = false where id = -992001;
  update public.routes set is_public = true where id = -992021;
  if (select count(*) from public.routes r
      where r.account_id = v_account_id and r.is_public) <> 20 then
    raise exception 'unpublish/re-publish at the limit failed';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'route-photos'
      and file_size_limit = 20 * 1024 * 1024
      and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/heic']::text[]
      and not allowed_mime_types @> array['image/svg+xml']::text[]
  ) then
    raise exception 'photo bucket limits are missing';
  end if;
end;
$$;

rollback;
