// Drains the offline queue in order. Rules:
//  - network error / 5xx / 429  -> stop, keep the item queued, try again later (never lose work)
//  - 401                         -> stop, tell the UI the session needs renewing (data stays on the phone)
//  - other 4xx                   -> the server rejected this record: mark it failed with the reason, carry on
//  - success or "duplicate"      -> synced (the id is the idempotency key, so retries are always safe)
import { deleteBlob, getBlob, loadQueue, pruneSynced, saveQueueItem } from "./store";
import type { QueueItem } from "../types";

export type SyncOutcome = "done" | "offline" | "auth" | "busy";

let running = false;
let again = false; // a sync was requested while one was running: re-scan before stopping

async function api(path: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20_000); // a hung connection counts as offline
  try {
    return await fetch(path, { ...init, signal: ctl.signal, credentials: "same-origin" });
  } finally {
    clearTimeout(t);
  }
}

async function uploadEvidence(item: QueueItem, evidenceId: string): Promise<"ok" | "offline" | "auth" | "rejected" | "missing"> {
  const blob = await getBlob(evidenceId, item.userId);
  if (!blob) return "missing";
  const res = await api(`/api/driver/evidence/${evidenceId}`, { method: "PUT", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
  if (res.ok) return "ok";
  if (res.status === 401) return "auth";
  if (res.status === 429 || res.status >= 500) return "offline";
  return "rejected";
}

async function reject(item: QueueItem, message: string) {
  await saveQueueItem({ ...item, state: "failed", lastError: message });
}

export async function syncQueue(userId: string, onChange: () => void): Promise<SyncOutcome> {
  if (running) {
    again = true;
    return "busy";
  }
  running = true;
  try {
    let outcome: SyncOutcome;
    do {
      again = false;
      outcome = await drain(userId, onChange);
    } while (again && outcome === "done");
    return outcome;
  } finally {
    running = false;
  }
}

async function drain(userId: string, onChange: () => void): Promise<SyncOutcome> {
  {
    const items = (await loadQueue(userId)).filter((i) => i.state !== "synced");
    for (const item of items) {
      if (item.state === "failed") continue; // needs an explicit retry from the Sync screen
      await saveQueueItem({ ...item, state: "syncing", attempts: item.attempts + 1 });
      onChange();
      try {
        if (item.kind === "proof") {
          const ids = [item.payload.signatureEvidenceId, ...(item.payload.photoEvidenceIds ?? [])].filter(Boolean) as string[];
          for (const id of ids) {
            const r = await uploadEvidence(item, id);
            if (r === "missing") {
              await reject(item, "Photo or signature is no longer on this device");
              throw new Error("__rejected");
            }
            if (r === "rejected") {
              await reject(item, "Evidence was rejected by the server");
              throw new Error("__rejected");
            }
            if (r === "auth") throw new Error("__auth");
            if (r === "offline") throw new Error("__offline");
          }
        }

        const body =
          item.kind === "event"
            ? { id: item.id, kind: "event", stopId: item.stopId, capturedAt: item.capturedAt, status: item.payload.status, note: item.payload.note || undefined }
            : item.kind === "proof"
              ? {
                  id: item.id, kind: "proof", stopId: item.stopId, capturedAt: item.capturedAt, receivedBy: item.payload.receivedBy,
                  note: item.payload.note || undefined, signatureEvidenceId: item.payload.signatureEvidenceId, photoEvidenceIds: item.payload.photoEvidenceIds,
                }
              : { id: item.id, kind: "exception", stopId: item.stopId, capturedAt: item.capturedAt, reason: item.payload.reason, details: item.payload.details || undefined };

        const res = await api("/api/driver/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) {
          await saveQueueItem({ ...item, state: "synced", attempts: item.attempts + 1, lastError: null, syncedAt: new Date().toISOString() });
          if (item.kind === "proof") for (const id of [item.payload.signatureEvidenceId, ...(item.payload.photoEvidenceIds ?? [])]) if (id) await deleteBlob(id);
          onChange();
          continue;
        }
        if (res.status === 401) throw new Error("__auth");
        if (res.status === 429 || res.status >= 500) throw new Error("__offline");
        const msg = (await res.json().catch(() => null))?.error ?? `Rejected (${res.status})`;
        await reject(item, String(msg));
        onChange();
      } catch (e) {
        const m = e instanceof Error ? e.message : "";
        if (m === "__rejected") {
          onChange();
          continue;
        }
        // Back to queued (not failed): the work is intact, we just could not reach the server.
        await saveQueueItem({ ...item, state: "queued", attempts: item.attempts + 1, lastError: null });
        onChange();
        return m === "__auth" ? "auth" : "offline";
      }
    }

    // Heartbeat so dispatch sees when this phone last synced and what is still waiting.
    const waiting = (await loadQueue(userId)).filter((i) => i.state === "queued" || i.state === "syncing").length;
    await api("/api/driver/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queued: waiting }) }).catch(() => undefined);
    await pruneSynced(userId);
    onChange();
    return "done";
  }
}

export async function retryFailed(userId: string) {
  for (const i of await loadQueue(userId)) if (i.state === "failed") await saveQueueItem({ ...i, state: "queued", lastError: null });
}
