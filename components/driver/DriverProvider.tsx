"use client";
// Client state for the whole driver app: identity, the run (network or cached), the offline queue and sync.
// Security note: the checks here are UX only. Every request is re-authorised by proxy.ts, the route
// handlers (guardDriver) and Postgres RLS; nothing in this file is trusted by the server.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DriverRun, ProgressStatus, QueueItem, ExceptionReason } from "@/lib/driver/types";
import { clearSessionCache, getCachedRun, getIdentity, loadQueue, saveBlob, saveQueueItem, setCachedRun, setIdentity } from "@/lib/driver/offline/store";
import { retryFailed as retryFailedItems, syncQueue } from "@/lib/driver/offline/sync";
import { deriveStop, type StopView } from "@/lib/driver/stopState";
import { nowHHMM } from "@/lib/driver/format";

type Phase = "loading" | "ready" | "unauth" | "forbidden";

export type NewRecord =
  | { kind: "event"; stopId: string; status: ProgressStatus; note?: string }
  | { kind: "exception"; stopId: string; reason: ExceptionReason; details?: string }
  | { kind: "proof"; stopId: string; receivedBy: string; note?: string; signature: Blob; photos: Blob[] };

interface DriverCtx {
  phase: Phase;
  identity: { userId: string; name: string } | null;
  run: DriverRun | null;
  runError: string | null;
  fromCache: boolean;
  online: boolean;
  syncing: boolean;
  authExpired: boolean;
  queue: QueueItem[];
  views: StopView[];
  pending: number;
  refreshRun: () => Promise<void>;
  syncNow: () => Promise<void>;
  retryFailed: () => Promise<void>;
  record: (r: NewRecord) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<DriverCtx | null>(null);
export const useDriver = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDriver outside DriverProvider");
  return c;
};

const PRECACHE = ["/driver/dashboard", "/driver/stop", "/driver/progress", "/driver/proof", "/driver/exception", "/driver/exception-logged", "/driver/route", "/driver/sync", "/driver/profile", "/driver/signed-out"];

