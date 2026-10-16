-- Account membership and plan catalog writes are server-managed. Keep the
-- existing SELECT policies, but remove stale client table privileges.
begin;

revoke all on public.account_memberships, public.plan_entitlements
  from public, anon, authenticated;
grant select on public.account_memberships, public.plan_entitlements
  to authenticated;

-- This ownership helper is only needed by authenticated account policies.
revoke execute on function public.has_account_role(uuid, text[]) from anon;

notify pgrst, 'reload schema';
commit;
