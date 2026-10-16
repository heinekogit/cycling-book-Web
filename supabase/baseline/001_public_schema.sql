-- Current-state baseline from the 2026-10-15 schema dump. Apply only to a new, empty Supabase project.
-- Do not apply to the existing database or replay historical migrations after this snapshot.
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: route_origin; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.route_origin AS ENUM (
    'drawn',
    'imported',
    'from_log'
);


--
-- Name: run_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.run_mode AS ENUM (
    'free',
    'follow_route'
);


--
-- Name: can_access_cycling_photo_object(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_cycling_photo_object(object_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.can_access_route_photo_object(object_name) or public.can_access_run_photo_object(object_name) or public.is_public_route_photo_object(object_name); $$;


--
-- Name: can_access_route_photo_object(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_route_photo_object(object_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.routes route
    where route.id::text = (storage.foldername(object_name))[2]
      and route.account_id::text = public.current_account_id()
  );
$$;


--
-- Name: can_access_route_photo_selection(bigint, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_route_photo_selection(requested_route_id bigint, requested_run_photo_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.routes route
    join public.run_photos photo on photo.id = requested_run_photo_id
    where route.id = requested_route_id
      and route.account_id::text = public.current_account_id()
      and photo.account_id = route.account_id
      and photo.owner_user_id = auth.uid()
  );
$$;


--
-- Name: can_access_run_photo(bigint, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_run_photo(requested_run_id bigint, requested_owner_user_id uuid, requested_account_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select requested_owner_user_id = auth.uid()
    and requested_account_id::text = public.current_account_id()
    and exists (
      select 1 from public.runs run where run.id = requested_run_id
        and run.account_id = requested_account_id
    );
$$;


--
-- Name: can_access_run_photo_object(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_run_photo_object(object_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select (storage.foldername(object_name))[1] = 'runs'
    and (storage.foldername(object_name))[2] = public.current_account_id()
    and exists (
      select 1 from public.runs run
      where run.id::text = (storage.foldername(object_name))[3]
        and run.account_id::text = public.current_account_id()
    );
$$;


--
-- Name: current_account_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_account_id() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select account_id::text from public.users where id = auth.uid() limit 1;
$$;


--
-- Name: current_user_account_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_account_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- auth.uid() は auth スキーマの関数。スキーマ修飾で呼ぶのでOK
  select u.account_id
  from users u
  where u.id = auth.uid();
$$;


--
-- Name: delete_my_empty_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_my_empty_account() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  withdrawing_user_id uuid := auth.uid();
  personal_account_id uuid;
begin
  if withdrawing_user_id is null then
    raise exception 'Authentication required';
  end if;

  select u.account_id into personal_account_id
  from public.users u
  join public.accounts a on a.id = u.account_id and a.type = 'user'
  where u.id = withdrawing_user_id
  for update of u, a;

  if personal_account_id is null then
    raise exception 'Personal account not found';
  end if;

  if exists (select 1 from public.users where account_id = personal_account_id and id <> withdrawing_user_id)
    or exists (select 1 from public.account_members where account_id = personal_account_id and user_id <> withdrawing_user_id)
    or exists (select 1 from public.account_memberships where user_id = withdrawing_user_id and account_id <> personal_account_id)
    or exists (select 1 from public.account_members where user_id = withdrawing_user_id and account_id <> personal_account_id)
    or exists (select 1 from public.routes where account_id = personal_account_id or owner_account_id = personal_account_id)
    or exists (select 1 from public.runs where account_id = personal_account_id or owner_account_id = personal_account_id)
    or exists (select 1 from public.route_spot_photos where user_id = withdrawing_user_id)
    or exists (select 1 from public.run_photos where owner_user_id = withdrawing_user_id)
    or exists (
      select 1 from storage.objects
      where owner = withdrawing_user_id
        or owner_id = withdrawing_user_id::text
        or position(personal_account_id::text in name) > 0
    ) then
    raise exception 'Account contains records or files; withdrawal is not yet available';
  end if;

  -- The account foreign keys cascade to public.users, subscriptions and memberships.
  delete from public.accounts where id = personal_account_id;
  delete from auth.users where id = withdrawing_user_id;
  if not found then
    raise exception 'Authentication user not found';
  end if;
end;
$$;


--
-- Name: get_public_profile(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_profile(requested_account_id uuid) RETURNS TABLE(account_id uuid, display_name text, profile_image text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select u.account_id,u.display_name,u.profile_image from public.users u where u.account_id=requested_account_id and exists(select 1 from public.routes route where route.account_id=requested_account_id and route.is_public is true) limit 1; $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_account_id uuid := gen_random_uuid();
  v_handle text := 'u_' || substr(new.id::text, 1, 8);
  v_display text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
begin
  begin
    insert into public.accounts(id, type, handle, display_name)
    values (v_account_id, 'user', v_handle, v_display);
  exception when unique_violation then
    v_handle := v_handle || '_' || substr(gen_random_uuid()::text, 1, 4);
    insert into public.accounts(id, type, handle, display_name)
    values (v_account_id, 'user', v_handle, v_display);
  end;

  insert into public.users(id, account_id)
  values (new.id, v_account_id)
  on conflict (id) do nothing;

  insert into public.account_memberships(account_id, user_id, role, status)
  values (v_account_id, new.id, 'owner', 'active')
  on conflict (account_id, user_id) do nothing;

  insert into public.subscriptions(id, account_id, plan_id, status, created_at)
  values (gen_random_uuid(), v_account_id, 'free', 'active', now())
  on conflict do nothing;

  return new;
end;
$$;


--
-- Name: has_account_role(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_account_role(requested_account_id uuid, allowed_roles text[] DEFAULT ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select exists (select 1 from public.account_memberships m where m.account_id=requested_account_id and m.user_id=auth.uid() and m.status='active' and m.role=any(allowed_roles)); $$;


--
-- Name: is_app_developer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_app_developer() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.app_developers
    where user_id = auth.uid()
  );
$$;


--
-- Name: is_public_route_photo_object(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_public_route_photo_object(object_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.route_spot_photos photo
    join public.routes route on route.id = photo.route_id
    where route.is_public is true and photo.is_privacy_hidden is false
      and (photo.image_url = object_name or photo.thumb_url = object_name
        or photo.image_url like '%' || object_name or photo.thumb_url like '%' || object_name)
  );
$$;


--
-- Name: set_account_membership_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_account_membership_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$ begin new.updated_at=now(); return new; end; $$;


--
-- Name: set_owner_account_id_default(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_owner_account_id_default() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.owner_account_id is null then
    new.owner_account_id := current_user_account_id();
  end if;
  return new;
end $$;


--
-- Name: set_route_publication(bigint, boolean, jsonb, boolean, integer, double precision, uuid[], uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_route_publication(requested_route_id bigint, make_public boolean, filtered_geojson jsonb DEFAULT NULL::jsonb, filter_enabled boolean DEFAULT true, radius_m integer DEFAULT 500, filtered_distance_m double precision DEFAULT NULL::double precision, hidden_photo_ids uuid[] DEFAULT '{}'::uuid[], hidden_marker_ids uuid[] DEFAULT '{}'::uuid[]) RETURNS TABLE(id bigint, is_public boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  owned_route public.routes%rowtype;
  private_geometry public.route_private_geometries%rowtype;
begin
  select route.* into owned_route from public.routes as route
  where route.id = requested_route_id
    and route.account_id::text = public.current_account_id()
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


--
-- Name: set_run_photo_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_run_photo_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: set_runs_account_id_from_auth(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_runs_account_id_from_auth() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  acc uuid;
begin
  -- users.account_id を auth.uid() から取得
  select u.account_id into acc
  from public.users u
  where u.id = auth.uid()
  limit 1;

  -- 既にセット済みなら優先
  if new.account_id is null then
    new.account_id := acc;
  end if;

  return new;
end
$$;


--
-- Name: update_route_copy_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_route_copy_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.copied_from_route_id is not null then
      update public.routes set copy_count = copy_count + 1 where id = new.copied_from_route_id and account_id::text is distinct from new.account_id::text;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.copied_from_route_id is not null then
      update public.routes set copy_count = greatest(copy_count - 1, 0) where id = old.copied_from_route_id and account_id::text is distinct from old.account_id::text;
    end if;
    return old;
  end if;
  if old.copied_from_route_id is distinct from new.copied_from_route_id then
    if old.copied_from_route_id is not null then
      update public.routes set copy_count = greatest(copy_count - 1, 0) where id = old.copied_from_route_id and account_id::text is distinct from old.account_id::text;
    end if;
    if new.copied_from_route_id is not null then
      update public.routes set copy_count = copy_count + 1 where id = new.copied_from_route_id and account_id::text is distinct from new.account_id::text;
    end if;
  end if;
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_members (
    account_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text])))
);


--
-- Name: account_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_memberships (
    account_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_memberships_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text]))),
    CONSTRAINT account_memberships_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'suspended'::text, 'left'::text])))
);


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    handle text,
    display_name text NOT NULL,
    avatar_url text,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounts_type_check CHECK ((type = ANY (ARRAY['user'::text, 'org'::text])))
);


--
-- Name: app_developers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_developers (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: orgs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orgs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    legal_name text,
    website text,
    contact_email text
);


--
-- Name: plan_entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_entitlements (
    plan_id text NOT NULL,
    feature_code text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    limit_value bigint,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT plan_entitlements_limit_value_check CHECK (((limit_value IS NULL) OR (limit_value >= 0)))
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id text NOT NULL,
    name text NOT NULL,
    features jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: route_markers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_markers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    route_id bigint NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    comment text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_privacy_hidden boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT route_markers_comment_check CHECK ((char_length(comment) <= 500)),
    CONSTRAINT route_markers_latitude_check CHECK (((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision))),
    CONSTRAINT route_markers_longitude_check CHECK (((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)))
);


--
-- Name: route_photo_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_photo_selections (
    route_id bigint NOT NULL,
    run_photo_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    caption text,
    selected_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT route_photo_selections_sort_order_check CHECK ((sort_order >= 0))
);


--
-- Name: route_private_geometries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_private_geometries (
    route_id bigint NOT NULL,
    account_id uuid NOT NULL,
    geojson jsonb,
    polyline text,
    distance_m double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: route_spot_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_spot_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    route_id bigint NOT NULL,
    user_id uuid NOT NULL,
    image_url text NOT NULL,
    taken_at timestamp with time zone DEFAULT now() NOT NULL,
    lat double precision,
    lng double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    thumb_url text,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    run_photo_id uuid,
    run_id bigint,
    sort_order integer DEFAULT 0 NOT NULL,
    is_privacy_hidden boolean DEFAULT false NOT NULL,
    marker_id uuid,
    CONSTRAINT route_spot_photos_sort_order_check CHECK ((sort_order >= 0))
);


--
-- Name: routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routes (
    id bigint NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    origin public.route_origin NOT NULL,
    geojson jsonb,
    polyline text,
    distance_m numeric,
    duration_s integer,
    elev_profile jsonb,
    bbox jsonb,
    source_service text,
    source_file jsonb,
    imported_at timestamp with time zone,
    promoted_from_run bigint,
    drawn_meta jsonb,
    owner_account_id uuid,
    visibility text DEFAULT 'private'::text,
    is_public boolean DEFAULT false NOT NULL,
    account_id uuid,
    route_type text,
    source_run_id bigint,
    elevation_profile jsonb,
    elevation_gain_m double precision,
    elevation_loss_m double precision,
    elevation_min_m double precision,
    elevation_max_m double precision,
    elevation_source text,
    elevation_updated_at timestamp with time zone,
    copied_from_route_id bigint,
    copy_count integer DEFAULT 0 NOT NULL,
    privacy_filter_enabled boolean DEFAULT false NOT NULL,
    privacy_zone_radius_m integer,
    CONSTRAINT routes_copy_count_check CHECK ((copy_count >= 0)),
    CONSTRAINT routes_elevation_profile_shape_check CHECK (((elevation_profile IS NULL) OR ((jsonb_typeof(elevation_profile) = 'object'::text) AND (elevation_profile ? 'version'::text) AND (elevation_profile ? 'distances_m'::text) AND (elevation_profile ? 'elevations_m'::text) AND ((elevation_profile ->> 'version'::text) = '1'::text) AND (jsonb_typeof((elevation_profile -> 'distances_m'::text)) = 'array'::text) AND (jsonb_typeof((elevation_profile -> 'elevations_m'::text)) = 'array'::text) AND (jsonb_array_length((elevation_profile -> 'distances_m'::text)) >= 2) AND (jsonb_array_length((elevation_profile -> 'distances_m'::text)) = jsonb_array_length((elevation_profile -> 'elevations_m'::text)))))),
    CONSTRAINT routes_elevation_source_check CHECK (((elevation_source IS NULL) OR (elevation_source = ANY (ARRAY['device'::text, 'api'::text, 'inherited'::text, 'embedded'::text, 'imported'::text])))),
    CONSTRAINT routes_elevation_summary_check CHECK ((((elevation_gain_m IS NULL) OR (elevation_gain_m >= (0)::double precision)) AND ((elevation_loss_m IS NULL) OR (elevation_loss_m >= (0)::double precision)) AND ((elevation_min_m IS NULL) OR (elevation_max_m IS NULL) OR (elevation_min_m <= elevation_max_m)))),
    CONSTRAINT routes_route_type_check CHECK ((route_type = ANY (ARRAY['drawn'::text, 'from_run'::text])))
);


--
-- Name: COLUMN routes.elevation_profile; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.elevation_profile IS 'Cached elevation profile v1: distances_m and elevations_m arrays of equal length.';


--
-- Name: COLUMN routes.elevation_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.routes.elevation_source IS 'Elevation origin: device, api, inherited, embedded, or imported.';


--
-- Name: routes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.routes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: routes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.routes_id_seq OWNED BY public.routes.id;


--
-- Name: run_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.run_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id bigint NOT NULL,
    owner_user_id uuid NOT NULL,
    account_id uuid NOT NULL,
    bucket_id text DEFAULT 'route-photos'::text NOT NULL,
    original_path text NOT NULL,
    thumbnail_path text,
    taken_at timestamp with time zone NOT NULL,
    latitude double precision,
    longitude double precision,
    mime_type text,
    byte_size bigint,
    width integer,
    height integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT run_photos_bucket_id_check CHECK ((bucket_id = 'route-photos'::text)),
    CONSTRAINT run_photos_byte_size_check CHECK (((byte_size IS NULL) OR (byte_size >= 0))),
    CONSTRAINT run_photos_check CHECK (((thumbnail_path IS NULL) OR (thumbnail_path <> original_path))),
    CONSTRAINT run_photos_height_check CHECK (((height IS NULL) OR (height > 0))),
    CONSTRAINT run_photos_latitude_check CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)))),
    CONSTRAINT run_photos_longitude_check CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision)))),
    CONSTRAINT run_photos_width_check CHECK (((width IS NULL) OR (width > 0)))
);


