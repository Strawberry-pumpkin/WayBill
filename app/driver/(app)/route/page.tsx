"use client";
import { Check, Navigation } from "lucide-react";
import { useDriver } from "@/components/driver/DriverProvider";
import { BottomNav, Gate, OfflineBanner, StatusChip, TopBar } from "@/components/driver/ui";
import { currentTripId } from "@/lib/driver/stopState";
import { dockLabel } from "@/lib/driver/format";

function Route() {
  const { run, views } = useDriver();
  const trip = currentTripId(run!, views);
  const current = views.find((v) => v.stop.tripId === trip && (v.status === "onplan" || v.status === "late"));
  const trips = run!.tripIds.length ? run!.tripIds : [trip];
  const dest = current?.stop;
  const maps = dest?.lat != null && dest.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}` : dest?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest.address)}` : null;

  return (
    <>
      <TopBar title={`Trip ${trip} of ${trips.length}`} />
      <OfflineBanner />
      <div className="content">
        <div className="card row-between">
          <span className="t-caption t-secondary">{views.filter((v) => v.stop.tripId === trip).length} stops · {run!.vehicle.id}</span>
          {maps && <a className="btn btn-secondary" style={{ height: 44 }} href={maps} target="_blank" rel="noopener noreferrer"><Navigation size={16} aria-hidden />Next stop</a>}
        </div>
        {trips.map((t) => (
          <section key={t} className="stack">
            <h2 className="t-section">Trip {t} · stop sequence</h2>
            <p className="t-caption t-secondary" style={{ margin: 0 }}>Read-only: the truck was loaded for this order. Dispatch changes the sequence.</p>
            <div>
              {views.filter((v) => v.stop.tripId === t).sort((a, b) => a.stop.seq - b.stop.seq).map((v) => {
                const isCurrent = current?.stop.stopId === v.stop.stopId;
                return (
                  <a key={v.stop.stopId} className="card delivery-card" href={`/driver/stop?id=${encodeURIComponent(v.stop.stopId)}`} aria-current={isCurrent ? "step" : undefined} style={isCurrent ? { borderColor: "var(--ink)", borderWidth: 2 } : undefined}>
                    <div className={`route-num${v.status === "delivered" ? " done" : isCurrent ? " current" : ""}`}>{v.status === "delivered" ? <Check size={14} aria-hidden /> : v.stop.seq}</div>
                    <div className="info-col"><span className="t-ui name">{v.stop.outletName}</span><span className="t-caption t-secondary">{v.stop.outletId} · {dockLabel(v.stop.dock, v.stop.windowLabel)}</span></div>
                    <div className="trailing"><span className="t-data t-secondary">{v.stop.eta ?? "—"}</span><StatusChip status={v.status} /></div>
                  </a>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <BottomNav active="/driver/route" />
    </>
  );
}

export default function Page() {
  return <Gate><Route /></Gate>;
}
