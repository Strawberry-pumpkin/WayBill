"use client";
import { useMemo, useState } from "react";
import { Clock, MapPin, Package, Search } from "lucide-react";
import { useDriver } from "@/components/driver/DriverProvider";
import { BottomNav, Gate, OfflineBanner, StatusChip, TempChip, TopBar } from "@/components/driver/ui";
import { currentTripId } from "@/lib/driver/stopState";
import { dockLabel, stopLoad } from "@/lib/driver/format";
import type { StopStatus } from "@/lib/driver/types";

const FILTERS: { key: "all" | StopStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "onplan", label: "On plan" },
  { key: "late", label: "Running late" },
  { key: "delivered", label: "Delivered" },
];

function Dashboard() {
  const { run, views, identity, runError, fromCache, refreshRun } = useDriver();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | StopStatus>("all");
  const trip = run ? currentTripId(run, views) : 1;
  const tripViews = useMemo(() => views.filter((v) => v.stop.tripId === trip).sort((a, b) => a.stop.seq - b.stop.seq), [views, trip]);

  const shown = tripViews.filter((v) => (filter === "all" || v.status === filter) && (!q.trim() || `${v.stop.outletName} ${v.stop.outletId}`.toLowerCase().includes(q.trim().toLowerCase())));
  const left = tripViews.filter((v) => v.status === "onplan" || v.status === "late").length;
  const done = tripViews.filter((v) => v.status === "delivered").length;
  const flagged = tripViews.filter((v) => v.status === "exception").length;
  const first = identity?.name.split(" ")[0] ?? "";

  return (
    <>
      <TopBar title={`Hi, ${first}`} />
      <OfflineBanner />
      <div className="content">
        {runError && (
          <div className="error-note t-caption" role="status">
            {runError} <button className="btn btn-ghost" style={{ height: 32, padding: "0 8px", textDecoration: "underline" }} onClick={() => void refreshRun()}>Retry</button>
          </div>
        )}
        <div className="card trip-bar">
          <div><span className="t-caption t-secondary">Vehicle</span><span className="t-label">{run!.vehicle.id} · {run!.vehicle.temp === "reefer" ? "Reefer" : run!.vehicle.type}</span></div>
          <div><span className="t-caption t-secondary">Trip</span><span className="t-label">Trip {trip} of {Math.max(run!.tripIds.length, 1)}{run!.brand ? ` · ${run!.brand}` : ""}{run!.district ? ` · ${run!.district}` : ""}</span></div>
          {run!.brand === "Fresh" && <div><span className="t-caption t-secondary">Cutoff</span><span className="t-label">Before 8:00 AM</span></div>}
          {fromCache && <div><span className="t-caption t-secondary">Plan</span><span className="t-label">Last saved on this phone</span></div>}
        </div>

        <div className="stats">
          <div className="card stat-card"><span className="t-caption t-secondary">Stops left</span><span className="t-metric">{left}</span></div>
          <div className="card stat-card"><span className="t-caption t-secondary">Delivered</span><span className="t-metric">{done}</span></div>
          <div className="card stat-card"><span className="t-caption t-secondary">Flagged</span><span className="t-metric">{flagged}</span></div>
        </div>

        <div>
          <label className="search-bar card" style={{ padding: "0 var(--space-3)", height: 48 }}>
            <Search size={18} aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search outlets" aria-label="Search outlets" style={{ border: 0, outline: 0, flex: 1, fontSize: 16, background: "transparent", height: "100%" }} />
          </label>
          <div className="filter-row" role="group" aria-label="Filter stops">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" aria-pressed={filter === f.key} className={`chip ${f.key === "all" ? (filter === f.key ? "chip-active" : "chip-neutral") : `chip-${f.key}`}`} style={filter === f.key && f.key !== "all" ? { boxShadow: "var(--focus-ring)" } : undefined} onClick={() => setFilter(f.key)}>
                {f.key !== "all" && <span className="dot" />}{f.label}
              </button>
            ))}
          </div>
        </div>

        <h2 className="t-section">Today&apos;s stops ({shown.length})</h2>
        <div>
          {shown.length === 0 && <p className="t-body t-secondary">{tripViews.length === 0 ? "No stops planned for you yet." : "No stops match."}</p>}
          {shown.map((v) => {
            const chilled = v.stop.orders.some((o) => o.temp === "chilled");
            return (
              <a key={v.stop.stopId} className="card delivery-card" href={`/driver/stop?id=${encodeURIComponent(v.stop.stopId)}`}>
                <div className="time-col"><span className="t-data">{v.stop.eta ?? "—"}</span><span className="t-caption t-secondary">Stop {v.stop.seq}</span></div>
                <div className="divider" />
                <div className="info-col">
                  <span className="t-ui name">{v.stop.outletName}</span>
                  <span className="t-caption t-secondary">{v.stop.outletId}</span>
                  <span className="info-row t-caption"><MapPin size={14} aria-hidden />{dockLabel(v.stop.dock, v.stop.windowLabel)}</span>
                  <span className="info-row t-caption"><Package size={14} aria-hidden />{stopLoad(v.stop.orders)}{v.stop.orders.length > 1 ? ` · ${v.stop.orders.length} orders` : ""}</span>
                  {v.stop.skippedLastRun && <span className="tag-held"><Clock size={12} aria-hidden />Skipped last run</span>}
                  {v.delivered && !v.proofRecorded && <span className="tag-held">Proof of delivery needed</span>}
                  {v.pendingSync && <span className="t-caption t-secondary">Saved on phone · waiting to sync</span>}
                </div>
                <div className="trailing"><TempChip chilled={chilled} /><StatusChip status={v.status} /></div>
              </a>
            );
          })}
        </div>
      </div>
      <BottomNav active="/driver/dashboard" />
    </>
  );
}

export default function Page() {
  return <Gate><Dashboard /></Gate>;
}
