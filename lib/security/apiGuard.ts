// Every /api/driver/* handler goes through guardDriver(). Order of checks (cheapest first, fail closed):
//   1. same-origin check on state-changing requests (CSRF; cookies are SameSite=Lax as well)
//   2. authenticated session, validated with Supabase Auth (not just decoded)
//   3. profiles.role === 'driver' (read through RLS as the user)
//   4. per-user rate limit in Postgres
// Ownership of individual stops is enforced inside the SECURITY DEFINER SQL functions.
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export interface GuardOptions {
  /** Bucket name for the rate limiter, e.g. "driver.run". */
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export type Guard =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; response: NextResponse };

const deny = (status: number, error: string, headers?: Record<string, string>) =>
  ({ ok: false, response: NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } }) }) as const;

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false; // browsers always send Origin on fetch POST/PUT; absent means not our client
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function guardDriver(req: NextRequest, opts: GuardOptions): Promise<Guard> {
  if (!["GET", "HEAD"].includes(req.method) && !sameOrigin(req)) return deny(403, "Forbidden");

  let supabase: SupabaseClient;
  try {
    supabase = await createServerSupabase();
  } catch {
    return deny(503, "Service unavailable");
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return deny(401, "Not signed in");

  const { data: profile, error: roleErr } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (roleErr) return deny(503, "Service unavailable");
  if (profile?.role !== "driver") return deny(403, "Forbidden");

  const { data: allowed, error: rlErr } = await supabase.rpc("rate_limit_hit", {
    p_bucket: opts.bucket,
    p_limit: opts.limit,
    p_window_seconds: opts.windowSeconds,
  });
  if (rlErr) return deny(503, "Service unavailable");
  if (allowed !== true) return deny(429, "Too many requests", { "Retry-After": String(opts.windowSeconds) });

  return { ok: true, supabase, user };
}

/** Maps a Postgres/PostgREST error from our SQL functions to a safe HTTP response (no internals leaked). */
export function dbError(error: { code?: string; message?: string }) {
  if (error.code === "42501") return deny(403, "Forbidden").response;
  if (error.code === "P0002" || error.code === "22023") return NextResponse.json({ error: error.message ?? "Rejected" }, { status: 422 });
  if (error.code === "23505") return NextResponse.json({ error: "Conflict" }, { status: 409 });
  console.error("driver api db error", error.code, error.message);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
