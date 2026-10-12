-- Keep the owner's full route geometry private while publishing a filtered copy.
begin;

alter table public.routes
  add column if not exists privacy_filter_enabled boolean not null default false,
  add column if not exists privacy_zone_radius_m integer;

alter table public.route_spot_photos
  add column if not exists is_privacy_hidden boolean not null default false;

create table if not exists public.route_private_geometries (
  route_id bigint primary key references public.routes(id) on delete cascade,
  account_id uuid not null,
  geojson jsonb,
  polyline text,
  distance_m double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.route_private_geometries enable row level security;
revoke all on table public.route_private_geometries from anon;
grant select, insert, update, delete on table public.route_private_geometries to authenticated;

drop policy if exists route_private_geometries_owner_access on public.route_private_geometries;
create policy route_private_geometries_owner_access
on public.route_private_geometries for all to authenticated
using (public.is_app_developer() and account_id::text = public.current_account_id())
with check (public.is_app_developer() and account_id::text = public.current_account_id());

create or replace function public.set_route_publication(
  requested_route_id bigint,
  make_public boolean,
  filtered_geojson jsonb default null,
  filter_enabled boolean default true,
  radius_m integer default 500,
  filtered_distance_m double precision default null,
  hidden_photo_ids uuid[] default '{}'::uuid[]
)
returns table(id bigint, is_public boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  owned_route public.routes%rowtype;
  private_geometry public.route_private_geometries%rowtype;
  has_private_geometry boolean := false;
begin
  select * into owned_route
  from public.routes
  where routes.id = requested_route_id
    and routes.account_id::text = public.current_account_id()
    and public.is_app_developer()
  for update;

  if not found then
    raise exception 'route not found or not owned';
  end if;

  if make_public then
    if filtered_geojson is null then
      raise exception 'public geometry is required';
    end if;

    insert into public.route_private_geometries(route_id, account_id, geojson, polyline, distance_m, updated_at)
    values (owned_route.id, owned_route.account_id, owned_route.geojson, owned_route.polyline, owned_route.distance_m, now())
    on conflict (route_id) do nothing;

    update public.routes
    set geojson = filtered_geojson,
        polyline = null,
        distance_m = coalesce(filtered_distance_m, owned_route.distance_m),
        is_public = true,
        privacy_filter_enabled = filter_enabled,
        privacy_zone_radius_m = case when filter_enabled then radius_m else null end
    where routes.id = owned_route.id;

    update public.route_spot_photos
    set is_privacy_hidden = (id = any(hidden_photo_ids))
    where route_id = owned_route.id;
  else
    select * into private_geometry
    from public.route_private_geometries
    where route_private_geometries.route_id = owned_route.id;
    has_private_geometry := found;

    update public.routes
    set geojson = case when has_private_geometry then private_geometry.geojson else owned_route.geojson end,
        polyline = case when has_private_geometry then private_geometry.polyline else owned_route.polyline end,
        distance_m = case when has_private_geometry then private_geometry.distance_m else owned_route.distance_m end,
        is_public = false,
        privacy_filter_enabled = false,
        privacy_zone_radius_m = null
    where routes.id = owned_route.id;

    update public.route_spot_photos
    set is_privacy_hidden = false
    where route_id = owned_route.id;

    delete from public.route_private_geometries
    where route_private_geometries.route_id = owned_route.id;
  end if;

  return query select routes.id, routes.is_public
  from public.routes where routes.id = owned_route.id;
end;
$$;

revoke all on function public.set_route_publication(bigint, boolean, jsonb, boolean, integer, double precision, uuid[]) from public;
grant execute on function public.set_route_publication(bigint, boolean, jsonb, boolean, integer, double precision, uuid[]) to authenticated;

drop policy if exists cycling_book_route_photos_public_select on public.route_spot_photos;
create policy cycling_book_route_photos_public_select
on public.route_spot_photos for select to anon, authenticated
using (exists (
  select 1 from public.routes route
  where route.id = route_spot_photos.route_id
    and (
      (route.is_public is true and route_spot_photos.is_privacy_hidden is false)
      or (public.is_app_developer() and route.account_id::text = public.current_account_id())
    )
));

create or replace function public.is_public_route_photo_object(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.route_spot_photos photo
    join public.routes route on route.id = photo.route_id
    where route.is_public is true
      and photo.is_privacy_hidden is false
      and (photo.image_url like '%' || object_name or photo.thumb_url like '%' || object_name)
  );
$$;

commit;
