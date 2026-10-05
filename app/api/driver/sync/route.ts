import { NextResponse, type NextRequest } from "next/server";
import { dbError, guardDriver } from "@/lib/security/apiGuard";
import { syncSchema } from "@/lib/driver/schemas";

// Heartbeat: tells dispatch when this driver last synced and how many records are still queued on the phone.
export async function POST(req: NextRequest) {
  const g = await guardDriver(req, { bucket: "driver.sync", limit: 60, windowSeconds: 60 });
  if (!g.ok) return g.response;

  const parsed = syncSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { error } = await g.supabase.rpc("driver_report_sync", { p_queued: parsed.data.queued });
  if (error) return dbError(error);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
