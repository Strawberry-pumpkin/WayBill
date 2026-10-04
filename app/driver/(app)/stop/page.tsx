"use client";
import { AlertTriangle, Check, Clock, MapPin, Navigation, Phone } from "lucide-react";
import { OfflineBanner, StatusChip, StopGate, TempChip, TopBar, BottomNav } from "@/components/driver/ui";
import { useDriver } from "@/components/driver/DriverProvider";
import { dockLabel, hhmm } from "@/lib/driver/format";
import type { StopView } from "@/lib/driver/stopState";

function Detail({ v }: { v: StopView }) {
  const { run, views } = useDriver();
  const s = v.stop;
  const chilled = s.orders.some((o) => o.temp === "chilled");
  const ambient = s.orders.some((o) => o.temp === "ambient");
  const total = views.filter((x) => x.stop.tripId === s.tripId).length;
  const id = encodeURIComponent(s.stopId);
  const maps = s.lat != null && s.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}` : s.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}` : null;
  const done = v.proofRecorded || v.exception;
  const released = !!run?.release?.releasedAt;
  const step = (label: string, sub: string, state: "done" | "current" | "upcoming") => (
    <div className="timeline-step">
      <div className="rail"><div className={`dot dot-${state}`}>{state === "done" && <Check size={14} aria-hidden />}</div><div className="line" /></div>
      <div className="body"><span className="t-label">{label}</span><span className="t-caption t-secondary">{sub}</span></div>
    </div>
  );

  return (
    <>
      <TopBar back={{ href: "/driver/dashboard", label: "Dashboard" }} />
      <OfflineBanner />
      <div className="content">
        <div className="stack">
          <h1 className="t-title">{s.outletName}</h1>
          <div className="row" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><StatusChip status={v.status} /><TempChip chilled={chilled} />{chilled && ambient && <span className="temp-chip">+ ambient</span>}</div>
          {s.skippedLastRun && <span className="tag-held"><Clock size={12} aria-hidden />Skipped last run</span>}
          <span className="t-body t-secondary">{s.outletId} · Stop {s.seq} of {total} · {dockLabel(s.dock, s.windowLabel)} · Window {s.windowLabel}{s.eta ? ` · ETA ${s.eta}` : ""}</span>
        </div>

        {s.address && <div className="map-placeholder"><MapPin size={20} aria-hidden /><span className="t-caption t-secondary">{s.address}</span></div>}

        <div className="card stack">
          <span className="t-label t-secondary">Items in this delivery</span>
          {s.orders.map((o) => (
            <div key={o.orderId} className="row-between">
              <span className="t-body">{o.code}{o.units != null ? ` — ${o.units} cases` : ""} {o.temp === "chilled" ? "(chilled)" : "(ambient)"}</span>
              <span className="t-data t-secondary">{Math.round(o.kg)} kg</span>
            </div>
          ))}
        </div>

        <div className="row-between" style={{ gap: 12 }}>
          {s.contactPhone ? <a className="btn btn-secondary" style={{ flex: 1 }} href={`tel:${s.contactPhone}`}><Phone size={18} aria-hidden />Call store</a> : <span className="btn btn-secondary" aria-disabled style={{ flex: 1, opacity: .45 }}><Phone size={18} aria-hidden />No number</span>}
          {maps ? <a className="btn btn-ghost" style={{ flex: 1 }} href={maps} target="_blank" rel="noopener noreferrer"><Navigation size={18} aria-hidden />Directions</a> : null}
        </div>

        <div className="card stack">
          <span className="t-label t-secondary">Delivery notes</span>
          <span className="t-body">
            {s.skippedLastRun ? `Skipped last run${s.daysSinceServed != null ? ` — ${s.daysSinceServed} days since last served` : ""}. ` : ""}
            {s.contactName ? `Contact: ${s.contactName}. ` : ""}
            {s.dock === "rear_dock" ? "Use the rear dock." : s.dock === "street" ? "Curbside unloading." : s.dock === "mall_bay" ? "Shared mall bay — mind the access window." : ""}
            {s.vanOnly ? " Vans only." : ""}
          </span>
        </div>

        {!done && <a className="back-row" href={`/driver/exception?id=${id}`}><AlertTriangle size={16} aria-hidden />Can&apos;t complete this stop</a>}

        <div className="card stack">
          <span className="t-label t-secondary">Delivery timeline</span>
          <div className="timeline">
            {step("Loaded at depot", released ? "Released by loader" : "Loader hand-off not connected yet", released ? "done" : "upcoming")}
            {step("Out for delivery", v.times.out_for_delivery ? `Started ${hhmm(v.times.out_for_delivery)}` : "Not started", v.progress ? "done" : "current")}
            {step("Arrived at dock", v.progress && v.progress !== "out_for_delivery" ? "Arrived" : "Not yet", v.progress === "arrived" || v.progress === "delivered" ? "done" : v.progress === "out_for_delivery" ? "current" : "upcoming")}
            {step("Delivered & confirmed", v.proofRecorded ? "Proof recorded" : v.delivered ? "Awaiting proof of delivery" : "Awaiting proof of delivery", v.proofRecorded ? "done" : v.delivered ? "current" : "upcoming")}
          </div>
        </div>

        {v.exception && <div className="error-note t-body">An exception was reported for this stop. Dispatch will decide what happens next.</div>}
        {v.proofRecorded ? <a className="btn btn-secondary btn-block" href="/driver/dashboard">Back to dashboard</a>
          : v.exception ? null
          : <a className="btn btn-primary btn-block" href={`/driver/progress?id=${id}`}>{v.progress ? "Continue delivery" : "Start delivery"}</a>}
      </div>
      <BottomNav active="/driver/dashboard" />
    </>
  );
}

export default function Page() {
  return <StopGate>{(v) => <Detail v={v} />}</StopGate>;
}
