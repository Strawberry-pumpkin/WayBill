-- Everything that reads or writes other roles' tables, written against the live schema (inspected 2026-10-05):
--   orders(id uuid, order_code, outlet_id, temp_class, weight_kg, volume_m3, status, delivery_date, deferred_yesterday,
--          days_since_last_served, cancelled_at, proof_of_delivery jsonb, ...)
--   assigned_orders(id, order_id uuid unique, vehicle_id text, status in ('assigned','deferred','delivered'),
--                   stop_sequence int, trip_id int, eta_time text)
--   vehicles(vehicle_id, type, temp, depot, ...), outlets(..., location geometry, outlet_name), order_events(...)
-- All functions are SECURITY DEFINER with an empty search_path and re-check the caller, so a driver gets exactly
-- their own run and nothing else; they fail closed on any doubt.

-- orders had no owner. The store-manager rule ("can view as long as the order is one they created") needs it.
-- NULLABLE and additive: existing orders keep working. The store-manager module must set created_by = auth.uid()
-- when it inserts an order.
alter table public.orders add column if not exists created_by uuid references auth.users (id) on delete set null;
create index if not exists orders_created_by_idx on public.orders (created_by);

-- ---------------------------------------------------------------- read path
-- The caller's own run for today (Sri Lanka date): the stops on the vehicle assigned to them.
create or replace function public.driver_run()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_vehicle text;
  v_name    text;
  v_veh     record;
  v_today   date := (now() at time zone 'Asia/Colombo')::date;
  v_stops   jsonb;
  v_trips   jsonb;
  v_first   record;
begin
  if v_uid is null or public.app_role() is distinct from 'driver' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select d.vehicle_id, d.driver_name into v_vehicle, v_name from public.drivers d where d.user_id = v_uid;
  if v_vehicle is null then return null; end if;

  select v.type::text as type, v.temp::text as temp, v.depot::text as depot
    into v_veh from public.vehicles v where v.vehicle_id = v_vehicle;

  with grouped as (
    select
      coalesce(a.trip_id, 1)               as trip_id,
      ou.outlet_id::text                   as outlet_id,
      min(a.stop_sequence)                 as seq,
      left(min(a.eta_time), 5)             as eta,
      max(ou.brand)::text                  as brand,
      max(ou.district)::text               as district,
      coalesce(max(ou.outlet_name), max(ou.brand)::text || ' – ' || max(ou.district)::text) as outlet_name,
      max(oc.address)                      as address,
      max(oc.contact_name)                 as contact_name,
      max(oc.contact_phone)                as contact_phone,
      -- outlets.location is PostGIS; its jsonb cast is GeoJSON: coordinates = [lng, lat]
      max((ou.location::jsonb -> 'coordinates' ->> 1)::float8) as lat,
      max((ou.location::jsonb -> 'coordinates' ->> 0)::float8) as lng,
      max(ou.dock_type::text)              as dock,
      max(ou.parking_constraint::text)     as parking,
      max(ou.mall_window)                  as mall_window,
      max(ou.window_open_time)             as window_open_time,
      max(ou.window_close_time)            as window_close_time,
      bool_or(coalesce(o.deferred_yesterday, 0) > 0) as skipped,
      max(o.days_since_last_served)        as days_since,
      jsonb_agg(jsonb_build_object(
        'orderId', o.id::text,
        'code',    o.order_code,
        'temp',    case when lower(coalesce(o.temp_class, '')) = 'chilled' then 'chilled' else 'ambient' end,
        'kg',      o.weight_kg,
        'm3',      o.volume_m3,
        'units',   null
      ) order by o.order_code) as orders
    from public.assigned_orders a
    join public.orders  o  on o.id = a.order_id
    join public.outlets ou on ou.outlet_id = o.outlet_id
    left join public.outlet_contacts oc on oc.outlet_id = ou.outlet_id
    where a.vehicle_id = v_vehicle
      and a.status <> 'deferred'
      and o.cancelled_at is null
      and o.delivery_date = v_today
    group by coalesce(a.trip_id, 1), ou.outlet_id
  ), progress as (
    select r.outlet_id, r.trip_id,
           max(case when r.kind = 'proof' then 4 when r.status = 'delivered' then 3
                    when r.status = 'arrived' then 2 when r.status = 'out_for_delivery' then 1 end) as rank,
           bool_or(r.kind = 'exception') as has_exception
    from public.delivery_records r
    where r.vehicle_id = v_vehicle and r.run_date = v_today and r.driver_id = v_uid
    group by r.outlet_id, r.trip_id
  )
  select
    jsonb_agg(jsonb_build_object(
      'stopId',        v_vehicle || '|' || g.trip_id || '|' || g.outlet_id,
      'tripId',        g.trip_id,
      'seq',           coalesce(g.seq, 0),
      'outletId',      g.outlet_id,
      'outletName',    g.outlet_name,
      'brand',         g.brand,
      'address',       g.address,
      'contactName',   g.contact_name,
      'contactPhone',  g.contact_phone,
      'lat',           g.lat,
      'lng',           g.lng,
      'dock',          g.dock,
      'windowLabel',   coalesce(g.mall_window, to_char(g.window_open_time, 'HH24:MI') || '–' || to_char(g.window_close_time, 'HH24:MI')),
      'windowClose',   to_char(g.window_close_time, 'HH24:MI'),
      'eta',           g.eta,
      'skippedLastRun', g.skipped,
      'daysSinceServed', g.days_since,
      'vanOnly',       g.parking = 'van_only',
      'orders',        g.orders,
      'serverStatus',  case when p.rank >= 3 then 'delivered' when p.rank = 2 then 'arrived' when p.rank = 1 then 'out_for_delivery' end,
      'serverProof',   coalesce(p.rank = 4, false),
      'serverException', coalesce(p.has_exception, false)
    ) order by g.trip_id, g.seq),
    (select jsonb_agg(distinct g2.trip_id order by g2.trip_id) from grouped g2)
  into v_stops, v_trips
  from grouped g left join progress p on p.outlet_id = g.outlet_id and p.trip_id = g.trip_id;

  if v_stops is null then
    return jsonb_build_object(
      'driver', jsonb_build_object('id', v_uid, 'name', v_name),
      'vehicle', jsonb_build_object('id', v_vehicle, 'type', v_veh.type, 'temp', v_veh.temp, 'depot', v_veh.depot),
      'district', null, 'brand', null, 'tripIds', '[]'::jsonb, 'release', null, 'stops', '[]'::jsonb);
  end if;

  select s ->> 'brand' as brand, (s ->> 'tripId')::int as trip,
         (select ou.district::text from public.outlets ou where ou.outlet_id = s ->> 'outletId') as district
    into v_first from jsonb_array_elements(v_stops) s order by (s ->> 'tripId')::int, (s ->> 'seq')::int limit 1;

  return jsonb_build_object(
    'driver',   jsonb_build_object('id', v_uid, 'name', v_name),
    'vehicle',  jsonb_build_object('id', v_vehicle, 'type', v_veh.type, 'temp', v_veh.temp, 'depot', v_veh.depot),
    'district', v_first.district,
    'brand',    v_first.brand,
    'tripIds',  v_trips,
    'release',  public.loader_release_status(v_vehicle, v_first.trip),
    'stops',    v_stops
  );
