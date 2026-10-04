import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { guardDriver } from "@/lib/security/apiGuard";
import { EVIDENCE_TYPES, MAX_EVIDENCE_BYTES } from "@/lib/driver/types";

const BUCKET = "delivery-evidence";

function sniff(b: Uint8Array): (typeof EVIDENCE_TYPES)[number] | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

// PUT raw image bytes to /api/driver/evidence/<uuid>. Stored at <user id>/<uuid> in a private bucket;
// storage policies independently restrict the folder to the owning driver.
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardDriver(req, { bucket: "driver.evidence", limit: 60, windowSeconds: 60 });
  if (!g.ok) return g.response;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  if (Number(req.headers.get("content-length") ?? 0) > MAX_EVIDENCE_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_EVIDENCE_BYTES) return NextResponse.json({ error: "Invalid size" }, { status: 413 });

  // Trust the file's own signature, not the client-declared type.
  const type = sniff(bytes);
  if (!type) return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });

  const { error } = await g.supabase.storage.from(BUCKET).upload(`${g.user.id}/${id}`, bytes, { contentType: type, upsert: false });
  if (error) {
    const dup = /already exists|Duplicate/i.test(error.message) || (error as { statusCode?: string }).statusCode === "409";
    if (dup) return NextResponse.json({ ok: true, duplicate: true });
    console.error("evidence upload failed", error.message);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