--
-- Name: runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.runs (
    id bigint NOT NULL,
    name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    mode public.run_mode DEFAULT 'free'::public.run_mode NOT NULL,
    route_id bigint,
    geojson jsonb,
    polyline text,
    point_count integer,
    distance_m numeric,
    duration_s integer,
    avg_speed_kmh numeric,
    elev_profile jsonb,
    bbox jsonb,
    is_promoted boolean DEFAULT false NOT NULL,
    owner_account_id uuid,
    account_id uuid,
    elevation_profile jsonb,
    elevation_gain_m double precision,
    elevation_loss_m double precision,
    elevation_min_m double precision,
    elevation_max_m double precision,
    elevation_source text,
    elevation_updated_at timestamp with time zone,
    CONSTRAINT runs_elevation_profile_shape_check CHECK (((elevation_profile IS NULL) OR ((jsonb_typeof(elevation_profile) = 'object'::text) AND (elevation_profile ? 'version'::text) AND (elevation_profile ? 'distances_m'::text) AND (elevation_profile ? 'elevations_m'::text) AND ((elevation_profile ->> 'version'::text) = '1'::text) AND (jsonb_typeof((elevation_profile -> 'distances_m'::text)) = 'array'::text) AND (jsonb_typeof((elevation_profile -> 'elevations_m'::text)) = 'array'::text) AND (jsonb_array_length((elevation_profile -> 'distances_m'::text)) >= 2) AND (jsonb_array_length((elevation_profile -> 'distances_m'::text)) = jsonb_array_length((elevation_profile -> 'elevations_m'::text)))))),
    CONSTRAINT runs_elevation_source_check CHECK (((elevation_source IS NULL) OR (elevation_source = ANY (ARRAY['device'::text, 'api'::text, 'inherited'::text, 'embedded'::text, 'imported'::text])))),
    CONSTRAINT runs_elevation_summary_check CHECK ((((elevation_gain_m IS NULL) OR (elevation_gain_m >= (0)::double precision)) AND ((elevation_loss_m IS NULL) OR (elevation_loss_m >= (0)::double precision)) AND ((elevation_min_m IS NULL) OR (elevation_max_m IS NULL) OR (elevation_min_m <= elevation_max_m))))
);


