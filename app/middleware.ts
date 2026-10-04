// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  let response = NextResponse.next({
    request: { headers: req.headers },
  });

  // Supabase Auth SSR Client එක සාදා ගැනීම
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Active Session එක check කිරීම
  const { data: { user } } = await supabase.auth.getUser();

  const isProtectedPath = req.nextUrl.pathname.startsWith("/dispatcher") ||
                          req.nextUrl.pathname.startsWith("/driver") ||
                          req.nextUrl.pathname.startsWith("/outlet");

  // User log වී නැත්නම් Login එකට redirect කරන්න
  if (isProtectedPath && !user) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/dispatcher/:path*",
    "/driver/:path*",
    "/outlet/:path*",
    "/admin/:path*",
  ],
};