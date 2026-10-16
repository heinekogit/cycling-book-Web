-- Initial application configuration for a new, empty Supabase project only.
-- This contains no user, route, subscription, or photo data.

INSERT INTO public.plans (id, name, features) VALUES
  ('free', 'Free', '{"max_public_routes":20}'::jsonb),
  ('group', 'Group', '{}'::jsonb),
  ('pro', 'Pro', '{"embed":true,"max_public_routes":1000}'::jsonb);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('route-photos', 'route-photos', false, NULL, NULL);