--
-- Name: COLUMN runs.elevation_profile; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.runs.elevation_profile IS 'Cached elevation profile v1: distances_m and elevations_m arrays of equal length.';


--
-- Name: COLUMN runs.elevation_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.runs.elevation_source IS 'Elevation origin: device, api, inherited, embedded, or imported.';


--
-- Name: runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.runs_id_seq OWNED BY public.runs.id;


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    plan_id text NOT NULL,
    status text NOT NULL,
    renews_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'past_due'::text, 'canceled'::text, 'trialing'::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    account_id uuid NOT NULL,
    display_name text,
    profile_image text,
    home_lat double precision,
    home_lng double precision,
    home_name text
);


--
-- Name: routes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes ALTER COLUMN id SET DEFAULT nextval('public.routes_id_seq'::regclass);


--
-- Name: runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.runs ALTER COLUMN id SET DEFAULT nextval('public.runs_id_seq'::regclass);


--
-- Name: account_members account_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_members
    ADD CONSTRAINT account_members_pkey PRIMARY KEY (account_id, user_id);


--
-- Name: account_memberships account_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_memberships
    ADD CONSTRAINT account_memberships_pkey PRIMARY KEY (account_id, user_id);


--
-- Name: accounts accounts_handle_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_handle_key UNIQUE (handle);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: app_developers app_developers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_developers
    ADD CONSTRAINT app_developers_pkey PRIMARY KEY (user_id);


