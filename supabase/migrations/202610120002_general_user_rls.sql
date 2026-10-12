-- Replace the temporary developer gate with account ownership checks.
-- Keep the existing public-route read policies, but constrain them to is_public.
begin;

create or replace function public.current_account_id()
returns text language sql stable security definer set search_path = '' as $$
  select account_id::text from public.users where id = auth.uid() limit 1;
$$;

create or replace function public.can_access_route_photo_object(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.routes route
    where route.id::text = (storage.foldername(object_name))[2]
      and route.account_id::text = public.current_account_id()
  );
$$;

create or replace function public.can_access_run_photo_object(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (storage.foldername(object_name))[1] = 'runs'
    and (storage.foldername(object_name))[2] = public.current_account_id()
    and exists (
      select 1 from public.runs run
      where run.id::text = (storage.foldername(object_name))[3]
        and run.account_id::text = public.current_account_id()
    );
$$;

create or replace function public.can_access_run_photo(
  requested_run_id bigint, requested_owner_user_id uuid, requested_account_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select requested_owner_user_id = auth.uid()
    and requested_account_id::text = public.current_account_id()
    and exists (
      select 1 from public.runs run where run.id = requested_run_id
        and run.account_id = requested_account_id
    );
$$;

create or replace function public.can_access_route_photo_selection(
  requested_route_id bigint, requested_run_photo_id uuid
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.routes route
    join public.run_photos photo on photo.id = requested_run_photo_id
    where route.id = requested_route_id
      and route.account_id::text = public.current_account_id()
      and photo.account_id = route.account_id
      and photo.owner_user_id = auth.uid()
  );
$$;

-- A fresh registration gets public.users and its personal account from the Auth trigger.
drop policy if exists cycling_book_users_access on public.users;
drop policy if exists cycling_book_users_boundary on public.users;
create policy cycling_book_users_access on public.users for select to authenticated
  using (id = auth.uid());
create policy cycling_book_users_update on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and account_id::text = public.current_account_id());
revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;
grant update (display_name, profile_image, home_lat, home_lng, home_name) on public.users to authenticated;

drop policy if exists cycling_book_routes_access on public.routes;
create policy cycling_book_routes_access on public.routes for all to authenticated
  using (account_id::text = public.current_account_id())
  with check (account_id::text = public.current_account_id());
drop policy if exists cycling_book_routes_insert_boundary on public.routes;
drop policy if exists cycling_book_routes_update_boundary on public.routes;
drop policy if exists cycling_book_routes_delete_boundary on public.routes;
create policy cycling_book_routes_select_boundary on public.routes as restrictive for select to public
  using (is_public is true or account_id::text = public.current_account_id());
create policy cycling_book_routes_insert_boundary on public.routes as restrictive for insert to public
  with check (account_id::text = public.current_account_id());
create policy cycling_book_routes_update_boundary on public.routes as restrictive for update to public
  using (account_id::text = public.current_account_id())
  with check (account_id::text = public.current_account_id());
create policy cycling_book_routes_delete_boundary on public.routes as restrictive for delete to public
  using (account_id::text = public.current_account_id());

drop policy if exists cycling_book_runs_access on public.runs;
drop policy if exists cycling_book_runs_boundary on public.runs;
create policy cycling_book_runs_access on public.runs for all to authenticated
  using (account_id::text = public.current_account_id())
  with check (account_id::text = public.current_account_id());
create policy cycling_book_runs_boundary on public.runs as restrictive for all to public
  using (account_id::text = public.current_account_id())
  with check (account_id::text = public.current_account_id());

drop policy if exists cycling_book_route_photos_access on public.route_spot_photos;
create policy cycling_book_route_photos_access on public.route_spot_photos for all to authenticated
  using (exists (select 1 from public.routes route where route.id = route_id
    and route.account_id::text = public.current_account_id()))
  with check (exists (select 1 from public.routes route where route.id = route_id
    and route.account_id::text = public.current_account_id()));
drop policy if exists cycling_book_route_photos_insert_boundary on public.route_spot_photos;
drop policy if exists cycling_book_route_photos_update_boundary on public.route_spot_photos;
drop policy if exists cycling_book_route_photos_delete_boundary on public.route_spot_photos;
create policy cycling_book_route_photos_select_boundary on public.route_spot_photos as restrictive for select to public
  using (exists (select 1 from public.routes route where route.id = route_id
    and (route.account_id::text = public.current_account_id()
      or (route.is_public is true and is_privacy_hidden is false))));
create policy cycling_book_route_photos_insert_boundary on public.route_spot_photos as restrictive for insert to public
  with check (exists (select 1 from public.routes route where route.id = route_id
    and route.account_id::text = public.current_account_id()));
create policy cycling_book_route_photos_update_boundary on public.route_spot_photos as restrictive for update to public
  using (exists (select 1 from public.routes route where route.id = route_id
    and route.account_id::text = public.current_account_id()))
  with check (exists (select 1 from public.routes route where route.id = route_id
    and route.account_id::text = public.current_account_id()));
create policy cycling_book_route_photos_delete_boundary on public.route_spot_photos as restrictive for delete to public
  using (exists (select 1 from public.routes route where route.id = route_id
    and route.account_id::text = public.current_account_id()));

drop policy if exists route_private_geometries_owner_access on public.route_private_geometries;
create policy route_private_geometries_owner_access on public.route_private_geometries for all to authenticated
  using (account_id::text = public.current_account_id())
  with check (account_id::text = public.current_account_id());

drop policy if exists route_markers_select on public.route_markers;
drop policy if exists route_markers_insert on public.route_markers;
drop policy if exists route_markers_update on public.route_markers;
drop policy if exists route_markers_delete on public.route_markers;
create policy route_markers_select on public.route_markers for select to anon, authenticated
  using (exists (select 1 from public.routes route where route.id = route_id
    and (route.account_id::text = public.current_account_id()
      or (route.is_public is true and is_privacy_hidden is false))));
create policy route_markers_insert on public.route_markers for insert to authenticated
  with check (exists (select 1 from public.routes route where route.id = route_id
    and route.account_id::text = public.current_account_id()));
create policy route_markers_update on public.route_markers for update to authenticated
  using (exists (select 1 from public.routes route where route.id = route_id
    and route.account_id::text = public.current_account_id()))
  with check (exists (select 1 from public.routes route where route.id = route_id
    and route.account_id::text = public.current_account_id()));
create policy route_markers_delete on public.route_markers for delete to authenticated
  using (exists (select 1 from public.routes route where route.id = route_id
    and route.account_id::text = public.current_account_id()));

-- These older tables had broad grants and no RLS. Clients only need read access.
alter table public.accounts enable row level security;
alter table public.account_members enable row level security;
alter table public.orgs enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
revoke all on public.accounts, public.account_members, public.orgs, public.plans, public.subscriptions from public, anon, authenticated;
grant select on public.accounts, public.orgs, public.plans, public.subscriptions to authenticated;
-- Older route policies still parse a lookup on this table. RLS exposes no rows.
grant select on public.account_members to authenticated;
create policy cycling_book_accounts_select on public.accounts for select to authenticated
  using (id::text = public.current_account_id() or public.has_account_role(id));
create policy cycling_book_orgs_select on public.orgs for select to authenticated
  using (public.has_account_role(account_id));
create policy cycling_book_plans_select on public.plans for select to authenticated using (true);
create policy cycling_book_subscriptions_select on public.subscriptions for select to authenticated
  using (account_id::text = public.current_account_id() or public.has_account_role(account_id));

-- Existing Storage permissive policies include public-photo reads; a write must
-- additionally prove ownership, even when the photo belongs to a public route.
drop policy if exists cycling_book_route_objects_boundary on storage.objects;
create policy cycling_book_route_objects_select_boundary on storage.objects as restrictive for select to public
  using (bucket_id <> 'route-photos' or public.can_access_cycling_photo_object(name));
create policy cycling_book_route_objects_insert_boundary on storage.objects as restrictive for insert to public
  with check (bucket_id <> 'route-photos' or (auth.role() = 'authenticated' and
    (public.can_access_route_photo_object(name) or public.can_access_run_photo_object(name))));
create policy cycling_book_route_objects_update_boundary on storage.objects as restrictive for update to public
  using (bucket_id <> 'route-photos' or (auth.role() = 'authenticated' and
    (public.can_access_route_photo_object(name) or public.can_access_run_photo_object(name))))
  with check (bucket_id <> 'route-photos' or (auth.role() = 'authenticated' and
    (public.can_access_route_photo_object(name) or public.can_access_run_photo_object(name))));
create policy cycling_book_route_objects_delete_boundary on storage.objects as restrictive for delete to public
  using (bucket_id <> 'route-photos' or (auth.role() = 'authenticated' and
    (public.can_access_route_photo_object(name) or public.can_access_run_photo_object(name))));

-- Keep the current eight-argument publication RPC, removing only its developer gate.
create or replace function public.set_route_publication(
  requested_route_id bigint, make_public boolean, filtered_geojson jsonb default null,
  filter_enabled boolean default true, radius_m integer default 500,
  filtered_distance_m double precision default null,
  hidden_photo_ids uuid[] default '{}'::uuid[], hidden_marker_ids uuid[] default '{}'::uuid[]
)
returns table(id bigint, is_public boolean)
language plpgsql security definer set search_path = '' as $$
declare
  owned_route public.routes%rowtype;
  private_geometry public.route_private_geometries%rowtype;
begin
  select route.* into owned_route from public.routes as route
  where route.id = requested_route_id
    and route.account_id::text = public.current_account_id()
  for update;
  if not found then raise exception 'route not found or not owned'; end if;
  if make_public then
    if filtered_geojson is null then raise exception 'public geometry is required'; end if;
    insert into public.route_private_geometries
      (route_id, account_id, geojson, polyline, distance_m, updated_at)
    values (owned_route.id, owned_route.account_id, owned_route.geojson, owned_route.polyline, owned_route.distance_m, now())
    on conflict (route_id) do nothing;
    update public.routes as route set geojson = filtered_geojson, polyline = null,
      distance_m = coalesce(filtered_distance_m, owned_route.distance_m), is_public = true,
      privacy_filter_enabled = filter_enabled,
      privacy_zone_radius_m = case when filter_enabled then radius_m else null end
    where route.id = owned_route.id;
    update public.route_markers as marker
      set is_privacy_hidden = marker.id = any(coalesce(hidden_marker_ids, '{}'::uuid[]))
    where marker.route_id = owned_route.id;
    update public.route_spot_photos as photo
      set is_privacy_hidden = photo.id = any(coalesce(hidden_photo_ids, '{}'::uuid[]))
        or exists (select 1 from public.route_markers marker where marker.id = photo.marker_id and marker.is_privacy_hidden)
    where photo.route_id = owned_route.id;
  else
    select geometry.* into private_geometry from public.route_private_geometries as geometry
    where geometry.route_id = owned_route.id;
    update public.routes as route set
      geojson = coalesce(private_geometry.geojson, owned_route.geojson),
      polyline = case when private_geometry.route_id is null then owned_route.polyline else private_geometry.polyline end,
      distance_m = coalesce(private_geometry.distance_m, owned_route.distance_m),
      is_public = false, privacy_filter_enabled = false, privacy_zone_radius_m = null
    where route.id = owned_route.id;
    update public.route_markers set is_privacy_hidden = false where route_id = owned_route.id;
    update public.route_spot_photos set is_privacy_hidden = false where route_id = owned_route.id;
    delete from public.route_private_geometries where route_id = owned_route.id;
  end if;
  return query select route.id::bigint, route.is_public::boolean from public.routes route where route.id = owned_route.id;
end;
$$;
revoke all on function public.set_route_publication(bigint, boolean, jsonb, boolean, integer, double precision, uuid[], uuid[]) from public, anon;
grant execute on function public.set_route_publication(bigint, boolean, jsonb, boolean, integer, double precision, uuid[], uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
