// Runs before every protected route. Authentication only: it refreshes the Supabase session cookie
// and rejects anonymous callers. Role and ownership are enforced again in each route handler
// (lib/security/apiGuard.ts) and, last, by Postgres Row Level Security.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { memoryRateLimit } from "@/lib/security/memoryRateLimit";

const PROTECTED = ["/dispatcher", "/driver", "/store", "/loader", "/outlet", "/admin", "/api/dispatcher", "/api/driver"];
const PUBLIC_EXCEPTIONS = ["/driver/signed-out", "/driver-sw.js"];

const isApi = (p: string) => p.startsWith("/api/");
const matches = (p: string, prefix: string) => p === prefix || p.startsWith(prefix + "/");

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // HTTPS only in production (TLS is terminated by the platform; it tells us via x-forwarded-proto).
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(req.nextUrl.hostname);
  if (process.env.NODE_ENV === "production" && !local && req.headers.get("x-forwarded-proto") === "http") {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  if (!PROTECTED.some((p) => matches(pathname, p)) || PUBLIC_EXCEPTIONS.includes(pathname)) return NextResponse.next();

  if (isApi(pathname)) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = memoryRateLimit(`ip:${ip}`, 240, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Fail closed: without Supabase nobody can be authenticated.
    return isApi(pathname)
      ? NextResponse.json({ error: "Service unavailable" }, { status: 503 })
      : new NextResponse("Service unavailable: Supabase is not configured.", { status: 503 });
  }

  let response = NextResponse.next({ request: req });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() validates the token with Supabase Auth; never trust getSession() on the server.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (isApi(pathname)) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    const redirect = NextResponse.redirect(login);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/dispatcher/:path*", "/driver/:path*", "/store/:path*", "/loader/:path*", "/outlet/:path*", "/admin/:path*", "/api/dispatcher/:path*", "/api/driver/:path*"],
};
