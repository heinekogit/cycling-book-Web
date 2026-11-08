-- Two-phase personal-account withdrawal. The client removes Storage bytes
-- between these calls; DB rows are retained until no matching objects remain.
create or replace function public.prepare_my_account_deletion()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_user_id uuid := auth.uid();
  v_account_id uuid;
  objects jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select u.account_id into v_account_id
    from public.users u join public.accounts a on a.id = u.account_id and a.type = 'user'
    where u.id = v_user_id for update of u, a;
  if v_account_id is null then raise exception 'Personal account not found'; end if;
  if exists (select 1 from public.users u where u.account_id = v_account_id and u.id <> v_user_id)
    or exists (select 1 from public.account_members m where m.account_id = v_account_id and m.user_id <> v_user_id)
    or exists (select 1 from public.account_memberships m where m.user_id = v_user_id and m.account_id <> v_account_id and m.status <> 'left')
    or exists (select 1 from public.account_members m where m.user_id = v_user_id and m.account_id <> v_account_id)
    or exists (select 1 from public.route_spot_photos p where p.user_id = v_user_id and not exists (select 1 from public.routes r where r.id = p.route_id and r.account_id = v_account_id))
    or exists (select 1 from public.run_photos p where p.owner_user_id = v_user_id and p.account_id <> v_account_id)
  then raise exception 'Shared or external account data requires review'; end if;

  -- Revocation precedes Storage deletion. The operation can be retried.
  update public.routes set is_public = false, visibility = 'private'
    where routes.account_id = v_account_id and (is_public or visibility is distinct from 'private');
  select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'path', o.name)
                        order by o.bucket_id, o.name), '[]'::jsonb) into objects
  from storage.objects o where o.owner = v_user_id or o.owner_id = v_user_id::text
    or (o.bucket_id = 'route-photos' and (
      exists (select 1 from public.routes r where r.account_id = v_account_id and o.name like 'routes/' || r.id::text || '/%')
      or o.name like 'runs/' || v_account_id::text || '/%'));
  return objects;
end;
$$;

create or replace function public.complete_my_account_deletion()
returns void language plpgsql security definer set search_path to '' as $$
declare
  v_user_id uuid := auth.uid();
  v_account_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select u.account_id into v_account_id
    from public.users u join public.accounts a on a.id = u.account_id and a.type = 'user'
    where u.id = v_user_id for update of u, a;
  if v_account_id is null then raise exception 'Personal account not found'; end if;
  if exists (select 1 from public.users u where u.account_id = v_account_id and u.id <> v_user_id)
    or exists (select 1 from public.account_members m where m.account_id = v_account_id and m.user_id <> v_user_id)
    or exists (select 1 from public.account_memberships m where m.user_id = v_user_id and m.account_id <> v_account_id and m.status <> 'left')
    or exists (select 1 from public.account_members m where m.user_id = v_user_id and m.account_id <> v_account_id)
    or exists (select 1 from public.route_spot_photos p where p.user_id = v_user_id and not exists (select 1 from public.routes r where r.id = p.route_id and r.account_id = v_account_id))
    or exists (select 1 from public.run_photos p where p.owner_user_id = v_user_id and p.account_id <> v_account_id)
  then raise exception 'Shared or external account data requires review'; end if;
  if exists (select 1 from public.routes r where r.account_id = v_account_id and r.is_public)
  then raise exception 'Public route must be withdrawn first'; end if;
  if exists (select 1 from storage.objects o where o.owner = v_user_id or o.owner_id = v_user_id::text
    or (o.bucket_id = 'route-photos' and (
      exists (select 1 from public.routes r where r.account_id = v_account_id and o.name like 'routes/' || r.id::text || '/%')
      or o.name like 'runs/' || v_account_id::text || '/%')))
  then raise exception 'Storage objects remain'; end if;

  delete from public.route_spot_photos p where p.user_id = v_user_id;
  delete from public.routes r where r.account_id = v_account_id;
  delete from public.runs r where r.account_id = v_account_id;
  -- The existing function checks remaining references and deletes the account
  -- and Auth user atomically in this same transaction.
  perform public.delete_my_empty_account();
end;
$$;

revoke all on function public.prepare_my_account_deletion() from public, anon;
revoke all on function public.complete_my_account_deletion() from public, anon;
grant execute on function public.prepare_my_account_deletion() to authenticated, service_role;
grant execute on function public.complete_my_account_deletion() to authenticated, service_role;
