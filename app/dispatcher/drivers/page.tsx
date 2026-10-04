"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

interface DriverRow {
  id: string;
  driver: string;
  vehicleId: string;
  lastSyncedMin: number;
  queuedRecords: number;
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [simulateOffline, setSimulateOffline] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from("drivers")
        .select("id, driver_name, vehicle_id, last_synced_at, queued_records")
        .order("driver_name", { ascending: true });

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const now = Date.now();
      setDrivers(
        (data ?? []).map((d: any) => ({
          id: String(d.id),
          driver: d.driver_name,
          vehicleId: d.vehicle_id,
          // Computed from the real timestamp, so this is accurate whenever
          // the page loads instead of a stored number going stale.
          lastSyncedMin: Math.max(0, Math.round((now - new Date(d.last_synced_at).getTime()) / 60000)),
          queuedRecords: d.queued_records ?? 0,
        }))
      );
      setLoading(false);
    }
    load();
  }, []);

  const activeDrivers = drivers.map((d, i) => {
    const offline = simulateOffline && i >= 2;
    return {
      ...d,
      offline,
      lastSynced: offline ? d.lastSyncedMin + 47 : d.lastSyncedMin,
      queued: offline ? d.queuedRecords + 3 : d.queuedRecords,
    };
  });

  const syncedCount = activeDrivers.filter((d) => !d.offline).length;
  const offlineCount = activeDrivers.filter((d) => d.offline).length;
  const totalQueued = activeDrivers.reduce((acc, d) => acc + d.queued, 0);

  return (
    <div style={{ maxWidth: 1180, width: "100%", margin: "0 auto", padding: 24 }}>
      <h1
        style={{
          fontSize: 32,
          lineHeight: "34px",
          fontWeight: 900,
          letterSpacing: "-0.03em",
          margin: "0 0 6px",
          color: "var(--ink, #121212)",
        }}
      >
        Driver sync
      </h1>
      <p
        style={{
          color: "var(--g600, #5A5A56)",
          fontSize: 15,
          lineHeight: "22px",
          margin: "0 0 16px",
          maxWidth: 760,
        }}
      >
        Real-time status of driver mobile synchronization. Track connected drivers, offline buffer queues, and last active timestamps.
      </p>

      {error && (
        <p role="alert" style={{ color: "var(--red-text, #b91c1c)", fontSize: 14, marginBottom: 16 }}>
          Could not load drivers: {error}
        </p>
      )}

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setSimulateOffline(!simulateOffline)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid var(--g400, #C9C9C4)",
            background: simulateOffline ? "var(--ytint, #FFF8CC)" : "var(--white, #ffffff)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            color: "var(--ink, #121212)",
          }}
        >
          {simulateOffline ? "Disable offline simulation" : "Simulate driver offline state"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-label">Synced drivers</div>
          <div className="kpi-val" style={{ color: "var(--green, #0A783C)" }}>
            {loading ? "—" : `${syncedCount} / ${drivers.length}`}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Offline drivers</div>
          <div className="kpi-val" style={{ color: offlineCount > 0 ? "var(--red, #C82323)" : "var(--ink, #121212)" }}>
            {loading ? "—" : offlineCount}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Queued records</div>
          <div className="kpi-val">{loading ? "—" : totalQueued}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Driver", "Vehicle", "Last synced", "Queued records", "State"].map((h) => (
                  <th key={h} style={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td style={td} colSpan={5}>
                    Loading drivers…
                  </td>
                </tr>
              ) : activeDrivers.length === 0 ? (
                <tr>
                  <td style={td} colSpan={5}>
                    No drivers found.
                  </td>
                </tr>
              ) : (
                activeDrivers.map((d) => (
                  <tr key={d.id} style={d.offline ? { background: "var(--ytint, #FFF8CC)" } : undefined}>
                    <td style={td}>
                      <b>{d.driver}</b>
                    </td>
                    <td style={td}>{d.vehicleId}</td>
                    <td style={td}>{d.lastSynced} min ago</td>
                    <td style={td}>{d.queued}</td>
                    <td style={td}>
                      <span className={`pill ${d.offline ? "pill-deferred" : "pill-ok"}`}>
                        <span className="dot" />
                        {d.offline ? "Offline · possibly stale" : "Synced"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .card {
          background: var(--white, #ffffff);
          border: 1px solid var(--g300, #DEDEDA);
          border-radius: 12px;
          margin-bottom: 16px;
        }

        .kpi {
          background: var(--white, #ffffff);
          border: 1px solid var(--g300, #DEDEDA);
          border-radius: 12px;
          padding: 14px;
        }

        .kpi-label {
          font-size: 13px;
          color: var(--g600, #5A5A56);
        }

        .kpi-val {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -0.02em;
          color: var(--ink, #121212);
        }

        .pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
        }

        .pill-ok {
          background: #DCFCE7;
          color: #15803D;
        }

        .pill-deferred {
          background: #FEF2F2;
          color: #B91C1C;
        }

        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
      `}</style>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "var(--g600, #5A5A56)",
  padding: "8px 12px",
  borderBottom: "1px solid var(--g300, #DEDEDA)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "11px 12px",
  borderBottom: "1px solid var(--g200, #EAEAE6)",
  fontSize: 14,
  verticalAlign: "top",
};