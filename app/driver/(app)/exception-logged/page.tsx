"use client";
import { Flag } from "lucide-react";
import { StopGate } from "@/components/driver/ui";

export default function Page() {
  return (
    <StopGate>
      {(v) => (
        <div className="centered">
          <div className="card status-panel" style={{ padding: "var(--space-8)" }}>
            <div className="status-icon-circle"><Flag size={26} aria-hidden /></div>
            <h1 className="t-title">Exception logged</h1>
            <span className="t-body t-secondary">{v.stop.outletId} has been flagged and time-stamped. Dispatch reviews it and decides the next run — the reason travels with it.</span>
            <a className="btn btn-primary btn-block" href="/driver/dashboard">Back to dashboard</a>
          </div>
        </div>
      )}
    </StopGate>
  );
}
