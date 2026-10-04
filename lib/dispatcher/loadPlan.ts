// lib/dispatcher/loadPlan.ts
// One loader for everything the dispatcher screens need, built on the same engine types as the plan page.
import { supabase } from "@/lib/supabase/client";
import { loadCtx } from "./loadCtx";
import { toMin, type Brand, type Ctx, type Order, type Trip, type Vehicle } from "./allocation";

export type FleetVehicle = Vehicle & { workshop: boolean };

export interface OrderRec {
  id: string;
  code: string;
  status: string; // pending | assigned | delivered | late | deferred
  vehicleId: string | null;
  tripId: number | null;
  seq: number;
  eta: string;
  outletLabel: string;
  depot: string;
  tempClass: "Chilled" | "Ambient";
  kg: number;
  m3: number;
  deferReason: string;
  orderDate: string | null;
  assignedAt: string | null;
  core: Order;
}

export interface PlanData {
  vehicles: FleetVehicle[];
  orders: OrderRec[];
  trips: Trip[];
  ctx: Ctx;
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const hhmm = (t?: string | null) => (t ? String(t).slice(0, 5) : "");

export async function loadPlan(): Promise<PlanData> {
  const [veh, ord, asg, ctx] = await Promise.all([
    supabase.from("vehicles").select("*"),
    supabase
      .from("orders")
      .select("*, outlets ( outlet_id, brand, district, depot, dock_type, parking_constraint, mall_window, window_open_time, window_close_time )"),
    supabase.from("assigned_orders").select("*"),
    loadCtx(),
  ]);
  const err = [veh, ord, asg].find((r) => r.error);
  if (err?.error) throw new Error(err.error.message);

  const vehicles: FleetVehicle[] = (veh.data ?? []).map((v: any) => ({
    id: String(v.vehicle_id),
    type: norm(v.type) === "van" ? "van" : "truck",
    reefer: norm(v.temp) === "reefer",
    kg: Number(v.weight_cap_kg),
    m3: Number(v.volume_cap_m3),
    kmPerL: Number(v.km_per_l) || 1,
    quotaL: Number(v.weekly_fuel_quota_l),
    usedL: Number(v.fuel_used_l) || 0,
    depot: v.depot,
    workshop: norm(v.status) === "in_workshop",
  }));

  const assignment = new Map<string, any>((asg.data ?? []).map((a: any) => [String(a.order_id), a]));

  const orders: OrderRec[] = (ord.data ?? []).map((o: any) => {
    const out = Array.isArray(o.outlets) ? o.outlets[0] ?? {} : o.outlets ?? {};
    const a = assignment.get(String(o.id));
    const code = o.order_code || String(o.id);
    const core: Order = {
      id: code, dbId: String(o.id), outletId: String(out.outlet_id ?? ""), brand: out.brand as Brand,
      district: out.district, depot: out.depot, dock: out.dock_type, vanOnly: norm(out.parking_constraint) === "van_only",
      mallWindow: out.mall_window || null, open: toMin(out.window_open_time), close: toMin(out.window_close_time),
      chilled: norm(o.temp_class ?? o.temp_requirement) === "chilled", kg: Number(o.weight_kg) || 0, m3: Number(o.volume_m3) || 0,
      deferredYesterday: 0, daysSinceServed: 0, label: "",
    };

    // Explicitly check for deferred status or defer reason presence
    const rawStatus = norm(o.status || "pending");
    const isDeferred = rawStatus === "deferred" || Boolean(o.defer_reason);
    const calculatedStatus = a ? norm(a.status || "assigned") : isDeferred ? "deferred" : rawStatus;

    return {
      id: String(o.id),
      code,
      status: calculatedStatus,
      vehicleId: a ? String(a.vehicle_id) : null,
      tripId: a ? Number(a.trip_id) || 1 : null,
      seq: a ? Number(a.stop_sequence) || 0 : 0,
      eta: a?.eta_time ? hhmm(a.eta_time) : "",
      outletLabel: `${out.brand ?? "Outlet"}${out.district ? " · " + out.district : ""}`,
      depot: out.depot ?? "",
      tempClass: core.chilled ? "Chilled" : "Ambient",
      kg: core.kg,
      m3: core.m3,
      deferReason: o.defer_reason ?? "",
      orderDate: o.order_date ?? o.created_at ?? null,
      assignedAt: a?.assigned_at ?? null,
      core,
    };
  });

  const grouped = new Map<string, Trip>();
  orders
    .filter((o) => o.vehicleId && ["assigned", "delivered", "late"].includes(o.status))
    .sort((a, b) => a.seq - b.seq)
    .forEach((o) => {
      const key = `${o.vehicleId}|${o.tripId}`;
      const t = grouped.get(key) ?? { vehicleId: o.vehicleId!, tripId: (o.tripId ?? 1) as 1 | 2, brand: o.core.brand, district: o.core.district, orders: [] };
      t.orders.push(o.core);
      grouped.set(key, t);
    });

  return { vehicles, orders, trips: [...grouped.values()], ctx };
}