import { NextResponse, type NextRequest } from "next/server";
import { dbError, guardDriver } from "@/lib/security/apiGuard";
import type { DriverRun } from "@/lib/driver/types";

// The caller's own run only: public.driver_run() resolves the vehicle from auth.uid(),
// so there is no id in the request that could be tampered with.
export async function GET(req: NextRequest) {
  const g = await guardDriver(req, { bucket: "driver.run", limit: 60, windowSeconds: 60 });
  if (!g.ok) return g.response;

  const { data, error } = await g.supabase.rpc("driver_run");
  if (error) return dbError(error);

  const run = data ? ({ ...(data as Omit<DriverRun, "fetchedAt">), fetchedAt: new Date().toISOString() } as DriverRun) : null;
  return NextResponse.json({ run }, { headers: { "Cache-Control": "no-store" } });
}
