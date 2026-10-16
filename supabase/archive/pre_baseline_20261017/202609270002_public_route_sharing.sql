-- Allow anonymous read access only to explicitly public routes and their photos.
-- Owner-only writes remain protected by the existing developer/account policies.
begin;

grant select on table public.routes, public.route_spot_photos to anon;

drop policy if exists cycling_book_routes_boundary on public.routes;
drop policy if exists cycling_book_routes_public_select on public.routes;
drop policy if exists cycling_book_routes_insert_boundary on public.routes;
drop policy if exists cycling_book_routes_update_boundary on public.routes;
drop policy if exists cycling_book_routes_delete_boundary on public.routes;

create policy cycling_book_routes_public_select
on public.routes for select to anon, authenticated
using (
  is_public is true
  or (public.is_app_developer() and account_id::text = public.current_account_id())
);

create policy cycling_book_routes_insert_boundary
on public.routes as restrictive for insert to authenticated
with check (public.is_app_developer() and account_id::text = public.current_account_id());
create policy cycling_book_routes_update_boundary
on public.routes as restrictive for update to authenticated
using (public.is_app_developer() and account_id::text = public.current_account_id())
with check (public.is_app_developer() and account_id::text = public.current_account_id());
create policy cycling_book_routes_delete_boundary
on public.routes as restrictive for delete to authenticated
using (public.is_app_developer() and account_id::text = public.current_account_id());

drop policy if exists cycling_book_route_photos_boundary on public.route_spot_photos;
drop policy if exists cycling_book_route_photos_public_select on public.route_spot_photos;
drop policy if exists cycling_book_route_photos_insert_boundary on public.route_spot_photos;
drop policy if exists cycling_book_route_photos_update_boundary on public.route_spot_photos;
drop policy if exists cycling_book_route_photos_delete_boundary on public.route_spot_photos;

create policy cycling_book_route_photos_public_select
on public.route_spot_photos for select to anon, authenticated
using (exists (
  select 1 from public.routes route
  where route.id = route_spot_photos.route_id
    and (
      route.is_public is true
      or (public.is_app_developer() and route.account_id::text = public.current_account_id())
    )
));

create policy cycling_book_route_photos_insert_boundary
on public.route_spot_photos as restrictive for insert to authenticated
with check (public.is_app_developer() and exists (
  select 1 from public.routes route
  where route.id = route_spot_photos.route_id
    and route.account_id::text = public.current_account_id()
));
create policy cycling_book_route_photos_update_boundary
on public.route_spot_photos as restrictive for update to authenticated
using (public.is_app_developer() and exists (
  select 1 from public.routes route
  where route.id = route_spot_photos.route_id
    and route.account_id::text = public.current_account_id()
))
with check (public.is_app_developer() and exists (
  select 1 from public.routes route
  where route.id = route_spot_photos.route_id
    and route.account_id::text = public.current_account_id()
));
create policy cycling_book_route_photos_delete_boundary
on public.route_spot_photos as restrictive for delete to authenticated
using (public.is_app_developer() and exists (
  select 1 from public.routes route
  where route.id = route_spot_photos.route_id
    and route.account_id::text = public.current_account_id()
));

create or replace function public.get_public_profile(requested_account_id uuid)
returns table(account_id uuid, display_name text, profile_image text)
language sql stable security definer set search_path = ''
as $$
  select u.account_id, u.display_name, u.profile_image
  from public.users u
  where u.account_id = requested_account_id
    and exists (
      select 1 from public.routes route
      where route.account_id = requested_account_id and route.is_public is true
    )
  limit 1;
$$;
revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;

create or replace function public.is_public_route_photo_object(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.route_spot_photos photo
    join public.routes route on route.id = photo.route_id
    where route.is_public is true
      and (
        photo.image_url like '%' || object_name
        or photo.thumb_url like '%' || object_name
        or route.id::text = (storage.foldername(object_name))[2]
      )
  );
$$;
revoke all on function public.is_public_route_photo_object(text) from public;
grant execute on function public.is_public_route_photo_object(text) to anon, authenticated;

create or replace function public.can_access_cycling_photo_object(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.can_access_route_photo_object(object_name)
    or public.can_access_run_photo_object(object_name)
    or public.is_public_route_photo_object(object_name);
$$;

drop policy if exists cycling_book_route_objects_select on storage.objects;
drop policy if exists cycling_book_route_objects_boundary on storage.objects;
create policy cycling_book_route_objects_select on storage.objects for select to anon, authenticated
using (bucket_id = 'route-photos' and public.can_access_cycling_photo_object(name));
create policy cycling_book_route_objects_boundary on storage.objects as restrictive for all to public
using (bucket_id <> 'route-photos' or public.can_access_cycling_photo_object(name))
with check (
  bucket_id <> 'route-photos'
  or (auth.role() = 'authenticated' and (
    public.can_access_route_photo_object(name) or public.can_access_run_photo_object(name)
  ))
);

commit;
