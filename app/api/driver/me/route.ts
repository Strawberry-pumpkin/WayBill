import { NextResponse, type NextRequest } from "next/server";
import { guardDriver } from "@/lib/security/apiGuard";

export async function GET(req: NextRequest) {
  const g = await guardDriver(req, { bucket: "driver.me", limit: 60, windowSeconds: 60 });
  if (!g.ok) return g.response;
  const { data } = await g.supabase.from("profiles").select("name").eq("id", g.user.id).maybeSingle();
  return NextResponse.json({ userId: g.user.id, name: data?.name ?? "Driver", role: "driver" }, { headers: { "Cache-Control": "no-store" } });
}