async function timedFetch(path: string, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(path, { cache: "no-store", credentials: "same-origin", signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

export default function DriverProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [identity, setIdent] = useState<DriverCtx["identity"]>(null);
  const [run, setRun] = useState<DriverRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [tick, setTick] = useState(0);
  const userId = useRef<string | null>(null);

  const reloadQueue = useCallback(async () => {
    if (userId.current) setQueue(await loadQueue(userId.current));
  }, []);

  const refreshRun = useCallback(async () => {
    try {
      const res = await timedFetch("/api/driver/run");
      if (res.status === 401) return setAuthExpired(true);
      if (!res.ok) throw new Error(String(res.status));
      const { run: fresh } = (await res.json()) as { run: DriverRun | null };
      setOnline(true);
      setFromCache(false);
      setRunError(null);
      setRun(fresh);
      if (fresh && userId.current) await setCachedRun({ userId: userId.current, run: fresh });
    } catch {
      setOnline(false);
      setRunError("Can't reach the server. Showing the last saved run.");
    }
  }, []);

  const syncNow = useCallback(async () => {
    const uid = userId.current;
    if (!uid) return;
    setSyncing(true);
    try {
      // Refresh the access token first if it lapsed while offline.
      await createClient().auth.getSession().catch(() => undefined);
      const outcome = await syncQueue(uid, () => void reloadQueue());
      if (outcome === "offline") setOnline(false);
      if (outcome === "auth") setAuthExpired(true);
      if (outcome === "done") {
        setOnline(true);
        setAuthExpired(false);
        await refreshRun();
      }
    } finally {
      setSyncing(false);
      await reloadQueue();
    }
  }, [refreshRun, reloadQueue]);

  // ---- boot
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      const sessionUser = data.session?.user.id ?? null;
      const cached = await getIdentity().catch(() => undefined);

      let ident: DriverCtx["identity"] = null;
      try {
        const res = await timedFetch("/api/driver/me");
        if (res.status === 401) return !cancelled && (setPhase("unauth"), window.location.replace("/login"));
        if (res.status === 403) return !cancelled && setPhase("forbidden");
        if (!res.ok) throw new Error(String(res.status));
        const me = (await res.json()) as { userId: string; name: string };
        ident = { userId: me.userId, name: me.name };
        await setIdentity(ident);
      } catch {
        // No signal: continue as the cached driver, but only if it is the same person that is signed in here.
        if (cached && (!sessionUser || cached.userId === sessionUser)) {
          ident = cached;
          setOnline(false);
        }
      }
      if (cancelled) return;
      if (!ident) {
        setPhase("unauth");
        window.location.replace("/login");
        return;
      }

      userId.current = ident.userId;
      setIdent(ident);
      const [q, cachedRun] = await Promise.all([loadQueue(ident.userId), getCachedRun().catch(() => undefined)]);
      if (cancelled) return;
      setQueue(q);
      if (cachedRun && cachedRun.userId === ident.userId) {
        setRun(cachedRun.run);
        setFromCache(true);
      }
      setPhase("ready");

      void refreshRun().then(() => syncNow());

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .register("/driver-sw.js", { scope: "/driver/" })
          .then(() => navigator.serviceWorker.ready)
          .then((reg) => reg.active?.postMessage({ type: "precache", urls: PRECACHE }))
          .catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- connectivity + periodic retry
  useEffect(() => {
    if (phase !== "ready") return;
    const on = () => {
      setOnline(true);
      void syncNow();
    };
    const off = () => setOnline(false);
    const vis = () => document.visibilityState === "visible" && void syncNow();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", vis);
    const t = setInterval(() => {
      setTick((n) => n + 1);
      void syncNow();
    }, 30_000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", vis);
      clearInterval(t);
    };
  }, [phase, syncNow]);

  const record = useCallback(
    async (r: NewRecord) => {
      const uid = userId.current;
      if (!uid) throw new Error("Not signed in");
      const stop = run?.stops.find((s) => s.stopId === r.stopId);
      if (!stop) throw new Error("Unknown stop");
      const id = crypto.randomUUID();
      const item: QueueItem = {
        id, userId: uid, kind: r.kind, stopId: r.stopId, outletId: stop.outletId, outletName: stop.outletName,
        capturedAt: new Date().toISOString(), state: "queued", attempts: 0, lastError: null, syncedAt: null, payload: {},
      };
      if (r.kind === "event") item.payload = { status: r.status, note: r.note };
      if (r.kind === "exception") item.payload = { reason: r.reason, details: r.details };
      if (r.kind === "proof") {
        const signatureEvidenceId = crypto.randomUUID();
        const photoEvidenceIds = r.photos.map(() => crypto.randomUUID());
        // Bytes first, then the record: a record must never reference evidence that was not stored.
        await saveBlob(signatureEvidenceId, uid, r.signature);
        await Promise.all(r.photos.map((p, i) => saveBlob(photoEvidenceIds[i], uid, p)));
        item.payload = { receivedBy: r.receivedBy, note: r.note, signatureEvidenceId, photoEvidenceIds };
      }
      await saveQueueItem(item);
      await reloadQueue();
      void syncNow();
    },
    [run, reloadQueue, syncNow]
  );

  const retryFailed = useCallback(async () => {
    if (userId.current) await retryFailedItems(userId.current);
    await reloadQueue();
    void syncNow();
  }, [reloadQueue, syncNow]);

  const signOut = useCallback(async () => {
    const { error } = await createClient().auth.signOut();
    if (error) {
      // Could not reach Supabase: still end the session on this device.
      document.cookie.split(";").map((c) => c.split("=")[0].trim()).filter((n) => n.startsWith("sb-"))
        .forEach((n) => (document.cookie = `${n}=; Max-Age=0; path=/`));
    }
    await clearSessionCache();
    navigator.serviceWorker?.controller?.postMessage({ type: "clear" });
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load: resets all in-memory state
    window.location.assign("/driver/signed-out");
  }, []);

  // `tick` re-derives "late" as time passes.
  const views = useMemo(() => (run ? run.stops.map((s) => deriveStop(s, queue, nowHHMM())) : []), [run, queue, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = queue.filter((q) => q.state === "queued" || q.state === "syncing").length;

  const value: DriverCtx = { phase, identity, run, runError, fromCache, online, syncing, authExpired, queue, views, pending, refreshRun, syncNow, retryFailed, record, signOut };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
