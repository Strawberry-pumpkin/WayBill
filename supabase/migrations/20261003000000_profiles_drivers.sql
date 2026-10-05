-- profiles + drivers, adapted to the schema that already exists in the project (inspected 2026-10-05).
-- Runs before every other migration (they depend on app_role()).
-- `create table if not exists` mirrors the live shape so a fresh database ends up the same; on the live
-- database the tables exist, so only the ALTER / policy / trigger statements below take effect.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  email      text not null unique,
  role       public.user_role not null,
  depot      text default 'Peliyagoda depot',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- The live table defaults new profiles to 'dispatcher'. A forgotten role must never silently grant
-- dispatcher access, so the role has to be stated explicitly when an admin creates a user.
alter table public.profiles alter column role drop default;

alter table public.profiles enable row level security;

-- The caller's role. SECURITY DEFINER so policies can call it without recursing into profiles' own RLS.
create or replace function public.app_role()
returns text
language sql stable security definer set search_path = ''
as $$ select p.role::text from public.profiles p where p.id = auth.uid() $$;

revoke all on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

revoke all on public.profiles from anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated; -- narrowed to admins by the policies below

-- SECURITY FIX. These two existing policies let ANY signed-in user read every profile and update their OWN row
-- — including `role`, i.e. a driver could make themselves admin with one request.
drop policy if exists "Allow authenticated read profiles" on public.profiles;
drop policy if exists "Allow users to update own profile" on public.profiles;

-- Everyone can read their own row (the app needs the role and name after login).
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());

-- Admins manage users and define roles. Nobody else can write, so nobody can promote themselves.
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- ---------------------------------------------------------------- drivers
-- The existing table has its own random `id` and no link to a login. Everyone is identified by their Supabase
-- Auth uuid, so a driver row is linked to its profile through `user_id`.
create table if not exists public.drivers (
  id             uuid primary key default gen_random_uuid(),
  driver_name    text not null,
  vehicle_id     text references public.vehicles (vehicle_id) on delete set null,
  last_synced_at timestamptz not null default now(),
  queued_records int not null default 0
);

alter table public.drivers add column if not exists user_id uuid references public.profiles (id) on delete set null;

-- One login per driver row, one driver per vehicle ("each vehicle has a driver").
create unique index if not exists drivers_user_id_key on public.drivers (user_id);
create unique index if not exists drivers_one_driver_per_vehicle on public.drivers (vehicle_id) where vehicle_id is not null;

-- Integrity: a drivers row may only be linked to a profile whose role is 'driver'.
create or replace function public.drivers_require_driver_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.user_id is not null
     and not exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'driver') then
    raise exception 'profile % is not a driver', new.user_id using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.drivers_require_driver_role() from public, anon, authenticated;

drop trigger if exists drivers_require_driver_role on public.drivers;
create trigger drivers_require_driver_role before insert or update of user_id on public.drivers
  for each row execute function public.drivers_require_driver_role();

alter table public.drivers enable row level security;
revoke all on public.drivers from anon, authenticated;
grant select, insert, update, delete on public.drivers to authenticated; -- narrowed by the policies below

-- A driver sees only their own row. Their sync heartbeat is written by driver_report_sync() (SECURITY DEFINER),
-- so there is deliberately no driver write policy.
drop policy if exists drivers_select_own on public.drivers;
create policy drivers_select_own on public.drivers for select to authenticated
  using (user_id = auth.uid() and public.app_role() = 'driver');

-- Dispatch sees all drivers (the "Driver sync" page keeps working).
drop policy if exists drivers_select_dispatcher on public.drivers;
create policy drivers_select_dispatcher on public.drivers for select to authenticated
  using (public.app_role() = 'dispatcher');

-- Admin manages drivers and their vehicle assignment.
drop policy if exists drivers_admin_all on public.drivers;
create policy drivers_admin_all on public.drivers for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
