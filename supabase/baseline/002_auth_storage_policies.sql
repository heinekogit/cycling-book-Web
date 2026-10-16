-- App-owned auth trigger and Storage policies from the 2026-10-15 schema dump.
-- Apply after 001_public_schema.sql, only in a new Supabase project.
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
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: objects auth can read route photos 1pnimbp_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "auth can read route photos 1pnimbp_0" ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'route-photos'::text));


--
-- Name: objects auth can upload route photos 1pnimbp_0; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "auth can upload route photos 1pnimbp_0" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'route-photos'::text));


--
-- Name: objects cycling_book_route_objects_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY cycling_book_route_objects_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'route-photos'::text) AND public.can_access_cycling_photo_object(name)));


--
-- Name: objects cycling_book_route_objects_delete_boundary; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY cycling_book_route_objects_delete_boundary ON storage.objects AS RESTRICTIVE FOR DELETE USING (((bucket_id <> 'route-photos'::text) OR ((auth.role() = 'authenticated'::text) AND (public.can_access_route_photo_object(name) OR public.can_access_run_photo_object(name)))));


--
-- Name: objects cycling_book_route_objects_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY cycling_book_route_objects_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'route-photos'::text) AND public.can_access_cycling_photo_object(name)));


--
-- Name: objects cycling_book_route_objects_insert_boundary; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY cycling_book_route_objects_insert_boundary ON storage.objects AS RESTRICTIVE FOR INSERT WITH CHECK (((bucket_id <> 'route-photos'::text) OR ((auth.role() = 'authenticated'::text) AND (public.can_access_route_photo_object(name) OR public.can_access_run_photo_object(name)))));


--
-- Name: objects cycling_book_route_objects_select; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY cycling_book_route_objects_select ON storage.objects FOR SELECT TO authenticated, anon USING (((bucket_id = 'route-photos'::text) AND public.can_access_cycling_photo_object(name)));


--
-- Name: objects cycling_book_route_objects_select_boundary; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY cycling_book_route_objects_select_boundary ON storage.objects AS RESTRICTIVE FOR SELECT USING (((bucket_id <> 'route-photos'::text) OR public.can_access_cycling_photo_object(name)));


--
-- Name: objects cycling_book_route_objects_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY cycling_book_route_objects_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'route-photos'::text) AND public.can_access_cycling_photo_object(name))) WITH CHECK (((bucket_id = 'route-photos'::text) AND public.can_access_cycling_photo_object(name)));


--
-- Name: objects cycling_book_route_objects_update_boundary; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY cycling_book_route_objects_update_boundary ON storage.objects AS RESTRICTIVE FOR UPDATE USING (((bucket_id <> 'route-photos'::text) OR ((auth.role() = 'authenticated'::text) AND (public.can_access_route_photo_object(name) OR public.can_access_run_photo_object(name))))) WITH CHECK (((bucket_id <> 'route-photos'::text) OR ((auth.role() = 'authenticated'::text) AND (public.can_access_route_photo_object(name) OR public.can_access_run_photo_object(name)))));


--
-- PostgreSQL database dump complete
--
