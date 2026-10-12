-- Temporary Cycling Book development lock-down.
-- Apply manually, then remove the email addresses before committing publicly.
-- Existing policies and application data are preserved.

begin;

create table if not exists public.app_developers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_developers enable row level security;
revoke all on table public.app_developers from anon, authenticated;

do $$
declare
  developer_email text;
  developer_uid uuid;
  developer_emails constant text[] := array[
    'heineko@gmail.com',
    'dotblotworks@gmail.com'
  ];
begin
  foreach developer_email in array developer_emails loop
    select id into developer_uid
    from auth.users
    where lower(email) = lower(developer_email)
    limit 1;

    if developer_uid is null then
      raise exception 'No Supabase Auth user found for %', developer_email;
    end if;

    insert into public.app_developers (user_id)
    values (developer_uid)
    on conflict (user_id) do nothing;
  end loop;

  -- Keep this temporary allowlist exact if the migration is run again.
  delete from public.app_developers developer
  where not exists (
    select 1 from auth.users auth_user
    where auth_user.id = developer.user_id
      and lower(auth_user.email) = any (developer_emails)
  );
end
$$;

create or replace function public.is_app_developer()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_developers
    where user_id = auth.uid()
  );
$$;

create or replace function public.current_account_id()
returns text
language sql stable security definer
set search_path = ''
as $$
  select account_id::text
  from public.users
  where id = auth.uid() and public.is_app_developer()
  limit 1;
$$;

revoke all on function public.is_app_developer() from public;
revoke all on function public.current_account_id() from public;
grant execute on function public.is_app_developer() to anon, authenticated;
grant execute on function public.current_account_id() to anon, authenticated;

alter table public.users enable row level security;
alter table public.routes enable row level security;
alter table public.runs enable row level security;
alter table public.route_spot_photos enable row level security;

-- These ACL changes are limited to Cycling Book's four application tables.
revoke all on table public.users, public.routes, public.runs,
  public.route_spot_photos from anon;
grant select, insert, update, delete on table public.users, public.routes,
  public.runs, public.route_spot_photos to authenticated;

-- Only replace policies owned by this migration. Older policies remain intact.
drop policy if exists cycling_book_users_access on public.users;
drop policy if exists cycling_book_users_boundary on public.users;
drop policy if exists cycling_book_routes_access on public.routes;
drop policy if exists cycling_book_routes_boundary on public.routes;
drop policy if exists cycling_book_runs_access on public.runs;
drop policy if exists cycling_book_runs_boundary on public.runs;
drop policy if exists cycling_book_route_photos_access on public.route_spot_photos;
drop policy if exists cycling_book_route_photos_boundary on public.route_spot_photos;

-- Each permissive policy grants the intended access. Its restrictive twin is a
-- hard boundary that older permissive policies cannot widen.
create policy cycling_book_users_access
on public.users for all to authenticated
using (public.is_app_developer() and id = auth.uid())
with check (public.is_app_developer() and id = auth.uid());
create policy cycling_book_users_boundary
on public.users as restrictive for all to public
using (public.is_app_developer() and id = auth.uid())
with check (public.is_app_developer() and id = auth.uid());

create policy cycling_book_routes_access
on public.routes for all to authenticated
using (public.is_app_developer() and account_id::text = public.current_account_id())
with check (public.is_app_developer() and account_id::text = public.current_account_id());
create policy cycling_book_routes_boundary
on public.routes as restrictive for all to public
using (public.is_app_developer() and account_id::text = public.current_account_id())
with check (public.is_app_developer() and account_id::text = public.current_account_id());

create policy cycling_book_runs_access
on public.runs for all to authenticated
using (public.is_app_developer() and account_id::text = public.current_account_id())
with check (public.is_app_developer() and account_id::text = public.current_account_id());
create policy cycling_book_runs_boundary
on public.runs as restrictive for all to public
using (public.is_app_developer() and account_id::text = public.current_account_id())
with check (public.is_app_developer() and account_id::text = public.current_account_id());

create policy cycling_book_route_photos_access
on public.route_spot_photos for all to authenticated
using (
  public.is_app_developer() and exists (
    select 1 from public.routes route
    where route.id = route_spot_photos.route_id
      and route.account_id::text = public.current_account_id()
  )
)
with check (
  public.is_app_developer() and exists (
    select 1 from public.routes route
    where route.id = route_spot_photos.route_id
      and route.account_id::text = public.current_account_id()
  )
);
create policy cycling_book_route_photos_boundary
on public.route_spot_photos as restrictive for all to public
using (
  public.is_app_developer() and exists (
    select 1 from public.routes route
    where route.id = route_spot_photos.route_id
      and route.account_id::text = public.current_account_id()
  )
)
with check (
  public.is_app_developer() and exists (
    select 1 from public.routes route
    where route.id = route_spot_photos.route_id
      and route.account_id::text = public.current_account_id()
  )
);

-- Public downloads bypass Storage SELECT policies, so only this bucket is made
-- private. This changes bucket metadata; it does not delete stored objects.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'route-photos') then
    raise exception 'Storage bucket route-photos does not exist';
  end if;
end
$$;

update storage.buckets set public = false where id = 'route-photos';

-- Never revoke Storage-wide privileges or drop unrelated Storage policies.
drop policy if exists cycling_book_route_objects_select on storage.objects;
drop policy if exists cycling_book_route_objects_insert on storage.objects;
drop policy if exists cycling_book_route_objects_update on storage.objects;
drop policy if exists cycling_book_route_objects_delete on storage.objects;
drop policy if exists cycling_book_route_objects_boundary on storage.objects;

create policy cycling_book_route_objects_select
on storage.objects for select to authenticated
using (
  bucket_id = 'route-photos' and public.is_app_developer() and exists (
    select 1 from public.routes route
    where route.id::text = (storage.foldername(name))[2]
      and route.account_id::text = public.current_account_id()
  )
);
create policy cycling_book_route_objects_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'route-photos' and public.is_app_developer() and exists (
    select 1 from public.routes route
    where route.id::text = (storage.foldername(name))[2]
      and route.account_id::text = public.current_account_id()
  )
);
create policy cycling_book_route_objects_update
on storage.objects for update to authenticated
using (
  bucket_id = 'route-photos' and public.is_app_developer() and exists (
    select 1 from public.routes route
    where route.id::text = (storage.foldername(name))[2]
      and route.account_id::text = public.current_account_id()
  )
)
with check (
  bucket_id = 'route-photos' and public.is_app_developer() and exists (
    select 1 from public.routes route
    where route.id::text = (storage.foldername(name))[2]
      and route.account_id::text = public.current_account_id()
  )
);
create policy cycling_book_route_objects_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'route-photos' and public.is_app_developer() and exists (
    select 1 from public.routes route
    where route.id::text = (storage.foldername(name))[2]
      and route.account_id::text = public.current_account_id()
  )
);

-- For other buckets this restrictive expression is TRUE, so their existing
-- policies continue to decide access exactly as before.
create policy cycling_book_route_objects_boundary
on storage.objects as restrictive for all to public
using (
  bucket_id <> 'route-photos' or (
    public.is_app_developer() and exists (
      select 1 from public.routes route
      where route.id::text = (storage.foldername(name))[2]
        and route.account_id::text = public.current_account_id()
    )
  )
)
with check (
  bucket_id <> 'route-photos' or (
    public.is_app_developer() and exists (
      select 1 from public.routes route
      where route.id::text = (storage.foldername(name))[2]
        and route.account_id::text = public.current_account_id()
    )
  )
);

commit;