end;
$$;

revoke all on function public.driver_run() from public, anon;
grant execute on function public.driver_run() to authenticated;

-- ---------------------------------------------------------------- write path
create or replace function public.driver_submit_record(p_record jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_id       uuid := (p_record ->> 'id')::uuid;
  v_kind     text := p_record ->> 'kind';
  v_trip     int  := (p_record ->> 'trip_id')::int;
  v_outlet   text := p_record ->> 'outlet_id';
  v_vehicle  text;
  v_name     text;
  v_orders   uuid[];
  v_codes    text[];
  v_captured timestamptz := (p_record ->> 'captured_at')::timestamptz;
  v_date     date;
  v_existing public.delivery_records;
  v_path     text;
  v_action   text;
  v_detail   text;
begin
  if v_uid is null or public.app_role() is distinct from 'driver' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Idempotency: a retried upload of the same record is a success, but never someone else's record.
  select * into v_existing from public.delivery_records where id = v_id;
  if found then
    if v_existing.driver_id <> v_uid then raise exception 'forbidden' using errcode = '42501'; end if;
    return jsonb_build_object('id', v_id, 'duplicate', true);
  end if;

  if v_kind not in ('event', 'proof', 'exception') then
    raise exception 'invalid kind' using errcode = '22023';
  end if;
  if v_captured > now() + interval '10 minutes' or v_captured < now() - interval '7 days' then
    raise exception 'capture time out of range' using errcode = '22023';
  end if;
  v_date := (v_captured at time zone 'Asia/Colombo')::date;

  -- Ownership: the stop must be on the vehicle assigned to THIS driver, on that day.
  select d.vehicle_id, d.driver_name into v_vehicle, v_name from public.drivers d where d.user_id = v_uid;
  if v_vehicle is null or v_vehicle is distinct from p_record ->> 'vehicle_id' then
    raise exception 'stop is not on your run' using errcode = '42501';
  end if;

  select array_agg(distinct o.id), array_agg(distinct o.order_code) into v_orders, v_codes
    from public.assigned_orders a
    join public.orders o on o.id = a.order_id
   where a.vehicle_id = v_vehicle and coalesce(a.trip_id, 1) = v_trip and o.outlet_id = v_outlet
     and a.status <> 'deferred' and o.cancelled_at is null and o.delivery_date = v_date;
  if v_orders is null then
    raise exception 'stop is not on your run' using errcode = '42501';
  end if;

  -- A delivered stop is closed: no further progress, proof or exception.
  if exists (select 1 from public.delivery_records r
              where r.vehicle_id = v_vehicle and r.trip_id = v_trip and r.outlet_id = v_outlet and r.run_date = v_date
                and r.kind = 'proof') then
    raise exception 'stop already completed' using errcode = '22023';
  end if;

  if v_kind = 'proof' then
    -- Referenced evidence must exist and belong to this driver (path prefix is also built server-side).
    foreach v_path in array (array[p_record ->> 'signature_path'] || array(select jsonb_array_elements_text(p_record -> 'photo_paths'))) loop
      if v_path is null or split_part(v_path, '/', 1) <> v_uid::text
         or not exists (select 1 from storage.objects so where so.bucket_id = 'delivery-evidence' and so.name = v_path) then
        raise exception 'evidence missing' using errcode = '22023';
      end if;
    end loop;
  end if;

  begin
    insert into public.delivery_records
      (id, driver_id, kind, vehicle_id, trip_id, outlet_id, order_ids, run_date, status, received_by,
       signature_path, photo_paths, reason, details, note, captured_at)
    values
      (v_id, v_uid, v_kind, v_vehicle, v_trip, v_outlet, array(select unnest(v_orders)::text), v_date,
       p_record ->> 'status', p_record ->> 'received_by', p_record ->> 'signature_path',
       case when p_record ? 'photo_paths' then array(select jsonb_array_elements_text(p_record -> 'photo_paths')) end,
       p_record ->> 'reason', p_record ->> 'details', p_record ->> 'note', v_captured);
  exception when unique_violation then
    -- Same stop + status already recorded under a different id (double tap): treat as done.
    return jsonb_build_object('id', v_id, 'duplicate', true);
  end;

  if v_kind = 'proof' then
    update public.assigned_orders set status = 'delivered'
     where order_id = any (v_orders) and vehicle_id = v_vehicle;
    -- orders.proof_of_delivery (jsonb) already exists for the store manager's receipt screen.
    -- OPEN QUESTION for the store-manager module: this is the shape written; adjust if they expect another.
    update public.orders set proof_of_delivery = jsonb_build_object(
        'record_id', v_id, 'received_by', p_record ->> 'received_by', 'captured_at', v_captured,
        'signature_path', p_record ->> 'signature_path', 'photo_paths', p_record -> 'photo_paths',
        'note', p_record ->> 'note', 'vehicle_id', v_vehicle, 'driver', v_name)
     where id = any (v_orders);
  end if;

  -- Audit trail the dispatcher already reads (decision trail). Best effort: never fail a delivery record
  -- because of the trail.
  v_action := case v_kind
    when 'proof' then 'Delivered — proof recorded'
    when 'exception' then 'Driver exception: ' || replace(p_record ->> 'reason', '_', ' ')
    else case p_record ->> 'status' when 'out_for_delivery' then 'Out for delivery' when 'arrived' then 'Arrived at dock' else 'Delivered' end
  end;
  v_detail := coalesce(nullif(p_record ->> 'details', ''), nullif(p_record ->> 'note', ''),
                       case when v_kind = 'proof' then 'Received by ' || (p_record ->> 'received_by') end);
  begin
    insert into public.order_events (order_id, order_code, actor, action, detail, alert)
    select o.id, o.order_code, 'Driver ' || v_name, v_action, v_detail, v_kind = 'exception'
      from public.orders o where o.id = any (v_orders);
  exception when others then
    raise warning 'order_events insert skipped: %', sqlerrm;
  end;

  return jsonb_build_object('id', v_id, 'duplicate', false);
end;
$$;

revoke all on function public.driver_submit_record(jsonb) from public, anon;
grant execute on function public.driver_submit_record(jsonb) to authenticated;

create or replace function public.driver_report_sync(p_queued int)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or public.app_role() is distinct from 'driver' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.drivers set last_synced_at = now(), queued_records = greatest(0, least(coalesce(p_queued, 0), 10000))
   where user_id = auth.uid();
end;
$$;

revoke all on function public.driver_report_sync(int) from public, anon;
grant execute on function public.driver_report_sync(int) to authenticated;

-- ---------------------------------------------------------------- store manager read access
-- A manager may see a driver's records for a stop only when one of that stop's orders was created by them.
create or replace function public.manager_owns_any_order(p_order_ids text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.app_role() = 'outlet_manager'
     and exists (select 1 from public.orders o
                  where o.id::text = any (p_order_ids) and o.created_by = auth.uid())
$$;
revoke all on function public.manager_owns_any_order(text[]) from public, anon;
grant execute on function public.manager_owns_any_order(text[]) to authenticated;

drop policy if exists delivery_records_select_manager on public.delivery_records;
create policy delivery_records_select_manager on public.delivery_records for select to authenticated
  using (public.manager_owns_any_order(order_ids));

create or replace function public.manager_can_read_evidence(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.delivery_records r
                  where (r.signature_path = p_name or p_name = any (r.photo_paths))
                    and public.manager_owns_any_order(r.order_ids))
$$;
revoke all on function public.manager_can_read_evidence(text) from public, anon;
grant execute on function public.manager_can_read_evidence(text) to authenticated;

drop policy if exists evidence_select_manager on storage.objects;
create policy evidence_select_manager on storage.objects for select to authenticated
  using (bucket_id = 'delivery-evidence' and public.manager_can_read_evidence(name));