--
-- Name: orgs orgs_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orgs
    ADD CONSTRAINT orgs_account_id_key UNIQUE (account_id);


--
-- Name: orgs orgs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orgs
    ADD CONSTRAINT orgs_pkey PRIMARY KEY (id);


--
-- Name: plan_entitlements plan_entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_entitlements
    ADD CONSTRAINT plan_entitlements_pkey PRIMARY KEY (plan_id, feature_code);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: route_markers route_markers_id_route_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_markers
    ADD CONSTRAINT route_markers_id_route_unique UNIQUE (id, route_id);


--
-- Name: route_markers route_markers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_markers
    ADD CONSTRAINT route_markers_pkey PRIMARY KEY (id);


--
-- Name: route_photo_selections route_photo_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_photo_selections
    ADD CONSTRAINT route_photo_selections_pkey PRIMARY KEY (route_id, run_photo_id);


--
-- Name: route_private_geometries route_private_geometries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_private_geometries
    ADD CONSTRAINT route_private_geometries_pkey PRIMARY KEY (route_id);


--
-- Name: route_spot_photos route_spot_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_spot_photos
    ADD CONSTRAINT route_spot_photos_pkey PRIMARY KEY (id);


--
-- Name: routes routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_pkey PRIMARY KEY (id);


--
-- Name: run_photos run_photos_bucket_id_original_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_photos
    ADD CONSTRAINT run_photos_bucket_id_original_path_key UNIQUE (bucket_id, original_path);


--
-- Name: run_photos run_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_photos
    ADD CONSTRAINT run_photos_pkey PRIMARY KEY (id);


