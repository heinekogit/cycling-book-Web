-- Give every new personal account an active owner membership in the same
-- transaction as its Auth user, account, and free subscription.
begin;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
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
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- The current database has two confirmed Auth users with a personal account
-- but no membership. Preserve every existing membership and its role/status.
insert into public.account_memberships(account_id, user_id, role, status)
select u.account_id, u.id, 'owner', 'active'
from public.users u
join auth.users au on au.id = u.id
join public.accounts a on a.id = u.account_id and a.type = 'user'
where not exists (
  select 1 from public.account_memberships m
  where m.account_id = u.account_id and m.user_id = u.id
)
on conflict (account_id, user_id) do nothing;

notify pgrst, 'reload schema';
commit;
