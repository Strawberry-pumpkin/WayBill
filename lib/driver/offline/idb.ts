// Minimal promise wrapper over IndexedDB. Three stores:
//   queue — records waiting to sync (and recently synced, for the Sync screen)
//   blobs — signature / photo bytes for queued proofs
//   meta  — cached run + identity so the app opens with no signal
const DB_NAME = "waybill-driver";
const DB_VERSION = 1;
export type StoreName = "queue" | "blobs" | "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("queue", { keyPath: "id" }).createIndex("userId", "userId");
        db.createObjectStore("blobs", { keyPath: "id" });
        db.createObjectStore("meta", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const idbGet = <T>(store: StoreName, key: string) => run<T | undefined>(store, "readonly", (s) => s.get(key));
export const idbAll = <T>(store: StoreName) => run<T[]>(store, "readonly", (s) => s.getAll());
export const idbPut = (store: StoreName, value: unknown) => run(store, "readwrite", (s) => s.put(value));
export const idbDelete = (store: StoreName, key: string) => run(store, "readwrite", (s) => s.delete(key));
