import { idbAll, idbDelete, idbGet, idbPut } from "./idb";
import type { DriverRun, QueueItem } from "../types";

interface BlobRow {
  id: string;
  userId: string;
  blob: Blob;
}
interface MetaRow<T> {
  key: string;
  value: T;
}

export interface CachedIdentity {
  userId: string;
  name: string;
}
export interface CachedRun {
  userId: string;
  run: DriverRun;
}

// Everything is keyed by user id so a second driver on a shared phone never sees (or syncs) the first one's data.
export async function loadQueue(userId: string): Promise<QueueItem[]> {
  const all = await idbAll<QueueItem>("queue");
  return all.filter((i) => i.userId === userId).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id));
}
export const saveQueueItem = (item: QueueItem) => idbPut("queue", item);
export const deleteQueueItem = (id: string) => idbDelete("queue", id);

export const saveBlob = (id: string, userId: string, blob: Blob) => idbPut("blobs", { id, userId, blob } satisfies BlobRow);
export async function getBlob(id: string, userId: string): Promise<Blob | null> {
  const row = await idbGet<BlobRow>("blobs", id);
  return row && row.userId === userId ? row.blob : null;
}
export const deleteBlob = (id: string) => idbDelete("blobs", id);

async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await idbGet<MetaRow<T>>("meta", key))?.value;
}
const setMeta = <T>(key: string, value: T) => idbPut("meta", { key, value } satisfies MetaRow<T>);

export const getIdentity = () => getMeta<CachedIdentity>("identity");
export const setIdentity = (v: CachedIdentity) => setMeta("identity", v);
export const getCachedRun = () => getMeta<CachedRun>("run");
export const setCachedRun = (v: CachedRun) => setMeta("run", v);

/** On sign-out: drop what identifies people/outlets, keep unsynced records so nothing is lost. */
export async function clearSessionCache() {
  await Promise.all([idbDelete("meta", "identity"), idbDelete("meta", "run")]);
}

/** Housekeeping: synced rows are only kept briefly for the Sync screen. */
export async function pruneSynced(userId: string, olderThanMs = 2 * 24 * 3600 * 1000) {
  const cutoff = Date.now() - olderThanMs;
  for (const i of await loadQueue(userId)) {
    if (i.state === "synced" && i.syncedAt && new Date(i.syncedAt).getTime() < cutoff) await deleteQueueItem(i.id);
  }
}
