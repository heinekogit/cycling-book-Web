-- Fix authenticated access to private route photos.
-- Existing objects, buckets, and unrelated Storage policies are not changed.

begin;

create or replace function public.can_access_route_photo_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_app_developer()
    and exists (
      select 1
      from public.routes route
      where route.id::text = (storage.foldername(object_name))[2]
        and route.account_id::text = public.current_account_id()
    );
$$;

revoke all on function public.can_access_route_photo_object(text) from public;
grant execute on function public.can_access_route_photo_object(text) to anon, authenticated;

drop policy if exists cycling_book_route_objects_select on storage.objects;
drop policy if exists cycling_book_route_objects_insert on storage.objects;
drop policy if exists cycling_book_route_objects_update on storage.objects;
drop policy if exists cycling_book_route_objects_delete on storage.objects;
drop policy if exists cycling_book_route_objects_boundary on storage.objects;

create policy cycling_book_route_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'route-photos'
  and public.can_access_route_photo_object(name)
);

create policy cycling_book_route_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'route-photos'
  and public.can_access_route_photo_object(name)
);

create policy cycling_book_route_objects_update
on storage.objects for update to authenticated
using (
  bucket_id = 'route-photos'
  and public.can_access_route_photo_object(name)
)
with check (
  bucket_id = 'route-photos'
  and public.can_access_route_photo_object(name)
);

create policy cycling_book_route_objects_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'route-photos'
  and public.can_access_route_photo_object(name)
);

-- This boundary is neutral for every bucket except route-photos.
create policy cycling_book_route_objects_boundary
on storage.objects as restrictive for all to public
using (
  bucket_id <> 'route-photos'
  or public.can_access_route_photo_object(name)
)
with check (
  bucket_id <> 'route-photos'
  or public.can_access_route_photo_object(name)
);

commit;
