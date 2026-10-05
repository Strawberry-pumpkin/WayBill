/* Waybill driver service worker (scope: /driver/).
 * Goal: the driver pages open with no signal. It never touches /api/*: data lives in IndexedDB and
 * syncs through the app code, so nothing sensitive is stored by the worker (page shells hold no user data).
 */
const VERSION = "v1";
const PAGES = `drv-pages-${VERSION}`;
const ASSETS = `drv-assets-${VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("drv-") && k !== PAGES && k !== ASSETS).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// One cached shell per route, regardless of ?id=… (stop pages read the id on the client).
const pageKey = (url) => new Request(url.origin + url.pathname);

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function cacheAssetsFrom(html) {
  const cache = await caches.open(ASSETS);
  const urls = new Set(html.match(/\/_next\/static\/[^"'\\\s)<>]+/g) || []);
  await Promise.all([...urls].map(async (u) => {
    if (await cache.match(u)) return;
    try { const r = await fetch(u); if (r.ok) await cache.put(u, r); } catch (_) { /* best effort */ }
  }));
}

async function storePage(url, response) {
  // Never cache redirects (e.g. to /login when the session ended) or error pages.
  if (!response.ok || response.redirected || !(response.headers.get("content-type") || "").includes("text/html")) return;
  const copy = response.clone();
  await (await caches.open(PAGES)).put(pageKey(url), copy);
  cacheAssetsFrom(await response.clone().text()).catch(() => {});
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (req.mode === "navigate" && url.pathname.startsWith("/driver")) {
    event.respondWith(
      (async () => {
        try {
          const res = await withTimeout(fetch(req), NETWORK_TIMEOUT_MS);
          event.waitUntil(storePage(url, res.clone()));
          return res;
        } catch (_) {
          const cached = await (await caches.open(PAGES)).match(pageKey(url));
          if (cached) return cached;
          return new Response(
            "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Offline</title>" +
              "<body style='font-family:system-ui;padding:24px'><h1>You're offline</h1><p>This screen hasn't been saved on this phone yet. Your recorded work is safe and will sync when signal returns.</p><p><a href='/driver/dashboard'>Back to dashboard</a></p>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }
      })()
    );
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "precache" && Array.isArray(data.urls)) {
    event.waitUntil(
      Promise.all(data.urls.map(async (u) => {
        try {
          const url = new URL(u, self.location.origin);
          if (!url.pathname.startsWith("/driver")) return;
          await storePage(url, await fetch(url, { credentials: "same-origin" }));
        } catch (_) { /* offline right now: try again next visit */ }
      }))
    );
  }
  if (data.type === "clear") event.waitUntil(caches.delete(PAGES));
});
