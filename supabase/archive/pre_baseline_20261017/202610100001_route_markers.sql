begin;

create table public.route_markers (
  id uuid primary key default gen_random_uuid(),
  route_id bigint not null references public.routes(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  comment text not null default '' check (char_length(comment) <= 500),
  sort_order integer not null default 0,
  is_privacy_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.route_markers add constraint route_markers_id_route_unique unique (id, route_id);
create index route_markers_route_order_idx on public.route_markers(route_id, sort_order);
alter table public.route_markers enable row level security;
grant select on public.route_markers to anon;
grant select, insert, update, delete on public.route_markers to authenticated;

create policy route_markers_select on public.route_markers for select to anon, authenticated
using (exists (
  select 1 from public.routes route where route.id = route_id
    and ((route.is_public and not is_privacy_hidden)
      or (public.is_app_developer() and route.account_id::text = public.current_account_id()))
));
create policy route_markers_insert on public.route_markers for insert to authenticated
with check (public.is_app_developer() and exists (
  select 1 from public.routes route where route.id = route_id and route.account_id::text = public.current_account_id()
));
create policy route_markers_update on public.route_markers for update to authenticated
using (public.is_app_developer() and exists (
  select 1 from public.routes route where route.id = route_id and route.account_id::text = public.current_account_id()
)) with check (public.is_app_developer() and exists (
  select 1 from public.routes route where route.id = route_id and route.account_id::text = public.current_account_id()
));
create policy route_markers_delete on public.route_markers for delete to authenticated
using (public.is_app_developer() and exists (
  select 1 from public.routes route where route.id = route_id and route.account_id::text = public.current_account_id()
));

alter table public.route_spot_photos add column marker_id uuid;
alter table public.route_spot_photos add constraint route_spot_photos_marker_route_fk
  foreign key (marker_id, route_id) references public.route_markers(id, route_id) on delete cascade;
create index route_spot_photos_marker_order_idx on public.route_spot_photos(marker_id, sort_order);

create or replace function public.is_public_route_photo_object(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.route_spot_photos photo
    join public.routes route on route.id = photo.route_id
    where route.is_public is true and photo.is_privacy_hidden is false
      and (photo.image_url = object_name or photo.thumb_url = object_name
        or photo.image_url like '%' || object_name or photo.thumb_url like '%' || object_name)
  );
$$;

drop function if exists public.set_route_publication(bigint, boolean, jsonb, boolean, integer, double precision, uuid[]);
create function public.set_route_publication(
  requested_route_id bigint,
  make_public boolean,
  filtered_geojson jsonb default null,
  filter_enabled boolean default true,
  radius_m integer default 500,
  filtered_distance_m double precision default null,
  hidden_photo_ids uuid[] default '{}'::uuid[],
  hidden_marker_ids uuid[] default '{}'::uuid[]
)
returns table(id bigint, is_public boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  owned_route public.routes%rowtype;
  private_geometry public.route_private_geometries%rowtype;
begin
  select route.* into owned_route from public.routes as route
  where route.id = requested_route_id
    and route.account_id::text = public.current_account_id()
    and public.is_app_developer()
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
revoke all on function public.set_route_publication(bigint, boolean, jsonb, boolean, integer, double precision, uuid[], uuid[]) from public;
grant execute on function public.set_route_publication(bigint, boolean, jsonb, boolean, integer, double precision, uuid[], uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;
