-- Persist elevation profiles so route and run pages do not need to call an
-- external elevation service every time they are displayed.
--
-- elevation_profile version 1:
-- {
--   "version": 1,
--   "distances_m": [0, 25.4, 51.2],
--   "elevations_m": [12.1, 13.0, 14.2]
-- }
--
-- This migration is additive. Existing rows and RLS policies are unchanged.

begin;

alter table public.runs
  add column if not exists elevation_profile jsonb,
  add column if not exists elevation_gain_m double precision,
  add column if not exists elevation_loss_m double precision,
  add column if not exists elevation_min_m double precision,
  add column if not exists elevation_max_m double precision,
  add column if not exists elevation_source text,
  add column if not exists elevation_updated_at timestamptz;

alter table public.routes
  add column if not exists elevation_profile jsonb,
  add column if not exists elevation_gain_m double precision,
  add column if not exists elevation_loss_m double precision,
  add column if not exists elevation_min_m double precision,
  add column if not exists elevation_max_m double precision,
  add column if not exists elevation_source text,
  add column if not exists elevation_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'runs_elevation_profile_shape_check'
      and conrelid = 'public.runs'::regclass
  ) then
    alter table public.runs add constraint runs_elevation_profile_shape_check check (
      elevation_profile is null or (
        jsonb_typeof(elevation_profile) = 'object'
        and elevation_profile ? 'version'
        and elevation_profile ? 'distances_m'
        and elevation_profile ? 'elevations_m'
        and elevation_profile ->> 'version' = '1'
        and jsonb_typeof(elevation_profile -> 'distances_m') = 'array'
        and jsonb_typeof(elevation_profile -> 'elevations_m') = 'array'
        and jsonb_array_length(elevation_profile -> 'distances_m') >= 2
        and jsonb_array_length(elevation_profile -> 'distances_m')
          = jsonb_array_length(elevation_profile -> 'elevations_m')
      )
    );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'routes_elevation_profile_shape_check'
      and conrelid = 'public.routes'::regclass
  ) then
    alter table public.routes add constraint routes_elevation_profile_shape_check check (
      elevation_profile is null or (
        jsonb_typeof(elevation_profile) = 'object'
        and elevation_profile ? 'version'
        and elevation_profile ? 'distances_m'
        and elevation_profile ? 'elevations_m'
        and elevation_profile ->> 'version' = '1'
        and jsonb_typeof(elevation_profile -> 'distances_m') = 'array'
        and jsonb_typeof(elevation_profile -> 'elevations_m') = 'array'
        and jsonb_array_length(elevation_profile -> 'distances_m') >= 2
        and jsonb_array_length(elevation_profile -> 'distances_m')
          = jsonb_array_length(elevation_profile -> 'elevations_m')
      )
    );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'runs_elevation_summary_check'
      and conrelid = 'public.runs'::regclass
  ) then
    alter table public.runs add constraint runs_elevation_summary_check check (
      (elevation_gain_m is null or elevation_gain_m >= 0)
      and (elevation_loss_m is null or elevation_loss_m >= 0)
      and (elevation_min_m is null or elevation_max_m is null or elevation_min_m <= elevation_max_m)
    );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'routes_elevation_summary_check'
      and conrelid = 'public.routes'::regclass
  ) then
    alter table public.routes add constraint routes_elevation_summary_check check (
      (elevation_gain_m is null or elevation_gain_m >= 0)
      and (elevation_loss_m is null or elevation_loss_m >= 0)
      and (elevation_min_m is null or elevation_max_m is null or elevation_min_m <= elevation_max_m)
    );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'runs_elevation_source_check'
      and conrelid = 'public.runs'::regclass
  ) then
    alter table public.runs add constraint runs_elevation_source_check check (
      elevation_source is null or elevation_source in ('device', 'api', 'inherited', 'embedded', 'imported')
    );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'routes_elevation_source_check'
      and conrelid = 'public.routes'::regclass
  ) then
    alter table public.routes add constraint routes_elevation_source_check check (
      elevation_source is null or elevation_source in ('device', 'api', 'inherited', 'embedded', 'imported')
    );
  end if;
end
$$;

comment on column public.runs.elevation_profile is
  'Cached elevation profile v1: distances_m and elevations_m arrays of equal length.';
comment on column public.routes.elevation_profile is
  'Cached elevation profile v1: distances_m and elevations_m arrays of equal length.';
comment on column public.runs.elevation_source is
  'Elevation origin: device, api, inherited, embedded, or imported.';
comment on column public.routes.elevation_source is
  'Elevation origin: device, api, inherited, embedded, or imported.';

commit;
