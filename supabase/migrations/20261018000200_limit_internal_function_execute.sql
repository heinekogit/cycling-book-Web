-- Internal trigger functions are invoked by existing triggers, not directly
-- through the Data API. Keep the owner/service_role grants.
REVOKE EXECUTE ON FUNCTION public.set_account_membership_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_owner_account_id_default() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_run_photo_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_runs_account_id_from_auth() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_route_copy_count() FROM PUBLIC, anon, authenticated;

-- This helper is still called by set_owner_account_id_default() during
-- authenticated route/run inserts. Do not revoke authenticated EXECUTE.
REVOKE EXECUTE ON FUNCTION public.current_user_account_id() FROM PUBLIC, anon;
