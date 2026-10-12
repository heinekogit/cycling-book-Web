-- Legacy route policies reference account_members for anonymous public reads.
-- The table has RLS enabled and no SELECT policy, so this reveals no rows.
begin;
grant select on public.account_members to anon;
notify pgrst, 'reload schema';
commit;
