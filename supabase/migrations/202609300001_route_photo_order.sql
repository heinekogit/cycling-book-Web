-- Preserve the order chosen while converting a recorded ride into a route.
begin;

alter table public.route_spot_photos
  add column if not exists sort_order integer not null default 0
  check (sort_order >= 0);

create index if not exists route_spot_photos_route_order_idx
  on public.route_spot_photos (route_id, sort_order, taken_at);

commit;
