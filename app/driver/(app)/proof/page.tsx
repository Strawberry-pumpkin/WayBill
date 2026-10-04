"use client";
import { useEffect, useState } from "react";
import { Camera, Check } from "lucide-react";
import { OfflineBanner, StopGate, TopBar } from "@/components/driver/ui";
import { useDriver } from "@/components/driver/DriverProvider";
import SignaturePad from "@/components/driver/SignaturePad";
import { compressPhoto } from "@/lib/driver/image";
import type { StopView } from "@/lib/driver/stopState";

function Proof({ v }: { v: StopView }) {
  const { record, online } = useDriver();
  const id = encodeURIComponent(v.stop.stopId);
  const chilled = v.stop.orders.some((o) => o.temp === "chilled");
  const [receivedBy, setReceivedBy] = useState(v.stop.contactName ?? "");
  const [note, setNote] = useState("");
  const [signature, setSignature] = useState<Blob | null>(null);
  const [photos, setPhotos] = useState<(Blob | null)[]>([null, null]);
  const [previews, setPreviews] = useState<(string | null)[]>([null, null]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const labels = ["Rear dock", chilled ? "Chilled crates" : "Goods handed over"];
  const photoBlobs = photos.filter((p): p is Blob => !!p);
  const can = receivedBy.trim().length > 0 && !!signature && photoBlobs.length > 0 && !busy;

  async function pick(i: number, file: File | undefined) {
    if (!file) return;
    setErr(null);
    try {
      const blob = await compressPhoto(file);
      setPhotos((p) => p.map((x, j) => (j === i ? blob : x)));
      setPreviews((p) => p.map((x, j) => (j === i ? (x && URL.revokeObjectURL(x), URL.createObjectURL(blob)) : x)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't use that photo");
    }
  }

  async function submit() {
    if (!can || !signature) return;
    setBusy(true);
    setErr(null);
    try {
      await record({ kind: "proof", stopId: v.stop.stopId, receivedBy: receivedBy.trim(), note: note.trim() || undefined, signature, photos: photoBlobs });
      setDone(true);
    } catch {
      setErr("Couldn't save on this phone (storage may be full). Free some space and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (v.proofRecorded && !done) {
    return <><TopBar back={{ href: "/driver/dashboard", label: "Dashboard" }} title="Proof of delivery" /><div className="content"><div className="card"><span className="t-body">Proof of delivery is already recorded for this stop.</span></div></div></>;
  }
  if (!v.delivered && !done) {
    return <><TopBar back={{ href: `/driver/progress?id=${id}`, label: "Back" }} title="Proof of delivery" /><div className="content"><div className="card"><span className="t-body">Mark the stop as delivered first.</span></div><a className="btn btn-primary btn-block" href={`/driver/progress?id=${id}`}>Update progress</a></div></>;
  }

  if (done) {
    return (
      <div className="centered">
        <div className="card status-panel" style={{ padding: "var(--space-8)" }}>
          <div className="status-icon-circle" style={{ background: "var(--status-delivered-mark)", color: "var(--white)" }}><Check size={26} aria-hidden /></div>
          <h1 className="t-title">Delivery confirmed</h1>
          <span className="t-body t-secondary">Proof of delivery for {v.stop.outletId}, received by {receivedBy.trim()}, has been recorded{online ? "" : " and will sync once you're back in range"}.</span>
          <a className="btn btn-primary btn-block" href="/driver/dashboard">Back to dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <>
      <TopBar back={{ href: `/driver/progress?id=${id}`, label: "Back" }} title="Proof of delivery" />
      <OfflineBanner />
      <div className="content">
        <span className="t-title">Confirm delivery</span>
        <div className="field">
          <label htmlFor="rb">Received by (store staff name)</label>
          <input id="rb" type="text" maxLength={120} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} autoComplete="off" />
        </div>
        <SignaturePad label="Signature" onChange={setSignature} />
        <div className="stack">
          <span className="t-label t-secondary">Photo evidence (at least one)</span>
          <div className="photo-grid">
            {labels.map((label, i) => (
              <label key={label} className={`photo-tile${photos[i] ? " filled" : ""}`}>
                {previews[i] && (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob preview, nothing to optimise
                  <img src={previews[i]!} alt={`${label} photo`} />
                )}
                {!previews[i] && <Camera size={24} aria-hidden />}
                <span className="t-label cap" style={{ fontSize: 12 }}>{photos[i] ? `${label} — captured` : label}</span>
                <input className="sr-only" type="file" accept="image/*" capture="environment" onChange={(e) => { void pick(i, e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="pn">Notes (optional)</label>
          <textarea id="pn" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything dispatch should know…" />
        </div>
        {err && <div className="error-note t-body" role="alert">{err}</div>}
        <button type="button" className="btn btn-primary btn-block" disabled={!can} onClick={submit}>Confirm delivery</button>
        {!can && <span className="t-caption t-secondary">Needs a name, a signature and at least one photo.</span>}
      </div>
    </>
  );
}

export default function Page() {
  return <StopGate>{(v) => <Proof v={v} />}</StopGate>;
}
