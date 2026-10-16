-- First forward migration after the 2026-10-17 application baseline.
-- Anonymous users may view visible markers on public routes, but must not
-- receive table-wide TRUNCATE or other write/maintenance privileges.
REVOKE ALL PRIVILEGES ON TABLE public.route_markers FROM anon;
GRANT SELECT ON TABLE public.route_markers TO anon;
