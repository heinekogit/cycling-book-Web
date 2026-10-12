-- Make route publication tolerant of empty photo selections and explicit about
-- the result types returned through PostgREST.
begin;

drop function if exists public.set_route_publication(bigint, boolean, jsonb, boolean, integer, double precision, uuid[]);

create function public.set_route_publication(
  requested_route_id bigint,
  make_public boolean,
  filtered_geojson jsonb default null,
  filter_enabled boolean default true,
  radius_m integer default 500,
  filtered_distance_m double precision default null,
  hidden_photo_ids uuid[] default '{}'::uuid[]
)
returns table(id bigint, is_public boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owned_route public.routes%rowtype;
  private_geometry public.route_private_geometries%rowtype;
begin
  select route.* into owned_route
  from public.routes as route
  where route.id = requested_route_id
    and route.account_id::text = public.current_account_id()
    and public.is_app_developer()
  for update;

  if not found then
    raise exception 'route not found or not owned';
  end if;

  if make_public then
    if filtered_geojson is null then
      raise exception 'public geometry is required';
    end if;

    insert into public.route_private_geometries
      (route_id, account_id, geojson, polyline, distance_m, updated_at)
    values
      (owned_route.id, owned_route.account_id, owned_route.geojson, owned_route.polyline, owned_route.distance_m, now())
    on conflict (route_id) do nothing;

    update public.routes as route
    set geojson = filtered_geojson,
        polyline = null,
        distance_m = coalesce(filtered_distance_m, owned_route.distance_m),
        is_public = true,
        privacy_filter_enabled = filter_enabled,
        privacy_zone_radius_m = case when filter_enabled then radius_m else null end
    where route.id = owned_route.id;

    update public.route_spot_photos as photo
    set is_privacy_hidden = photo.id = any(coalesce(hidden_photo_ids, '{}'::uuid[]))
    where photo.route_id = owned_route.id;
  else
    select geometry.* into private_geometry
    from public.route_private_geometries as geometry
    where geometry.route_id = owned_route.id;

    update public.routes as route
    set geojson = coalesce(private_geometry.geojson, owned_route.geojson),
        polyline = case when private_geometry.route_id is null then owned_route.polyline else private_geometry.polyline end,
        distance_m = coalesce(private_geometry.distance_m, owned_route.distance_m),
        is_public = false,
        privacy_filter_enabled = false,
        privacy_zone_radius_m = null
    where route.id = owned_route.id;

    update public.route_spot_photos as photo
    set is_privacy_hidden = false
    where photo.route_id = owned_route.id;

    delete from public.route_private_geometries as geometry
    where geometry.route_id = owned_route.id;
  end if;

  return query
  select route.id::bigint, route.is_public::boolean
  from public.routes as route
  where route.id = owned_route.id;
end;
$$;

revoke all on function public.set_route_publication(bigint, boolean, jsonb, boolean, integer, double precision, uuid[]) from public;
grant execute on function public.set_route_publication(bigint, boolean, jsonb, boolean, integer, double precision, uuid[]) to authenticated;

notify pgrst, 'reload schema';

commit;
