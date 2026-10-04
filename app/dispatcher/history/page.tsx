// app/dispatcher/history/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatusPill, Tag } from "@/components/dispatcher/ui";
import { loadPlan, type OrderRec } from "@/lib/dispatcher/loadPlan";
import type { RouteStatus } from "@/lib/dispatcher/types";

type Period = "week" | "month" | "halfyear" | "all";

const PERIODS: { key: Period; label: string; days: number | null }[] = [
  { key: "week", label: "Last 7 days", days: 7 },
  { key: "month", label: "Last 4 weeks", days: 28 },
  { key: "halfyear", label: "Last 6 months", days: 183 },
  { key: "all", label: "All history", days: null },
];

const pillOf = (s: string): RouteStatus => (s === "deferred" ? "deferred" : s === "late" ? "late" : s === "delivered" ? "delivered" : "onPlan");

// Date a record belongs to: assignedAt, orderDate, or fallback to current date for unassigned deferred runs
const dateOf = (r: OrderRec) => r.orderDate ?? r.assignedAt ?? null;
const show = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00+05:30` : iso).toLocaleString("en-GB", { timeZone: "Asia/Colombo", day: "2-digit", month: "short", year: "numeric", ...(iso.length === 10 ? {} : { hour: "2-digit", minute: "2-digit" }) }) : "—";

export default function HistoryPage() {
  const [records, setRecords] = useState<OrderRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("week");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    // Only filter out strictly pending orders that have not been deferred
    loadPlan()
      .then((d) => setRecords(d.orders.filter((o) => o.status !== "pending")))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const days = PERIODS.find((p) => p.key === period)?.days;
    const cutoff = days ? Date.now() - days * 864e5 : 0;
    const q = query.toLowerCase().trim();
    return records
      .filter((r) => {
        const d = dateOf(r);
        // Include deferred orders even if date string is missing
        if (days && d && new Date(d).getTime() < cutoff) return false;
        if (days && !d && r.status !== "deferred") return false;
        if (status !== "all" && r.status !== status) return false;
        return !q || [r.code, r.vehicleId ?? "", r.outletLabel].some((x) => x.toLowerCase().includes(q));
      })
      .sort((a, b) => new Date(dateOf(b) ?? Date.now()).getTime() - new Date(dateOf(a) ?? Date.now()).getTime());
  }, [records, period, status, query]);

  const m = useMemo(() => {
    const n = (s: string) => rows.filter((r) => r.status === s).length;
    return {
      total: rows.length, assigned: n("assigned"), delivered: n("delivered"), late: n("late"), deferred: n("deferred"),
      kg: rows.reduce((a, r) => a + r.kg, 0), m3: rows.reduce((a, r) => a + r.m3, 0),
    };
  }, [rows]);

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["order_code", "date", "outlet", "temp", "vehicle_id", "trip_id", "stop", "status", "weight_kg", "volume_m3", "defer_reason"];
    const body = rows.map((r) => [r.code, dateOf(r) ?? "", r.outletLabel, r.tempClass, r.vehicleId ?? "", r.tripId ?? "", r.seq || "", r.status, r.kg, r.m3, r.deferReason]);
    const csv = [head, ...body].map((l) => l.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `waypoint-history-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div style={{ color: "var(--g600)", fontSize: 14 }}>Loading past runs…</div>;

  return (
    <div>
      <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 6px" }}>Past runs</h1>
      <p style={{ color: "var(--g600)", marginBottom: 20, maxWidth: 680 }}>
        Every planned, delivered, late and deferred order. Filter by period or status, then export the rows as CSV.
      </p>

      {error && <p role="alert" style={{ color: "var(--red-text)", fontSize: 14 }}>Could not load history: {error}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div role="group" aria-label="Period" style={{ display: "flex", gap: 6, background: "var(--g200)", padding: 4, borderRadius: 10, flexWrap: "wrap" }}>
          {PERIODS.map((p) => (
            <button key={p.key} aria-pressed={period === p.key} onClick={() => setPeriod(p.key)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", background: period === p.key ? "var(--white)" : "transparent", color: period === p.key ? "var(--ink)" : "var(--g600)" }}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={field}>
            <option value="all">All statuses</option>
            <option value="assigned">Assigned</option>
            <option value="delivered">Delivered</option>
            <option value="late">Late</option>
            <option value="deferred">Deferred</option>
          </select>
          <input aria-label="Search" placeholder="Search order, vehicle or outlet" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...field, minWidth: 220 }} />
          <button onClick={exportCsv} disabled={rows.length === 0} style={{ ...field, cursor: rows.length ? "pointer" : "not-allowed", fontWeight: 700 }}>Export CSV</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 24 }}>
        <Stat label="Total" value={String(m.total)} />
        <Stat label="Assigned" value={String(m.assigned)} color="var(--blue-text)" />
        <Stat label="Delivered" value={String(m.delivered)} color="var(--green-text)" />
        <Stat label="Late" value={String(m.late)} color="var(--red-text)" />
        <Stat label="Deferred" value={String(m.deferred)} color="var(--red-text)" />
        <Stat label="Payload" value={`${(m.kg / 1000).toFixed(2)} t · ${m.m3.toFixed(1)} m³`} />
      </div>

      <div style={{ background: "var(--white)", border: "1px solid var(--g300)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>{["Date", "Order", "Outlet", "Temp", "Vehicle · trip", "Payload", "Status"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, textTransform: "uppercase", color: "var(--g600)", borderBottom: "1px solid var(--g300)", whiteSpace: "nowrap" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--g600)" }}>No records in this period.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{show(dateOf(r))}</td>
                  <td style={{ ...td, fontWeight: 700 }}>
                    <Link href={`/dispatcher/decision-trail/${encodeURIComponent(r.code)}`} style={{ textDecoration: "underline" }}>{r.code}</Link>
                  </td>
                  <td style={td}>{r.outletLabel}</td>
                  <td style={td}><Tag variant={r.tempClass === "Chilled" ? "chill" : undefined}>{r.tempClass}</Tag></td>
                  <td style={td}>{r.vehicleId ? <><b>{r.vehicleId}</b> · trip {r.tripId}</> : "—"}</td>
                  <td style={td}>{r.kg} kg · {r.m3} m³</td>
                  <td style={td}>
                    <StatusPill status={pillOf(r.status)} />
                    {r.status === "deferred" && r.deferReason && <div style={{ fontSize: 12, color: "var(--g600)", marginTop: 4, maxWidth: 240 }}>{r.deferReason}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label: l, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "var(--white)", border: "1px solid var(--g300)", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--g600)", textTransform: "uppercase", marginBottom: 4 }}>{l}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? "var(--ink)" }}>{value}</div>
    </div>
  );
}

const field: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--g300)", fontSize: 14, background: "var(--white)", color: "var(--ink)", minHeight: 40, fontFamily: "inherit" };
const td: React.CSSProperties = { padding: "12px 16px", color: "var(--ink)", borderBottom: "1px solid var(--g200)", verticalAlign: "top" };