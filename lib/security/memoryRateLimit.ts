// Per-instance sliding-window limiter, used by proxy.ts as a cheap first line of defence
// (per IP, before any database work). Authenticated per-user limits live in Postgres
// (public.rate_limit_hit) so they hold across serverless instances.

const hits = new Map<string, number[]>();
let lastSweep = 0;

export function memoryRateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs * 2) hits.delete(k);
  }
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false as const, retryAfter: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true as const, retryAfter: 0 };
}
