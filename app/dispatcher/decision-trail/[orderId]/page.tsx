// app/dispatcher/decision-trail/[orderId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

interface TrailEvent {
  id: string;
  actor: string;
  action: string;
  detail: string | null;
  at: string;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Colombo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function DecisionTrailPage() {
  const p = useParams() as Record<string, string>;
  const orderRef = decodeURIComponent(p.orderId ?? p.orderid ?? "");
  const [events, setEvents] = useState<TrailEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderRef) return;
    async function load() {
      const { data, error: err } = await supabase
        .from("order_events")
        .select("id, actor, action, detail, created_at")
        .eq("order_code", orderRef)
        .order("created_at", { ascending: true });
      if (err) setError(err.message);
      else setEvents((data ?? []).map((e: any) => ({ id: String(e.id), actor: e.actor, action: e.action, detail: e.detail, at: e.created_at })));
      setLoading(false);
    }
    load();
  }, [orderRef]);

  return (
    <div>
      <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", margin: "0 0 6px" }}>Decision trail · {orderRef}</h1>
      <p style={{ color: "var(--g600)", marginBottom: 16, maxWidth: 640 }}>Every allocation and deferral for this order, with who made it and why.</p>

      <div style={{ background: "var(--white)", border: "1px solid var(--g300)", borderRadius: 12, padding: 16 }}>
        {loading ? (
          <p style={{ margin: 0 }}>Loading…</p>
        ) : error ? (
          <p role="alert" style={{ margin: 0, color: "var(--red-text)" }}>Could not load the trail: {error}</p>
        ) : events.length === 0 ? (
          <p style={{ margin: 0, color: "var(--g600)" }}>No decisions have been recorded for this order yet.</p>
        ) : (
          <div style={{ borderLeft: "3px solid var(--g300)", marginLeft: 6, paddingLeft: 16 }}>
            {events.map((e) => (
              <div key={e.id} style={{ marginBottom: 16, position: "relative", fontSize: 14 }}>
                <span style={{ position: "absolute", left: -23, top: 4, width: 11, height: 11, borderRadius: "50%", background: "var(--ink)" }} />
                <b>{e.action}</b>
                <div style={{ color: "var(--g600)" }}>
                  {e.actor} · {when(e.at)}
                  {e.detail ? ` · ${e.detail}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}