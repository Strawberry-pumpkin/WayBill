-- Outlets: the 120 shared outlets (brief: outlets.csv) plus the contact/location fields the driver needs.
-- Uses the existing enum types (dock_type, parking_constraint). Idempotent: skips if the table exists.

create table if not exists public.outlets (
  outlet_id          text primary key,
  brand              text not null check (brand in ('Fresh', 'Style', 'Tech')),
  district           text not null,
  depot              text not null check (depot in ('Peliyagoda', 'Kandy')),
  name               text,
  address            text,
  contact_name       text,
  contact_phone      text,
  lat                double precision check (lat between -90 and 90),
  lng                double precision check (lng between -180 and 180),
  dock_type          public.dock_type not null,
  parking_constraint public.parking_constraint not null default 'normal',
  mall_window        text check (mall_window is null or mall_window ~ '^\d{2}:\d{2}-\d{2}:\d{2}$'),
  window_open_time   time,
  window_close_time  time,
  created_at         timestamptz not null default now()
);

create index if not exists outlets_depot_district_idx on public.outlets (depot, district);

alter table public.outlets enable row level security;

-- Least privilege: only dispatch (planning) and admin (master data) touch outlets directly.
-- Drivers never query this table; they get the fields they need through public.driver_run().
drop policy if exists outlets_select_dispatcher on public.outlets;
create policy outlets_select_dispatcher on public.outlets for select to authenticated
  using (public.app_role() in ('dispatcher', 'admin'));

drop policy if exists outlets_write_admin on public.outlets;
create policy outlets_write_admin on public.outlets for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

revoke all on public.outlets from anon;
