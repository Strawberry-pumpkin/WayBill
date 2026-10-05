-- profiles + drivers. Runs before every other migration (they depend on app_role()).
-- Idempotent: `create table if not exists` leaves an existing table untouched, so if these tables
-- already exist with a different shape, compare against supabase/inspect_schema.sql output first.
-- Uses the existing enum public.user_role ('dispatcher','driver','outlet_manager','admin').

-- ---------------------------------------------------------------- profiles
-- One row per Supabase Auth user: that single uuid identifies the person everywhere, and `role` is
-- the only thing that decides what they may do. Created by an admin (service-role script / admin tool).
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  name       text,
  role       public.user_role not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- The caller's role. SECURITY DEFINER so policies can call it without recursing into profiles' own RLS.
create or replace function public.app_role()
returns text
language sql stable security definer set search_path = ''
as $$ select p.role::text from public.profiles p where p.id = auth.uid() $$;

revoke all on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert, update, delete on public.profiles to authenticated; -- narrowed to admins by the policies below

-- Everyone can read their own row (the app needs the role and name after login).
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());

-- Admins manage users and define roles (IT-admin style). Nobody else can write, so nobody can
-- promote themselves.
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- ---------------------------------------------------------------- drivers
-- A driver is a profile with role 'driver', plus the vehicle they drive.
create table if not exists public.drivers (
  id              uuid primary key references public.profiles (id) on delete cascade,
  driver_name     text not null,
  vehicle_id      text,                                   -- FK to vehicles is added once the vehicles format is confirmed
  phone           text,
  last_synced_at  timestamptz,                            -- set by public.driver_report_sync()
  queued_records  int not null default 0 check (queued_records >= 0),
  created_at      timestamptz not null default now()
);

-- Brief: "each vehicle has a driver" -> at most one driver per vehicle.
create unique index if not exists drivers_one_driver_per_vehicle on public.drivers (vehicle_id) where vehicle_id is not null;

-- Integrity: a drivers row may only point at a profile whose role is 'driver'.
create or replace function public.drivers_require_driver_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.id and p.role = 'driver') then
    raise exception 'profile % is not a driver', new.id using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.drivers_require_driver_role() from public, anon, authenticated;

drop trigger if exists drivers_require_driver_role on public.drivers;
create trigger drivers_require_driver_role before insert or update of id on public.drivers
  for each row execute function public.drivers_require_driver_role();

alter table public.drivers enable row level security;
revoke all on public.drivers from anon, authenticated;
grant select, insert, update, delete on public.drivers to authenticated; -- narrowed by the policies below

-- A driver sees only their own row. Their sync heartbeat is written by driver_report_sync() (SECURITY DEFINER),
-- not by direct updates, so there is no driver write policy.
drop policy if exists drivers_select_own on public.drivers;
create policy drivers_select_own on public.drivers for select to authenticated
  using (id = auth.uid() and public.app_role() = 'driver');

-- Dispatch sees all drivers (the "Driver sync" page).
drop policy if exists drivers_select_dispatcher on public.drivers;
create policy drivers_select_dispatcher on public.drivers for select to authenticated
  using (public.app_role() = 'dispatcher');

-- Admin manages drivers and their vehicle assignment.
drop policy if exists drivers_admin_all on public.drivers;
create policy drivers_admin_all on public.drivers for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
