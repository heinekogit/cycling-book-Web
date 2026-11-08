-- Record every successful Auth deletion in the same transaction. This catches
-- both the legacy empty-account RPC and the data-bearing account RPC. Export
-- this table to a separate ledger before restoring an older DB backup.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table app_private.deleted_auth_users (
  auth_user_id uuid primary key,
  deleted_at timestamptz not null default clock_timestamp()
);
revoke all on app_private.deleted_auth_users from public, anon, authenticated;
alter table app_private.deleted_auth_users enable row level security;

create function app_private.record_deleted_auth_user()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into app_private.deleted_auth_users(auth_user_id)
  values (old.id)
  on conflict (auth_user_id) do nothing;
  return old;
end;
$$;
revoke all on function app_private.record_deleted_auth_user() from public, anon, authenticated;

create trigger cycling_book_record_deleted_auth_user
after delete on auth.users
for each row execute function app_private.record_deleted_auth_user();
