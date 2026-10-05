"use client";
import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { OfflineBanner, StopGate, TopBar } from "@/components/driver/ui";
import { useDriver } from "@/components/driver/DriverProvider";
import { hhmm } from "@/lib/driver/format";
import type { StopView } from "@/lib/driver/stopState";
import type { ProgressStatus } from "@/lib/driver/types";

const NEXT: Record<string, { to: ProgressStatus; label: string }> = {
  none: { to: "out_for_delivery", label: "Start delivery" },
  out_for_delivery: { to: "arrived", label: "Mark as arrived" },
  arrived: { to: "delivered", label: "Mark as delivered" },
};

function Progress({ v }: { v: StopView }) {
  const { record, run } = useDriver();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = encodeURIComponent(v.stop.stopId);
  const idx = v.progress === null ? 0 : v.progress === "out_for_delivery" ? 1 : v.progress === "arrived" ? 2 : 3;
  const labels = ["Out for delivery", "Arrived at dock", "Delivered", "Proof of delivery"];
  const released = !!run?.release?.releasedAt;
  const next = NEXT[v.progress ?? "none"];

  async function advance() {
    if (!next || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await record({ kind: "event", stopId: v.stop.stopId, status: next.to, note: note.trim() || undefined });
      setNote("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save on this phone. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (v.exception || v.proofRecorded) {
    return (
      <>
        <TopBar back={{ href: `/driver/stop?id=${id}`, label: "Back" }} title="Update progress" />
        <div className="content"><div className="card"><span className="t-body">This stop is {v.proofRecorded ? "complete" : "flagged for dispatch"}; no more progress to record.</span></div><a className="btn btn-primary btn-block" href="/driver/dashboard">Back to dashboard</a></div>
      </>
    );
  }

  return (
    <>
      <TopBar back={{ href: `/driver/stop?id=${id}`, label: "Back" }} title="Update progress" />
      <OfflineBanner />
      <div className="content">
        <div className="card"><div><span className="t-ui">{v.stop.outletName}</span><br /><span className="t-caption t-secondary">{v.stop.outletId}{v.stop.contactName ? ` · Contact: ${v.stop.contactName}` : ""}</span></div></div>

        <div className="card stack">
          <span className="t-label t-secondary">Delivery status</span>
          <div className="timeline">
            <div className="timeline-step">
              <div className="rail"><div className={`dot ${released ? "dot-done" : "dot-upcoming"}`}>{released && <Check size={14} aria-hidden />}</div><div className="line" /></div>
              <div className="body"><span className="t-label">Loaded at depot</span><span className="t-caption t-secondary">{released ? "Released by loader" : "Not confirmed by the loader yet"}</span></div>
            </div>
            {labels.map((label, i) => {
              const state = i < idx ? "done" : i === idx ? "current" : "upcoming";
              const time = [v.times.out_for_delivery, v.times.arrived, v.times.delivered, v.times.proof][i];
              return (
                <div className="timeline-step" key={label}>
                  <div className="rail"><div className={`dot dot-${state}`}>{state === "done" && <Check size={14} aria-hidden />}</div>{i < labels.length - 1 && <div className="line" />}</div>
                  <div className="body"><span className="t-label">{label}</span>{time && <span className="t-caption t-secondary">Captured {hhmm(time)}</span>}</div>
                </div>
              );
            })}
          </div>
        </div>

        {next && (
          <div className="field">
            <label htmlFor="note">Delivery notes (optional)</label>
            <textarea id="note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Left with security…" />
          </div>
        )}
        {err && <div className="error-note t-body" role="alert">{err}</div>}

        {next ? (
          <>
            <button type="button" className="btn btn-primary btn-block" onClick={advance} disabled={busy}>{next.label}</button>
            <a className="back-row" href={`/driver/exception?id=${id}`}><AlertTriangle size={16} aria-hidden />Can&apos;t complete this stop</a>
          </>
        ) : (
          <a className="btn btn-primary btn-block" href={`/driver/proof?id=${id}`}>Continue to proof of delivery</a>
        )}
      </div>
    </>
  );
}

export default function Page() {
  return <StopGate>{(v) => <Progress v={v} />}</StopGate>;
}
