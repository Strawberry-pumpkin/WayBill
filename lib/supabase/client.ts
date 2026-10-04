// lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

// Export factory function for SSR / Next.js patterns
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Export pre-instantiated singleton for direct import components
export const supabase = createClient();