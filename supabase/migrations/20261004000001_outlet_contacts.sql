-- The live `outlets` table (outlet_id, brand, district, depot, dock_type, parking_constraint, mall_window,
-- window_open_time, window_close_time, location geometry, outlet_code, outlet_name) has no address or contact.
-- The driver needs "Call store", "Received by" and directions. Those are personal data, so they go in their own
-- table with proper RLS instead of widening a table that anyone with the anon key can read.
-- Coordinates come from outlets.location (PostGIS); nothing to add for that.

create table if not exists public.outlet_contacts (
  outlet_id     text primary key references public.outlets (outlet_id) on delete cascade,
  address       text,
  contact_name  text check (char_length(contact_name) <= 120),
  contact_phone text check (contact_phone ~ '^\+?[0-9 ()-]{6,20}$'),
  updated_at    timestamptz not null default now()
);

alter table public.outlet_contacts enable row level security;
revoke all on public.outlet_contacts from anon, authenticated;
grant select, insert, update, delete on public.outlet_contacts to authenticated;

-- Drivers never read this table: public.driver_run() hands them the contact of the stops on their own run.
drop policy if exists outlet_contacts_select_dispatch on public.outlet_contacts;
create policy outlet_contacts_select_dispatch on public.outlet_contacts for select to authenticated
  using (public.app_role() in ('dispatcher', 'admin'));

drop policy if exists outlet_contacts_write_admin on public.outlet_contacts;
create policy outlet_contacts_write_admin on public.outlet_contacts for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
