-- Track saved route copies without exposing who copied a public route.
begin;

alter table public.routes
  add column if not exists copied_from_route_id bigint
    references public.routes(id) on delete set null;

alter table public.routes
  add column if not exists copy_count integer not null default 0
    check (copy_count >= 0);

create index if not exists routes_copied_from_route_id_idx
  on public.routes (copied_from_route_id)
  where copied_from_route_id is not null;

create or replace function public.update_route_copy_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.copied_from_route_id is not null then
      update public.routes set copy_count = copy_count + 1
      where id = new.copied_from_route_id
        and account_id::text is distinct from new.account_id::text;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.copied_from_route_id is not null then
      update public.routes set copy_count = greatest(copy_count - 1, 0)
      where id = old.copied_from_route_id
        and account_id::text is distinct from old.account_id::text;
    end if;
    return old;
  end if;

  if old.copied_from_route_id is distinct from new.copied_from_route_id then
    if old.copied_from_route_id is not null then
      update public.routes set copy_count = greatest(copy_count - 1, 0)
      where id = old.copied_from_route_id
        and account_id::text is distinct from old.account_id::text;
    end if;
    if new.copied_from_route_id is not null then
      update public.routes set copy_count = copy_count + 1
      where id = new.copied_from_route_id
        and account_id::text is distinct from new.account_id::text;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.update_route_copy_count() from public;

drop trigger if exists maintain_route_copy_count on public.routes;
create trigger maintain_route_copy_count
after insert or update of copied_from_route_id or delete on public.routes
for each row execute function public.update_route_copy_count();

commit;
