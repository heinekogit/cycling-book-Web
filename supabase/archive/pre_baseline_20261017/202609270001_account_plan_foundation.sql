-- Extend the live account/plan model; do not create a parallel billing model.
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='account_id' and udt_name='uuid') then
    raise exception 'Expected public.users.account_id to exist and be uuid';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='accounts' and column_name='type') then
    raise exception 'Expected the live public.accounts.type model';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='plans' and column_name='id') then
    raise exception 'Expected the live public.plans.id model';
  end if;
end
$$;

create table if not exists public.account_memberships (
  account_id uuid not null references public.accounts(id) on delete cascade,
  -- The live application owns the user/account link in public.users.
  -- Some legacy rows intentionally have no auth.users counterpart yet.
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor','viewer')),
  status text not null default 'active' check (status in ('invited','active','suspended','left')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id,user_id)
);
create index if not exists account_memberships_user_idx on public.account_memberships(user_id,status);

create table if not exists public.plan_entitlements (
  plan_id text not null references public.plans(id) on delete cascade,
  feature_code text not null,
  enabled boolean not null default true,
  limit_value bigint,
  settings jsonb not null default '{}'::jsonb,
  primary key (plan_id,feature_code),
  check (limit_value is null or limit_value >= 0)
);

insert into public.plans(id,name,features) values ('group','Group','{}'::jsonb)
on conflict(id) do update set name=excluded.name;

insert into public.account_memberships(account_id,user_id,role,status)
select u.account_id,u.id,'owner','active' from public.users u where u.account_id is not null
on conflict(account_id,user_id) do update set role='owner',status='active',updated_at=now();

insert into public.subscriptions(account_id,plan_id,status)
select a.id,case when a.type='org' then 'group' else 'free' end,'active'
from public.accounts a
where not exists (
  select 1 from public.subscriptions s where s.account_id=a.id and s.status in ('trialing','active','past_due')
);

create or replace function public.set_account_membership_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at=now();
  return new;
end;
$$;
revoke all on function public.set_account_membership_updated_at() from public;

drop trigger if exists set_account_memberships_updated_at on public.account_memberships;
create trigger set_account_memberships_updated_at before update on public.account_memberships
for each row execute function public.set_account_membership_updated_at();

create or replace function public.has_account_role(
  requested_account_id uuid,
  allowed_roles text[] default array['owner','admin','editor','viewer']::text[]
)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.account_memberships m
    where m.account_id=requested_account_id and m.user_id=auth.uid()
      and m.status='active' and m.role=any(allowed_roles)
  );
$$;
revoke all on function public.has_account_role(uuid,text[]) from public;
grant execute on function public.has_account_role(uuid,text[]) to authenticated;

alter table public.account_memberships enable row level security;
alter table public.plan_entitlements enable row level security;
revoke all on table public.account_memberships,public.plan_entitlements from anon;
grant select on table public.account_memberships,public.plan_entitlements to authenticated;

drop policy if exists account_memberships_self_select on public.account_memberships;
create policy account_memberships_self_select on public.account_memberships
for select to authenticated using(user_id=auth.uid());

drop policy if exists plan_entitlements_authenticated_select on public.plan_entitlements;
create policy plan_entitlements_authenticated_select on public.plan_entitlements
for select to authenticated using(true);

commit;