--
-- Name: runs runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: users users_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_account_id_key UNIQUE (account_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: account_memberships_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_memberships_user_idx ON public.account_memberships USING btree (user_id, status);


--
-- Name: idx_routes_owner_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routes_owner_account ON public.routes USING btree (owner_account_id);


--
-- Name: idx_routes_visibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routes_visibility ON public.routes USING btree (visibility);


--
-- Name: route_markers_route_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_markers_route_order_idx ON public.route_markers USING btree (route_id, sort_order);


--
-- Name: route_photo_selections_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_photo_selections_order_idx ON public.route_photo_selections USING btree (route_id, sort_order, selected_at);


--
-- Name: route_spot_photos_marker_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_spot_photos_marker_order_idx ON public.route_spot_photos USING btree (marker_id, sort_order);


--
-- Name: route_spot_photos_route_id_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_spot_photos_route_id_deleted_at_idx ON public.route_spot_photos USING btree (route_id, deleted_at);


--
-- Name: route_spot_photos_route_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_spot_photos_route_id_idx ON public.route_spot_photos USING btree (route_id);


--
-- Name: route_spot_photos_route_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_spot_photos_route_order_idx ON public.route_spot_photos USING btree (route_id, sort_order, taken_at);


--
-- Name: route_spot_photos_run_photo_id_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX route_spot_photos_run_photo_id_uidx ON public.route_spot_photos USING btree (run_photo_id) WHERE (run_photo_id IS NOT NULL);


--
-- Name: route_spot_photos_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX route_spot_photos_user_id_idx ON public.route_spot_photos USING btree (user_id);


--
-- Name: routes_copied_from_route_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX routes_copied_from_route_id_idx ON public.routes USING btree (copied_from_route_id) WHERE (copied_from_route_id IS NOT NULL);


--
-- Name: run_photos_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX run_photos_account_idx ON public.run_photos USING btree (account_id);


--
-- Name: run_photos_run_taken_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX run_photos_run_taken_at_idx ON public.run_photos USING btree (run_id, taken_at DESC);


--
-- Name: routes maintain_route_copy_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER maintain_route_copy_count AFTER INSERT OR DELETE OR UPDATE OF copied_from_route_id ON public.routes FOR EACH ROW EXECUTE FUNCTION public.update_route_copy_count();


--
-- Name: account_memberships set_account_memberships_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_account_memberships_updated_at BEFORE UPDATE ON public.account_memberships FOR EACH ROW EXECUTE FUNCTION public.set_account_membership_updated_at();


--
-- Name: run_photos set_run_photo_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_run_photo_updated_at BEFORE UPDATE ON public.run_photos FOR EACH ROW EXECUTE FUNCTION public.set_run_photo_updated_at();


--
-- Name: routes trg_routes_owner_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_routes_owner_default BEFORE INSERT ON public.routes FOR EACH ROW EXECUTE FUNCTION public.set_owner_account_id_default();


--
-- Name: runs trg_runs_owner_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_runs_owner_default BEFORE INSERT ON public.runs FOR EACH ROW EXECUTE FUNCTION public.set_owner_account_id_default();


--
-- Name: runs trg_runs_set_account_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_runs_set_account_id BEFORE INSERT OR UPDATE ON public.runs FOR EACH ROW EXECUTE FUNCTION public.set_runs_account_id_from_auth();


--
-- Name: account_members account_members_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_members
    ADD CONSTRAINT account_members_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: account_members account_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_members
    ADD CONSTRAINT account_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: account_memberships account_memberships_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_memberships
    ADD CONSTRAINT account_memberships_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: account_memberships account_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_memberships
    ADD CONSTRAINT account_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: app_developers app_developers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_developers
    ADD CONSTRAINT app_developers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: orgs orgs_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orgs
    ADD CONSTRAINT orgs_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: plan_entitlements plan_entitlements_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_entitlements
    ADD CONSTRAINT plan_entitlements_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE CASCADE;


--
-- Name: route_markers route_markers_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_markers
    ADD CONSTRAINT route_markers_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE;


--
-- Name: route_photo_selections route_photo_selections_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_photo_selections
    ADD CONSTRAINT route_photo_selections_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE;


--
-- Name: route_photo_selections route_photo_selections_run_photo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_photo_selections
    ADD CONSTRAINT route_photo_selections_run_photo_id_fkey FOREIGN KEY (run_photo_id) REFERENCES public.run_photos(id) ON DELETE CASCADE;


--
-- Name: route_private_geometries route_private_geometries_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_private_geometries
    ADD CONSTRAINT route_private_geometries_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE;


--
-- Name: route_spot_photos route_spot_photos_marker_route_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_spot_photos
    ADD CONSTRAINT route_spot_photos_marker_route_fk FOREIGN KEY (marker_id, route_id) REFERENCES public.route_markers(id, route_id) ON DELETE CASCADE;


--
-- Name: route_spot_photos route_spot_photos_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_spot_photos
    ADD CONSTRAINT route_spot_photos_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE CASCADE;


--
-- Name: route_spot_photos route_spot_photos_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_spot_photos
    ADD CONSTRAINT route_spot_photos_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE SET NULL;


--
-- Name: route_spot_photos route_spot_photos_run_photo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_spot_photos
    ADD CONSTRAINT route_spot_photos_run_photo_id_fkey FOREIGN KEY (run_photo_id) REFERENCES public.run_photos(id) ON DELETE SET NULL;


--
-- Name: route_spot_photos route_spot_photos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_spot_photos
    ADD CONSTRAINT route_spot_photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: routes routes_copied_from_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_copied_from_route_id_fkey FOREIGN KEY (copied_from_route_id) REFERENCES public.routes(id) ON DELETE SET NULL;


--
-- Name: routes routes_owner_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_owner_account_id_fkey FOREIGN KEY (owner_account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: routes routes_promoted_from_run_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_promoted_from_run_fkey FOREIGN KEY (promoted_from_run) REFERENCES public.runs(id);


--
-- Name: routes routes_source_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_source_run_id_fkey FOREIGN KEY (source_run_id) REFERENCES public.runs(id);


--
-- Name: run_photos run_photos_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_photos
    ADD CONSTRAINT run_photos_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: run_photos run_photos_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_photos
    ADD CONSTRAINT run_photos_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE CASCADE;


--
-- Name: runs runs_account_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_account_fk FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE RESTRICT;


--
-- Name: runs runs_owner_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_owner_account_id_fkey FOREIGN KEY (owner_account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: users users_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: account_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;

--
-- Name: account_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: account_memberships account_memberships_self_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY account_memberships_self_select ON public.account_memberships FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: app_developers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_developers ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts cycling_book_accounts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_accounts_select ON public.accounts FOR SELECT TO authenticated USING ((((id)::text = public.current_account_id()) OR public.has_account_role(id)));


--
-- Name: orgs cycling_book_orgs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_orgs_select ON public.orgs FOR SELECT TO authenticated USING (public.has_account_role(account_id));


--
-- Name: plans cycling_book_plans_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_plans_select ON public.plans FOR SELECT TO authenticated USING (true);


--
-- Name: route_photo_selections cycling_book_route_photo_selections_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_route_photo_selections_access ON public.route_photo_selections TO authenticated USING (public.can_access_route_photo_selection(route_id, run_photo_id)) WITH CHECK (public.can_access_route_photo_selection(route_id, run_photo_id));


--
-- Name: route_photo_selections cycling_book_route_photo_selections_boundary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_route_photo_selections_boundary ON public.route_photo_selections AS RESTRICTIVE USING (public.can_access_route_photo_selection(route_id, run_photo_id)) WITH CHECK (public.can_access_route_photo_selection(route_id, run_photo_id));


--
-- Name: route_spot_photos cycling_book_route_photos_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_route_photos_access ON public.route_spot_photos TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.routes route
  WHERE ((route.id = route_spot_photos.route_id) AND ((route.account_id)::text = public.current_account_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.routes route
  WHERE ((route.id = route_spot_photos.route_id) AND ((route.account_id)::text = public.current_account_id())))));


--
-- Name: route_spot_photos cycling_book_route_photos_delete_boundary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_route_photos_delete_boundary ON public.route_spot_photos AS RESTRICTIVE FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.routes route
  WHERE ((route.id = route_spot_photos.route_id) AND ((route.account_id)::text = public.current_account_id())))));


--
-- Name: route_spot_photos cycling_book_route_photos_insert_boundary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_route_photos_insert_boundary ON public.route_spot_photos AS RESTRICTIVE FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.routes route
  WHERE ((route.id = route_spot_photos.route_id) AND ((route.account_id)::text = public.current_account_id())))));


