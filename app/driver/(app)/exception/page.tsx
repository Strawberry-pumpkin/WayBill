"use client";
import { useState } from "react";
import { OfflineBanner, StopGate, TopBar } from "@/components/driver/ui";
import { useDriver } from "@/components/driver/DriverProvider";
import { EXCEPTION_REASONS, type ExceptionReason } from "@/lib/driver/types";
import type { StopView } from "@/lib/driver/stopState";

function Report({ v }: { v: StopView }) {
  const { record } = useDriver();
  const id = encodeURIComponent(v.stop.stopId);
  const [reason, setReason] = useState<ExceptionReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (v.proofRecorded) {
    return <><TopBar back={{ href: "/driver/dashboard", label: "Dashboard" }} title="Report an exception" /><div className="content"><div className="card"><span className="t-body">This stop is already delivered, so it can&apos;t be flagged.</span></div></div></>;
  }

  async function submit() {
    if (!reason || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await record({ kind: "exception", stopId: v.stop.stopId, reason, details: details.trim() || undefined });
      // Full document load on purpose: every driver screen is a cached page shell so it also opens offline.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/driver/exception-logged?id=${id}`);
    } catch {
      setErr("Couldn't save on this phone. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar back={{ href: `/driver/stop?id=${id}`, label: "Back" }} title="Report an exception" />
      <OfflineBanner />
      <div className="content">
        <div className="card"><div><span className="t-ui">{v.stop.outletName}</span><br /><span className="t-caption t-secondary">{v.stop.outletId} · Stop {v.stop.seq}</span></div></div>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="t-label t-secondary" style={{ marginBottom: 8 }}>What&apos;s stopping this delivery?</legend>
          {EXCEPTION_REASONS.map((r) => (
            <label key={r.key} className={`radio-option${reason === r.key ? " selected" : ""}`} style={{ cursor: "pointer", minHeight: 56 }}>
              <input className="sr-only" type="radio" name="reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} />
              <span className="ring" aria-hidden />
              <span><span className="t-ui">{r.label}</span><br /><span className="t-caption t-secondary">{r.hint}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="d">Add details (optional)</label>
          <textarea id="d" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. Shutter down, no staff on site…" />
        </div>
        {err && <div className="error-note t-body" role="alert">{err}</div>}
        <button type="button" className="btn btn-primary btn-block" disabled={!reason || busy} onClick={submit}>Log exception</button>
        {!reason && <span className="t-caption t-secondary">Choose a reason to continue.</span>}
        <div className="card stack">
          <span className="t-label t-secondary">What happens next</span>
          <span className="t-body t-secondary">This flags the stop as an exception for dispatch to review — it doesn&apos;t defer it yourself. Your reason becomes the record.</span>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <StopGate>{(v) => <Report v={v} />}</StopGate>;
}
