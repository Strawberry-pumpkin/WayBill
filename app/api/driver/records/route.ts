import { NextResponse, type NextRequest } from "next/server";
import { dbError, guardDriver } from "@/lib/security/apiGuard";
import { parseStopId, recordSchema } from "@/lib/driver/schemas";

const MAX_BODY = 16 * 1024;

// Idempotent: replaying the same record id (a retried sync) returns { duplicate: true }.
export async function POST(req: NextRequest) {
  const g = await guardDriver(req, { bucket: "driver.records", limit: 120, windowSeconds: 60 });
  if (!g.ok) return g.response;

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = recordSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid record" }, { status: 400 });

  const r = parsed.data;
  const { vehicleId, tripId, outletId } = parseStopId(r.stopId);
  const uid = g.user.id;

  const payload: Record<string, unknown> = {
    id: r.id,
    kind: r.kind,
    vehicle_id: vehicleId,
    trip_id: tripId,
    outlet_id: outletId,
    captured_at: r.capturedAt,
  };
  if (r.kind === "event") Object.assign(payload, { status: r.status, note: r.note ?? null });
  if (r.kind === "proof") {
    Object.assign(payload, {
      received_by: r.receivedBy,
      note: r.note ?? null,
      // Paths are built here from the verified user id; the client can only name evidence ids.
      signature_path: `${uid}/${r.signatureEvidenceId}`,
      photo_paths: r.photoEvidenceIds.map((id) => `${uid}/${id}`),
    });
  }
  if (r.kind === "exception") Object.assign(payload, { reason: r.reason, details: r.details ?? null });

  const { data, error } = await g.supabase.rpc("driver_submit_record", { p_record: payload });
  if (error) return dbError(error);
  return NextResponse.json(data ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
}