--
-- Name: route_spot_photos cycling_book_route_photos_public_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_route_photos_public_select ON public.route_spot_photos FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.routes route
  WHERE ((route.id = route_spot_photos.route_id) AND (((route.is_public IS TRUE) AND (route_spot_photos.is_privacy_hidden IS FALSE)) OR (public.is_app_developer() AND ((route.account_id)::text = public.current_account_id())))))));


--
-- Name: route_spot_photos cycling_book_route_photos_select_boundary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_route_photos_select_boundary ON public.route_spot_photos AS RESTRICTIVE FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.routes route
  WHERE ((route.id = route_spot_photos.route_id) AND (((route.account_id)::text = public.current_account_id()) OR ((route.is_public IS TRUE) AND (route_spot_photos.is_privacy_hidden IS FALSE)))))));


--
-- Name: route_spot_photos cycling_book_route_photos_update_boundary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_route_photos_update_boundary ON public.route_spot_photos AS RESTRICTIVE FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.routes route
  WHERE ((route.id = route_spot_photos.route_id) AND ((route.account_id)::text = public.current_account_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.routes route
  WHERE ((route.id = route_spot_photos.route_id) AND ((route.account_id)::text = public.current_account_id())))));


--
-- Name: routes cycling_book_routes_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_routes_access ON public.routes TO authenticated USING (((account_id)::text = public.current_account_id())) WITH CHECK (((account_id)::text = public.current_account_id()));


--
-- Name: routes cycling_book_routes_delete_boundary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_routes_delete_boundary ON public.routes AS RESTRICTIVE FOR DELETE USING (((account_id)::text = public.current_account_id()));


--
-- Name: routes cycling_book_routes_insert_boundary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_routes_insert_boundary ON public.routes AS RESTRICTIVE FOR INSERT WITH CHECK (((account_id)::text = public.current_account_id()));


--
-- Name: routes cycling_book_routes_public_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_routes_public_select ON public.routes FOR SELECT TO authenticated, anon USING (((is_public IS TRUE) OR (public.is_app_developer() AND ((account_id)::text = public.current_account_id()))));


--
-- Name: routes cycling_book_routes_select_boundary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_routes_select_boundary ON public.routes AS RESTRICTIVE FOR SELECT USING (((is_public IS TRUE) OR ((account_id)::text = public.current_account_id())));


--
-- Name: routes cycling_book_routes_update_boundary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_routes_update_boundary ON public.routes AS RESTRICTIVE FOR UPDATE USING (((account_id)::text = public.current_account_id())) WITH CHECK (((account_id)::text = public.current_account_id()));


--
-- Name: run_photos cycling_book_run_photos_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_run_photos_access ON public.run_photos TO authenticated USING (public.can_access_run_photo(run_id, owner_user_id, account_id)) WITH CHECK (public.can_access_run_photo(run_id, owner_user_id, account_id));


--
-- Name: run_photos cycling_book_run_photos_boundary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_run_photos_boundary ON public.run_photos AS RESTRICTIVE USING (public.can_access_run_photo(run_id, owner_user_id, account_id)) WITH CHECK (public.can_access_run_photo(run_id, owner_user_id, account_id));


--
-- Name: runs cycling_book_runs_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_runs_access ON public.runs TO authenticated USING (((account_id)::text = public.current_account_id())) WITH CHECK (((account_id)::text = public.current_account_id()));


--
-- Name: runs cycling_book_runs_boundary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_runs_boundary ON public.runs AS RESTRICTIVE USING (((account_id)::text = public.current_account_id())) WITH CHECK (((account_id)::text = public.current_account_id()));


--
-- Name: subscriptions cycling_book_subscriptions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_subscriptions_select ON public.subscriptions FOR SELECT TO authenticated USING ((((account_id)::text = public.current_account_id()) OR public.has_account_role(account_id)));


--
-- Name: users cycling_book_users_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_users_access ON public.users FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- Name: users cycling_book_users_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cycling_book_users_update ON public.users FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK (((id = auth.uid()) AND ((account_id)::text = public.current_account_id())));


--
-- Name: orgs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_entitlements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_entitlements plan_entitlements_authenticated_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY plan_entitlements_authenticated_select ON public.plan_entitlements FOR SELECT TO authenticated USING (true);


--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: route_markers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.route_markers ENABLE ROW LEVEL SECURITY;

--
-- Name: route_markers route_markers_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY route_markers_delete ON public.route_markers FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.routes route
  WHERE ((route.id = route_markers.route_id) AND ((route.account_id)::text = public.current_account_id())))));


--
-- Name: route_markers route_markers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY route_markers_insert ON public.route_markers FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.routes route
  WHERE ((route.id = route_markers.route_id) AND ((route.account_id)::text = public.current_account_id())))));


--
-- Name: route_markers route_markers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY route_markers_select ON public.route_markers FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.routes route
  WHERE ((route.id = route_markers.route_id) AND (((route.account_id)::text = public.current_account_id()) OR ((route.is_public IS TRUE) AND (route_markers.is_privacy_hidden IS FALSE)))))));


--
-- Name: route_markers route_markers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY route_markers_update ON public.route_markers FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.routes route
  WHERE ((route.id = route_markers.route_id) AND ((route.account_id)::text = public.current_account_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.routes route
  WHERE ((route.id = route_markers.route_id) AND ((route.account_id)::text = public.current_account_id())))));


--
-- Name: route_photo_selections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.route_photo_selections ENABLE ROW LEVEL SECURITY;

--
-- Name: route_private_geometries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.route_private_geometries ENABLE ROW LEVEL SECURITY;

--
-- Name: route_private_geometries route_private_geometries_owner_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY route_private_geometries_owner_access ON public.route_private_geometries TO authenticated USING (((account_id)::text = public.current_account_id())) WITH CHECK (((account_id)::text = public.current_account_id()));


