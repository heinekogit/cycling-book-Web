-- Remove permissive policies from the pre-account-membership model.
-- The cycling_book_* permissive policies and restrictive boundaries remain.
-- Apply to development first and verify the two-user/anonymous RLS test.

DROP POLICY routes_delete_owner ON public.routes;
DROP POLICY routes_insert_owner ON public.routes;
DROP POLICY routes_owner_read ON public.routes;
DROP POLICY routes_owner_update ON public.routes;
DROP POLICY routes_owner_write ON public.routes;
DROP POLICY routes_public_read ON public.routes;
DROP POLICY routes_select_owner ON public.routes;
DROP POLICY routes_select_public ON public.routes;
DROP POLICY routes_update_owner ON public.routes;

DROP POLICY runs_delete_own_account_v1 ON public.runs;
DROP POLICY runs_insert_own_account_v1 ON public.runs;
DROP POLICY runs_insert_owner ON public.runs;
DROP POLICY runs_select_own_account_v1 ON public.runs;
DROP POLICY runs_select_owner ON public.runs;
DROP POLICY runs_update_own_account_v1 ON public.runs;
DROP POLICY runs_update_owner ON public.runs;
