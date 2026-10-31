-- A route's publication no longer publishes its original photo objects.
-- Existing photos stay private until their owner explicitly selects them.
alter table public.route_spot_photos
  add column if not exists is_publicly_selected boolean not null default false,
  add column if not exists public_image_url text;

alter table public.route_spot_photos
  add constraint route_spot_photos_public_copy_path_check check (
    public_image_url is null or
    public_image_url like 'routes/' || route_id::text || '/public/' || id::text || '/%'
  ),
  add constraint route_spot_photos_public_selection_check check (
    not is_publicly_selected or public_image_url is not null
  );

create or replace function public.is_public_route_photo_object(object_name text)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.route_spot_photos photo
    join public.routes route on route.id = photo.route_id
    where route.is_public is true
      and photo.is_publicly_selected is true
      and photo.is_privacy_hidden is false
      and photo.deleted_at is null
      and photo.public_image_url = object_name
  );
$$;

drop policy if exists cycling_book_route_photos_public_select on public.route_spot_photos;
create policy cycling_book_route_photos_public_select on public.route_spot_photos
  for select to authenticated, anon using (
    exists (
      select 1 from public.routes route
      where route.id = route_spot_photos.route_id
        and route.is_public is true
        and route_spot_photos.is_publicly_selected is true
        and route_spot_photos.public_image_url is not null
        and route_spot_photos.is_privacy_hidden is false
        and route_spot_photos.deleted_at is null
    )
  );

drop policy if exists cycling_book_route_photos_select_boundary on public.route_spot_photos;
create policy cycling_book_route_photos_select_boundary on public.route_spot_photos
  as restrictive for select using (
    exists (
      select 1 from public.routes route
      where route.id = route_spot_photos.route_id
        and (
          route.account_id::text = public.current_account_id()
          or (
            route.is_public is true
            and route_spot_photos.is_publicly_selected is true
            and route_spot_photos.public_image_url is not null
            and route_spot_photos.is_privacy_hidden is false
            and route_spot_photos.deleted_at is null
          )
        )
    )
  );

-- Only the owner may set the published copy and selection flag. Existing
-- update boundaries remain in force; the public SELECT policies grant no write.
