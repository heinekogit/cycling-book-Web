-- A first withdrawal path for a newly registered, empty personal account.
-- Accounts with content or Storage files are rejected until full data erasure is implemented.
begin;

do $$
begin
  if to_regprocedure('public.delete_my_empty_account()') is not null then
    raise exception 'public.delete_my_empty_account() already exists; inspect before applying again';
  end if;
end;
$$;

create function public.delete_my_empty_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

revoke all on function public.delete_my_empty_account() from public;
revoke all on function public.delete_my_empty_account() from anon;
grant execute on function public.delete_my_empty_account() to authenticated;

commit;
