-- Initial release: personal free accounts may publish at most 20 routes.
-- The trigger covers both the publication RPC and direct route writes.
begin;

create or replace function public.enforce_free_public_route_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_public is not true then return new; end if;
  if tg_op = 'UPDATE' then
    if old.is_public is true and old.account_id = new.account_id then
      return new;
    end if;
  end if;

  if exists (
    select 1 from public.accounts a
    join public.subscriptions s on s.account_id = a.id
    where a.id = new.account_id
      and a.type = 'user'
      and s.plan_id = 'free'
      and s.status in ('active', 'trialing')
  ) then
    -- Serialize concurrent publications for the same account before counting.
    perform pg_catalog.pg_advisory_xact_lock(25001, pg_catalog.hashtext(new.account_id::text));
    if (select count(*) from public.routes r
        where r.account_id = new.account_id and r.is_public is true) >= 20 then
      raise exception 'free_public_route_limit_reached' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_free_public_route_limit() from public, anon, authenticated;
drop trigger if exists enforce_free_public_route_limit on public.routes;
create trigger enforce_free_public_route_limit
before insert or update of is_public, account_id on public.routes
for each row execute function public.enforce_free_public_route_limit();

-- A bucket limit applies to Web and iOS uploads alike. Keep their supported
-- image MIME types, including iPhone HEIC/HEIF, while excluding active SVG.
update storage.buckets
set file_size_limit = 20 * 1024 * 1024,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'image/avif', 'image/heic', 'image/heif'
    ]::text[]
where id = 'route-photos';

commit;
