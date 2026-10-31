-- Older route photos use flat object names (for example, 1768010554045.jpg).
-- Keep those originals private while letting their route account read them.
create or replace function public.can_access_route_photo_object(object_name text)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.routes route
    where route.id::text = (storage.foldername(object_name))[2]
      and route.account_id::text = public.current_account_id()
  ) or (
    cardinality(storage.foldername(object_name)) = 0
    and exists (
      select 1 from public.route_spot_photos photo
      join public.routes route on route.id = photo.route_id
      where route.account_id::text = public.current_account_id()
        and object_name in (
          photo.image_url,
          photo.thumb_url,
          split_part(split_part(photo.image_url, '/route-photos/', 2), '?', 1),
          split_part(split_part(photo.thumb_url, '/route-photos/', 2), '?', 1)
        )
    )
  );
$$;
