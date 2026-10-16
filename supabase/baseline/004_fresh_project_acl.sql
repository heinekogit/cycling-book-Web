-- Apply once after 001-003 on a newly created Supabase project only.
-- Fresh Supabase defaults grant non-DML table privileges that the existing
-- production application's explicit grants do not include. RLS cannot limit
-- TRUNCATE or table-level DDL privileges. Do not apply this to production.

REVOKE REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon;

REVOKE REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON TABLE
  public.account_members,
  public.account_memberships,
  public.accounts,
  public.app_developers,
  public.orgs,
  public.plan_entitlements,
  public.plans,
  public.subscriptions,
  public.users
FROM authenticated;

-- Future migrations must grant only the privileges each new table requires.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE REFERENCES, TRIGGER, TRUNCATE, MAINTAIN ON TABLES FROM anon, authenticated;
