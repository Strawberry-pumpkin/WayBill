-- Driver-owned data: append-only delivery records + private evidence storage.
-- Self-contained: references no other role's tables.

create table if not exists public.delivery_records (
  id             uuid primary key,                       -- client-generated; doubles as the idempotency key
  driver_id      uuid not null references auth.users (id),
  kind           text not null check (kind in ('event', 'proof', 'exception')),
  vehicle_id     text not null,
  trip_id        int  not null check (trip_id in (1, 2)),
  outlet_id      text not null,
  order_ids      text[] not null,                        -- filled by the server from the dispatcher's plan, never by the client
  run_date       date not null,                          -- Sri Lanka calendar day of captured_at
  status         text check (status in ('out_for_delivery', 'arrived', 'delivered')),
  received_by    text check (char_length(received_by) between 1 and 120),
  signature_path text,
  photo_paths    text[],
  reason         text check (reason in ('outlet_not_ready', 'access_blocked', 'item_damaged', 'temperature_exception', 'other')),
  details        text check (char_length(details) <= 1000),
  note           text check (char_length(note) <= 500),
  captured_at    timestamptz not null,                   -- when it really happened (may be hours before upload)
  received_at    timestamptz not null default now(),     -- when the server got it
  constraint delivery_records_shape check (
    (kind = 'event'     and status is not null and reason is null and received_by is null and signature_path is null) or
    (kind = 'proof'     and status is null and reason is null and received_by is not null and signature_path is not null
                         and coalesce(array_length(photo_paths, 1), 0) between 1 and 4) or
    (kind = 'exception' and status is null and reason is not null and received_by is null and signature_path is null)
  )
);

create unique index if not exists delivery_records_one_proof
  on public.delivery_records (vehicle_id, trip_id, outlet_id, run_date) where kind = 'proof';
create unique index if not exists delivery_records_one_event_per_status
  on public.delivery_records (vehicle_id, trip_id, outlet_id, run_date, status) where kind = 'event';
create index if not exists delivery_records_driver_idx on public.delivery_records (driver_id, captured_at desc);
create index if not exists delivery_records_stop_idx on public.delivery_records (vehicle_id, trip_id, outlet_id, run_date);

alter table public.delivery_records enable row level security;

-- Records are written ONLY through public.driver_submit_record() (SECURITY DEFINER), which checks
-- that the stop is on the caller's own run. So there is deliberately no INSERT/UPDATE/DELETE policy:
-- nobody, including drivers, can edit or remove a record once made ("disputes do not depend on memory").
revoke all on public.delivery_records from anon, authenticated;
grant select on public.delivery_records to authenticated;

drop policy if exists delivery_records_select_own on public.delivery_records;
create policy delivery_records_select_own on public.delivery_records for select to authenticated
  using (driver_id = auth.uid() and public.app_role() = 'driver');

drop policy if exists delivery_records_select_dispatcher on public.delivery_records;
create policy delivery_records_select_dispatcher on public.delivery_records for select to authenticated
  using (public.app_role() = 'dispatcher');

-- ---------------------------------------------------------------- evidence storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-evidence', 'delivery-evidence', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- Objects live at <driver uid>/<evidence uuid>. Insert + select only: evidence is immutable.
drop policy if exists evidence_insert_own on storage.objects;
create policy evidence_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'delivery-evidence' and (storage.foldername(name))[1] = auth.uid()::text and public.app_role() = 'driver');

drop policy if exists evidence_select_own on storage.objects;
create policy evidence_select_own on storage.objects for select to authenticated
  using (bucket_id = 'delivery-evidence' and (storage.foldername(name))[1] = auth.uid()::text and public.app_role() = 'driver');

drop policy if exists evidence_select_dispatcher on storage.objects;
create policy evidence_select_dispatcher on storage.objects for select to authenticated
  using (bucket_id = 'delivery-evidence' and public.app_role() = 'dispatcher');

-- ---------------------------------------------------------------- loader hand-off (placeholder)
-- The loader module is not built yet. Contract: return {"releasedAt": "<timestamptz>"} once the loader
-- has released this vehicle/trip, or null while unknown. The driver app already handles null.
create or replace function public.loader_release_status(p_vehicle_id text, p_trip_id int)
returns jsonb
language sql stable security definer set search_path = ''
as $$ select null::jsonb $$;

revoke all on function public.loader_release_status(text, int) from public, anon;
grant execute on function public.loader_release_status(text, int) to authenticated;
