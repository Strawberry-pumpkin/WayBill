"use client";
import { Check, CloudOff, Loader2, TriangleAlert } from "lucide-react";
import { useDriver } from "@/components/driver/DriverProvider";
import { BottomNav, Gate, OfflineBanner, TopBar } from "@/components/driver/ui";
import { hhmm } from "@/lib/driver/format";
import type { QueueItem } from "@/lib/driver/types";

const KIND = { event: "Progress update", proof: "Proof of delivery", exception: "Exception report" } as const;
const EVENT = { out_for_delivery: "Out for delivery", arrived: "Arrived", delivered: "Delivered" } as const;

function Row({ i }: { i: QueueItem }) {
  const label = i.kind === "event" && i.payload.status ? `${KIND.event} · ${EVENT[i.payload.status]}` : KIND[i.kind];
  const icon = i.state === "synced" ? <Check size={20} aria-hidden /> : i.state === "syncing" ? <Loader2 size={20} className="spin" aria-hidden /> : i.state === "failed" ? <TriangleAlert size={20} aria-hidden /> : <CloudOff size={20} aria-hidden />;
  const text = i.state === "synced" ? `Synced ${i.syncedAt ? hhmm(i.syncedAt) : ""}` : i.state === "syncing" ? "Syncing…" : i.state === "failed" ? "Rejected" : "Waiting";
  return (
    <li className="card sync-item" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, listStyle: "none" }}>
      {icon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="t-ui">{label}</span><br />
        <span className="t-caption t-secondary">{i.outletId} · {i.outletName} · captured {hhmm(i.capturedAt)}</span>
        {i.lastError && <><br /><span className="t-caption" style={{ color: "var(--red-text)" }}>{i.lastError}</span></>}
      </div>
      <span className="t-label">{text}</span>
    </li>
  );
}

function Sync() {
  const { queue, pending, online, syncing, syncNow, retryFailed } = useDriver();
  const failed = queue.filter((q) => q.state === "failed").length;
  const synced = queue.filter((q) => q.state === "synced").length;
  const allDone = pending === 0 && failed === 0;
  const items = [...queue].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));

  return (
    <>
      <TopBar title="Sync status" right={<span />} />
      <OfflineBanner />
      <div className="content">
        <div className="stack">
          <h1 className="t-title">Sync status</h1>
          <span className="t-body t-secondary">Every update you capture is saved on this phone first, then uploaded the moment a signal is available.</span>
        </div>
        <div className={`card sync-summary ${allDone ? "done" : "pending"}`} role="status" style={{ padding: 16 }}>
          <span className="t-ui">
            {allDone
              ? synced > 0 ? `All caught up — ${synced} of ${synced} records synced.` : "Nothing waiting. New records appear here."
              : `${pending} saved on this phone — nothing is lost.${failed ? ` ${failed} rejected.` : ""}`}
          </span>
        </div>
        <div className="row-between" style={{ gap: 12 }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => void syncNow()} disabled={syncing || !online}>{syncing ? "Syncing…" : online ? "Sync now" : "Offline"}</button>
          {failed > 0 && <button type="button" className="btn btn-ghost" onClick={() => void retryFailed()}>Retry rejected</button>}
        </div>
        <ul style={{ padding: 0, margin: 0 }}>{items.map((i) => <Row key={i.id} i={i} />)}</ul>
      </div>
      <BottomNav active="/driver/sync" />
    </>
  );
}

export default function Page() {
  return <Gate needRun={false}><Sync /></Gate>;
}