--
-- Name: route_spot_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.route_spot_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: routes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

--
-- Name: routes routes_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY routes_delete_owner ON public.routes FOR DELETE USING ((owner_account_id = public.current_user_account_id()));


--
-- Name: routes routes_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY routes_insert_owner ON public.routes FOR INSERT WITH CHECK ((owner_account_id = public.current_user_account_id()));


--
-- Name: routes routes_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY routes_owner_read ON public.routes FOR SELECT TO authenticated USING ((account_id = ( SELECT users.account_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


--
-- Name: routes routes_owner_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY routes_owner_update ON public.routes FOR UPDATE TO authenticated USING ((account_id = ( SELECT users.account_id
   FROM public.users
  WHERE (users.id = auth.uid())))) WITH CHECK ((account_id = ( SELECT users.account_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


--
-- Name: routes routes_owner_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY routes_owner_write ON public.routes FOR INSERT TO authenticated WITH CHECK ((account_id = ( SELECT users.account_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


--
-- Name: routes routes_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY routes_public_read ON public.routes FOR SELECT USING ((is_public = true));


--
-- Name: routes routes_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY routes_select_owner ON public.routes FOR SELECT USING (((owner_account_id = public.current_user_account_id()) OR (EXISTS ( SELECT 1
   FROM public.account_members am
  WHERE ((am.account_id = routes.owner_account_id) AND (am.user_id = auth.uid()))))));


--
-- Name: routes routes_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY routes_select_public ON public.routes FOR SELECT USING ((visibility = 'public'::text));


--
-- Name: routes routes_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY routes_update_owner ON public.routes FOR UPDATE USING ((owner_account_id = public.current_user_account_id())) WITH CHECK ((owner_account_id = public.current_user_account_id()));


--
-- Name: run_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.run_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

--
-- Name: runs runs_delete_own_account_v1; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY runs_delete_own_account_v1 ON public.runs FOR DELETE TO authenticated USING ((account_id IN ( SELECT users.account_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


--
-- Name: runs runs_insert_own_account_v1; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY runs_insert_own_account_v1 ON public.runs FOR INSERT TO authenticated WITH CHECK ((account_id IN ( SELECT users.account_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


--
-- Name: runs runs_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY runs_insert_owner ON public.runs FOR INSERT WITH CHECK ((owner_account_id = public.current_user_account_id()));


--
-- Name: runs runs_select_own_account_v1; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY runs_select_own_account_v1 ON public.runs FOR SELECT TO authenticated USING ((account_id IN ( SELECT users.account_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


--
-- Name: runs runs_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY runs_select_owner ON public.runs FOR SELECT USING ((owner_account_id = public.current_user_account_id()));


--
-- Name: runs runs_update_own_account_v1; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY runs_update_own_account_v1 ON public.runs FOR UPDATE TO authenticated USING ((account_id IN ( SELECT users.account_id
   FROM public.users
  WHERE (users.id = auth.uid())))) WITH CHECK ((account_id IN ( SELECT users.account_id
   FROM public.users
  WHERE (users.id = auth.uid()))));


--
-- Name: runs runs_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY runs_update_owner ON public.runs FOR UPDATE USING ((owner_account_id = public.current_user_account_id()));


--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: FUNCTION can_access_cycling_photo_object(object_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_access_cycling_photo_object(object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_cycling_photo_object(object_name text) TO anon;
GRANT ALL ON FUNCTION public.can_access_cycling_photo_object(object_name text) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_cycling_photo_object(object_name text) TO service_role;


--
-- Name: FUNCTION can_access_route_photo_object(object_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_access_route_photo_object(object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_route_photo_object(object_name text) TO anon;
GRANT ALL ON FUNCTION public.can_access_route_photo_object(object_name text) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_route_photo_object(object_name text) TO service_role;


--
-- Name: FUNCTION can_access_route_photo_selection(requested_route_id bigint, requested_run_photo_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_access_route_photo_selection(requested_route_id bigint, requested_run_photo_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_route_photo_selection(requested_route_id bigint, requested_run_photo_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_access_route_photo_selection(requested_route_id bigint, requested_run_photo_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_route_photo_selection(requested_route_id bigint, requested_run_photo_id uuid) TO service_role;


--
-- Name: FUNCTION can_access_run_photo(requested_run_id bigint, requested_owner_user_id uuid, requested_account_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_access_run_photo(requested_run_id bigint, requested_owner_user_id uuid, requested_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_run_photo(requested_run_id bigint, requested_owner_user_id uuid, requested_account_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_access_run_photo(requested_run_id bigint, requested_owner_user_id uuid, requested_account_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_run_photo(requested_run_id bigint, requested_owner_user_id uuid, requested_account_id uuid) TO service_role;


--
-- Name: FUNCTION can_access_run_photo_object(object_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_access_run_photo_object(object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_run_photo_object(object_name text) TO anon;
GRANT ALL ON FUNCTION public.can_access_run_photo_object(object_name text) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_run_photo_object(object_name text) TO service_role;


--
-- Name: FUNCTION current_account_id(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.current_account_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_account_id() TO anon;
GRANT ALL ON FUNCTION public.current_account_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_account_id() TO service_role;


--
-- Name: FUNCTION current_user_account_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_user_account_id() TO anon;
GRANT ALL ON FUNCTION public.current_user_account_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_user_account_id() TO service_role;


--
-- Name: FUNCTION delete_my_empty_account(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_my_empty_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_my_empty_account() TO authenticated;
GRANT ALL ON FUNCTION public.delete_my_empty_account() TO service_role;


--
-- Name: FUNCTION get_public_profile(requested_account_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_public_profile(requested_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_public_profile(requested_account_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_public_profile(requested_account_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_public_profile(requested_account_id uuid) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_account_role(requested_account_id uuid, allowed_roles text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_account_role(requested_account_id uuid, allowed_roles text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_account_role(requested_account_id uuid, allowed_roles text[]) TO authenticated;
GRANT ALL ON FUNCTION public.has_account_role(requested_account_id uuid, allowed_roles text[]) TO service_role;


--
-- Name: FUNCTION is_app_developer(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_app_developer() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_app_developer() TO anon;
GRANT ALL ON FUNCTION public.is_app_developer() TO authenticated;
GRANT ALL ON FUNCTION public.is_app_developer() TO service_role;


--
-- Name: FUNCTION is_public_route_photo_object(object_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_public_route_photo_object(object_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_public_route_photo_object(object_name text) TO anon;
GRANT ALL ON FUNCTION public.is_public_route_photo_object(object_name text) TO authenticated;
GRANT ALL ON FUNCTION public.is_public_route_photo_object(object_name text) TO service_role;


--
-- Name: FUNCTION set_account_membership_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_account_membership_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_account_membership_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_account_membership_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_account_membership_updated_at() TO service_role;


--
-- Name: FUNCTION set_owner_account_id_default(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_owner_account_id_default() TO anon;
GRANT ALL ON FUNCTION public.set_owner_account_id_default() TO authenticated;
GRANT ALL ON FUNCTION public.set_owner_account_id_default() TO service_role;


--
-- Name: FUNCTION set_route_publication(requested_route_id bigint, make_public boolean, filtered_geojson jsonb, filter_enabled boolean, radius_m integer, filtered_distance_m double precision, hidden_photo_ids uuid[], hidden_marker_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_route_publication(requested_route_id bigint, make_public boolean, filtered_geojson jsonb, filter_enabled boolean, radius_m integer, filtered_distance_m double precision, hidden_photo_ids uuid[], hidden_marker_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_route_publication(requested_route_id bigint, make_public boolean, filtered_geojson jsonb, filter_enabled boolean, radius_m integer, filtered_distance_m double precision, hidden_photo_ids uuid[], hidden_marker_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.set_route_publication(requested_route_id bigint, make_public boolean, filtered_geojson jsonb, filter_enabled boolean, radius_m integer, filtered_distance_m double precision, hidden_photo_ids uuid[], hidden_marker_ids uuid[]) TO service_role;


--
-- Name: FUNCTION set_run_photo_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_run_photo_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_run_photo_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_run_photo_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_run_photo_updated_at() TO service_role;


--
-- Name: FUNCTION set_runs_account_id_from_auth(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_runs_account_id_from_auth() TO anon;
GRANT ALL ON FUNCTION public.set_runs_account_id_from_auth() TO authenticated;
GRANT ALL ON FUNCTION public.set_runs_account_id_from_auth() TO service_role;


--
-- Name: FUNCTION update_route_copy_count(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_route_copy_count() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_route_copy_count() TO anon;
GRANT ALL ON FUNCTION public.update_route_copy_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_route_copy_count() TO service_role;


--
-- Name: TABLE account_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.account_members TO service_role;
GRANT SELECT ON TABLE public.account_members TO authenticated;
GRANT SELECT ON TABLE public.account_members TO anon;


--
-- Name: TABLE account_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.account_memberships TO service_role;
GRANT SELECT ON TABLE public.account_memberships TO authenticated;


--
-- Name: TABLE accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.accounts TO service_role;
GRANT SELECT ON TABLE public.accounts TO authenticated;


--
-- Name: TABLE app_developers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.app_developers TO service_role;


--
-- Name: TABLE orgs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orgs TO service_role;
GRANT SELECT ON TABLE public.orgs TO authenticated;


--
-- Name: TABLE plan_entitlements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plan_entitlements TO service_role;
GRANT SELECT ON TABLE public.plan_entitlements TO authenticated;


--
-- Name: TABLE plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plans TO service_role;
GRANT SELECT ON TABLE public.plans TO authenticated;


--
-- Name: TABLE route_markers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.route_markers TO anon;
GRANT ALL ON TABLE public.route_markers TO authenticated;
GRANT ALL ON TABLE public.route_markers TO service_role;


--
-- Name: TABLE route_photo_selections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.route_photo_selections TO authenticated;
GRANT ALL ON TABLE public.route_photo_selections TO service_role;


--
-- Name: TABLE route_private_geometries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.route_private_geometries TO authenticated;
GRANT ALL ON TABLE public.route_private_geometries TO service_role;


--
-- Name: TABLE route_spot_photos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.route_spot_photos TO authenticated;
GRANT ALL ON TABLE public.route_spot_photos TO service_role;
GRANT SELECT ON TABLE public.route_spot_photos TO anon;


--
-- Name: TABLE routes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.routes TO authenticated;
GRANT ALL ON TABLE public.routes TO service_role;
GRANT SELECT ON TABLE public.routes TO anon;


--
-- Name: SEQUENCE routes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.routes_id_seq TO anon;
GRANT ALL ON SEQUENCE public.routes_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.routes_id_seq TO service_role;


--
-- Name: TABLE run_photos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.run_photos TO authenticated;
GRANT ALL ON TABLE public.run_photos TO service_role;


--
-- Name: TABLE runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.runs TO authenticated;
GRANT ALL ON TABLE public.runs TO service_role;


--
-- Name: SEQUENCE runs_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.runs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.runs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.runs_id_seq TO service_role;


--
-- Name: TABLE subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscriptions TO service_role;
GRANT SELECT ON TABLE public.subscriptions TO authenticated;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.users TO service_role;
GRANT SELECT ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.display_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(display_name) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.profile_image; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(profile_image) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.home_lat; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(home_lat) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.home_lng; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(home_lng) ON TABLE public.users TO authenticated;


--
-- Name: COLUMN users.home_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(home_name) ON TABLE public.users TO authenticated;


--
-- PostgreSQL database dump complete
--
