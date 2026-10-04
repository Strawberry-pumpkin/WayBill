-- ============================================================================================
-- UNVERIFIED AGAINST THE LIVE SCHEMA.
-- Everything here reads other roles' tables (drivers, vehicles, assigned_orders, orders, outlets).
-- Column names were inferred from the dispatcher code, not from the database. Uncertain optional
-- columns are read through to_jsonb(row)->>'col' so a missing column yields null instead of an error.
-- Review "ASSUMPTION" comments against the real schema before applying.
-- All functions are SECURITY DEFINER with an empty search_path and re-check the caller, so a driver
-- gets exactly their own run and nothing else; they fail closed on any doubt.
-- ============================================================================================

-- ASSUMPTION: drivers.id = auth.users.id; drivers.vehicle_id, drivers.driver_name,
--             drivers.last_synced_at, drivers.queued_records exist (the dispatcher "Driver sync" page uses them).
-- ASSUMPTION: assigned_orders(order_id, vehicle_id, trip_id, stop_sequence, eta_time, status).
-- ASSUMPTION: orders(id, outlet_id, weight_kg, volume_m3, status) and optionally order_code, temp_class|temp_requirement,
--             order_units, deferred_yesterday, days_since_last_served, created_by.
-- ASSUMPTION: assigned_orders has no date, so the run is "everything currently assigned to the driver's vehicle".

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

  select d.vehicle_id::text, d.driver_name into v_vehicle, v_name from public.drivers d where d.id = v_uid;
  if v_vehicle is null then return null; end if;

  select v.type::text as type, v.temp::text as temp, v.depot::text as depot
    into v_veh from public.vehicles v where v.vehicle_id::text = v_vehicle;

  with grouped as (
    select
      a.trip_id::int                      as trip_id,
      ou.outlet_id::text                  as outlet_id,
      min(a.stop_sequence)::int           as seq,
      min(a.eta_time)                     as eta,
      ou.brand::text                      as brand,
      ou.district                         as district,
      coalesce(ou.name, ou.brand::text || ' – ' || ou.district) as outlet_name,
      ou.address, ou.contact_name, ou.contact_phone, ou.lat, ou.lng,
      ou.dock_type::text                  as dock,
      ou.parking_constraint::text         as parking,
      ou.mall_window, ou.window_open_time, ou.window_close_time,
      bool_or(coalesce((to_jsonb(o) ->> 'deferred_yesterday')::int, 0) > 0)    as skipped,
      max((to_jsonb(o) ->> 'days_since_last_served')::int)                      as days_since,
      jsonb_agg(jsonb_build_object(
        'orderId', o.id::text,
        'code',    coalesce(to_jsonb(o) ->> 'order_code', o.id::text),
        'temp',    case when lower(coalesce(to_jsonb(o) ->> 'temp_class', to_jsonb(o) ->> 'temp_requirement', '')) = 'chilled'
                        then 'chilled' else 'ambient' end,
        'kg',      coalesce(o.weight_kg, 0),
        'm3',      coalesce(o.volume_m3, 0),
        'units',   (to_jsonb(o) ->> 'order_units')::int
      ) order by o.id::text) as orders
    from public.assigned_orders a
    join public.orders  o  on o.id::text = a.order_id::text
    join public.outlets ou on ou.outlet_id::text = o.outlet_id::text
    where a.vehicle_id::text = v_vehicle
    group by a.trip_id, ou.outlet_id, ou.brand, ou.district, ou.name, ou.address, ou.contact_name, ou.contact_phone,
             ou.lat, ou.lng, ou.dock_type, ou.parking_constraint, ou.mall_window, ou.window_open_time, ou.window_close_time
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
      'seq',           g.seq,
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
      'eta',           to_char(g.eta, 'HH24:MI'),
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

  select s ->> 'brand' as brand, s ->> 'outletId' as outlet, (s ->> 'tripId')::int as trip,
         (select ou.district from public.outlets ou where ou.outlet_id::text = s ->> 'outletId') as district
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
  v_orders   text[];
  v_captured timestamptz := (p_record ->> 'captured_at')::timestamptz;
  v_date     date;
  v_existing public.delivery_records;
  v_path     text;
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

  -- Ownership: the stop must be on the vehicle assigned to THIS driver.
  select d.vehicle_id::text into v_vehicle from public.drivers d where d.id = v_uid;
  if v_vehicle is null or v_vehicle is distinct from p_record ->> 'vehicle_id' then
    raise exception 'stop is not on your run' using errcode = '42501';
  end if;

  select array_agg(distinct a.order_id::text) into v_orders
    from public.assigned_orders a
    join public.orders o on o.id::text = a.order_id::text
   where a.vehicle_id::text = v_vehicle and a.trip_id::int = v_trip and o.outlet_id::text = v_outlet;
  if v_orders is null then
    raise exception 'stop is not on your run' using errcode = '42501';
  end if;

  -- A delivered stop is closed: no further progress, proof or exception.
  if exists (select 1 from public.delivery_records r
              where r.vehicle_id = v_vehicle and r.trip_id = v_trip and r.outlet_id = v_outlet and r.run_date = v_date
                and (r.kind = 'proof')) then
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
      (v_id, v_uid, v_kind, v_vehicle, v_trip, v_outlet, v_orders, v_date,
       p_record ->> 'status', p_record ->> 'received_by', p_record ->> 'signature_path',
       case when p_record ? 'photo_paths' then array(select jsonb_array_elements_text(p_record -> 'photo_paths')) end,
       p_record ->> 'reason', p_record ->> 'details', p_record ->> 'note', v_captured);
  exception when unique_violation then
    -- Same stop + status already recorded under a different id (double tap): treat as done.
    return jsonb_build_object('id', v_id, 'duplicate', true);
  end;

  -- ASSUMPTION: assigned_orders.status accepts 'delivered'. Exceptions deliberately change nothing:
  -- they flag the stop for dispatch, which decides about deferral.
  if v_kind = 'proof' then
    update public.assigned_orders a set status = 'delivered'
     where a.vehicle_id::text = v_vehicle and a.trip_id::int = v_trip and a.order_id::text = any (v_orders);
  end if;

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
   where id = auth.uid();
end;
$$;

revoke all on function public.driver_report_sync(int) from public, anon;
grant execute on function public.driver_report_sync(int) to authenticated;

-- ---------------------------------------------------------------- store manager read access
-- A manager may see a driver's records for a stop only when one of that stop's orders was created by them.
-- ASSUMPTION: orders.created_by = the manager's auth uid.
create or replace function public.manager_owns_any_order(p_order_ids text[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.app_role() = 'outlet_manager'
     and exists (select 1 from public.orders o
                  where o.id::text = any (p_order_ids) and to_jsonb(o) ->> 'created_by' = auth.uid()::text)
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
