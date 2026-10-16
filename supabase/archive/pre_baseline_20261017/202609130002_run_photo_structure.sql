-- Additive photo model for recorded rides. Existing photo data is unchanged.
begin;

create table if not exists public.run_photos (
  id uuid primary key default gen_random_uuid(),
  run_id bigint not null references public.runs(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  bucket_id text not null default 'route-photos' check (bucket_id = 'route-photos'),
  original_path text not null,
  thumbnail_path text,
  taken_at timestamptz not null,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, original_path),
  check (thumbnail_path is null or thumbnail_path <> original_path)
);
create index if not exists run_photos_run_taken_at_idx on public.run_photos (run_id, taken_at desc);
create index if not exists run_photos_account_idx on public.run_photos (account_id);

create or replace function public.set_run_photo_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_run_photo_updated_at() from public;
drop trigger if exists set_run_photo_updated_at on public.run_photos;
create trigger set_run_photo_updated_at
before update on public.run_photos
for each row execute function public.set_run_photo_updated_at();

create table if not exists public.route_photo_selections (
  route_id bigint not null references public.routes(id) on delete cascade,
  run_photo_id uuid not null references public.run_photos(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  caption text,
  selected_at timestamptz not null default now(),
  primary key (route_id, run_photo_id)
);
create index if not exists route_photo_selections_order_idx
  on public.route_photo_selections (route_id, sort_order, selected_at);

-- Compatibility links for existing clients. No existing row is rewritten.
alter table public.route_spot_photos add column if not exists run_photo_id uuid
  references public.run_photos(id) on delete set null;
alter table public.route_spot_photos add column if not exists run_id bigint
  references public.runs(id) on delete set null;
create unique index if not exists route_spot_photos_run_photo_id_uidx
  on public.route_spot_photos (run_photo_id) where run_photo_id is not null;

alter table public.run_photos enable row level security;
alter table public.route_photo_selections enable row level security;
revoke all on table public.run_photos, public.route_photo_selections from anon;
grant select, insert, update, delete on table public.run_photos, public.route_photo_selections to authenticated;

create or replace function public.can_access_run_photo(
  requested_run_id bigint, requested_owner_user_id uuid, requested_account_id uuid
)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_app_developer()
    and requested_owner_user_id = auth.uid()
    and requested_account_id::text = public.current_account_id()
    and exists (
      select 1 from public.runs run
      where run.id = requested_run_id
        and run.account_id::text = requested_account_id::text
    );
$$;
revoke all on function public.can_access_run_photo(bigint, uuid, uuid) from public;
grant execute on function public.can_access_run_photo(bigint, uuid, uuid) to anon, authenticated;

drop policy if exists cycling_book_run_photos_access on public.run_photos;
drop policy if exists cycling_book_run_photos_boundary on public.run_photos;
create policy cycling_book_run_photos_access on public.run_photos for all to authenticated
using (public.can_access_run_photo(run_id, owner_user_id, account_id))
with check (public.can_access_run_photo(run_id, owner_user_id, account_id));
create policy cycling_book_run_photos_boundary on public.run_photos as restrictive for all to public
using (public.can_access_run_photo(run_id, owner_user_id, account_id))
with check (public.can_access_run_photo(run_id, owner_user_id, account_id));

create or replace function public.can_access_route_photo_selection(
  requested_route_id bigint, requested_run_photo_id uuid
)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_app_developer() and exists (
    select 1 from public.routes route
    join public.run_photos photo on photo.id = requested_run_photo_id
    where route.id = requested_route_id
      and route.account_id::text = public.current_account_id()
      and photo.account_id::text = route.account_id::text
      and photo.owner_user_id = auth.uid()
  );
$$;
revoke all on function public.can_access_route_photo_selection(bigint, uuid) from public;
grant execute on function public.can_access_route_photo_selection(bigint, uuid) to anon, authenticated;

drop policy if exists cycling_book_route_photo_selections_access on public.route_photo_selections;
drop policy if exists cycling_book_route_photo_selections_boundary on public.route_photo_selections;
create policy cycling_book_route_photo_selections_access
on public.route_photo_selections for all to authenticated
using (public.can_access_route_photo_selection(route_id, run_photo_id))
with check (public.can_access_route_photo_selection(route_id, run_photo_id));
create policy cycling_book_route_photo_selections_boundary
on public.route_photo_selections as restrictive for all to public
using (public.can_access_route_photo_selection(route_id, run_photo_id))
with check (public.can_access_route_photo_selection(route_id, run_photo_id));

-- New paths:
-- runs/{account_id}/{run_id}/{photo_id}/original.ext
-- runs/{account_id}/{run_id}/{photo_id}/thumbnail.jpg
create or replace function public.can_access_run_photo_object(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_app_developer()
    and (storage.foldername(object_name))[1] = 'runs'
    and (storage.foldername(object_name))[2] = public.current_account_id()
    and exists (
      select 1 from public.runs run
      where run.id::text = (storage.foldername(object_name))[3]
        and run.account_id::text = public.current_account_id()
    );
$$;
create or replace function public.can_access_cycling_photo_object(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.can_access_route_photo_object(object_name)
    or public.can_access_run_photo_object(object_name);
$$;
revoke all on function public.can_access_run_photo_object(text) from public;
revoke all on function public.can_access_cycling_photo_object(text) from public;
grant execute on function public.can_access_run_photo_object(text) to anon, authenticated;
grant execute on function public.can_access_cycling_photo_object(text) to anon, authenticated;

-- Replace only Cycling Book policies; other buckets and policies are untouched.
drop policy if exists cycling_book_route_objects_select on storage.objects;
drop policy if exists cycling_book_route_objects_insert on storage.objects;
drop policy if exists cycling_book_route_objects_update on storage.objects;
drop policy if exists cycling_book_route_objects_delete on storage.objects;
drop policy if exists cycling_book_route_objects_boundary on storage.objects;
create policy cycling_book_route_objects_select on storage.objects for select to authenticated
using (bucket_id = 'route-photos' and public.can_access_cycling_photo_object(name));
create policy cycling_book_route_objects_insert on storage.objects for insert to authenticated
with check (bucket_id = 'route-photos' and public.can_access_cycling_photo_object(name));
create policy cycling_book_route_objects_update on storage.objects for update to authenticated
using (bucket_id = 'route-photos' and public.can_access_cycling_photo_object(name))
with check (bucket_id = 'route-photos' and public.can_access_cycling_photo_object(name));
create policy cycling_book_route_objects_delete on storage.objects for delete to authenticated
using (bucket_id = 'route-photos' and public.can_access_cycling_photo_object(name));
create policy cycling_book_route_objects_boundary on storage.objects as restrictive for all to public
using (bucket_id <> 'route-photos' or public.can_access_cycling_photo_object(name))
with check (bucket_id <> 'route-photos' or public.can_access_cycling_photo_object(name));

commit;
