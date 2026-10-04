// Shapes shared by the driver API, the offline queue and the screens.

export const EXCEPTION_REASONS = [
  { key: "outlet_not_ready", label: "Outlet not ready to receive", hint: "Staff or space not available" },
  { key: "access_blocked", label: "Access blocked — window closed", hint: "Shutter down, mall bay closed" },
  { key: "item_damaged", label: "Item damaged", hint: "Goods unfit to hand over" },
  { key: "temperature_exception", label: "Temperature exception on chilled goods", hint: "Cold chain broken" },
  { key: "other", label: "Other", hint: "Describe it below" },
] as const;
export type ExceptionReason = (typeof EXCEPTION_REASONS)[number]["key"];

export type ProgressStatus = "out_for_delivery" | "arrived" | "delivered";
export const PROGRESS_ORDER: ProgressStatus[] = ["out_for_delivery", "arrived", "delivered"];

export type StopStatus = "onplan" | "late" | "delivered" | "exception";

export interface StopOrder {
  orderId: string;
  code: string;
  temp: "chilled" | "ambient";
  kg: number;
  m3: number;
  units: number | null;
}

/** One stop = one outlet on one trip. A Fresh outlet can have a dry and a chilled order on it. */
export interface DriverStop {
  stopId: string; // `${vehicleId}|${tripId}|${outletId}` — opaque to the client, re-validated by the server
  tripId: number;
  seq: number;
  outletId: string;
  outletName: string;
  brand: string;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  lat: number | null;
  lng: number | null;
  dock: "street" | "rear_dock" | "mall_bay" | "side_bay" | string;
  windowLabel: string; // e.g. "06:00–07:30" or the mall window
  windowClose: string | null; // HH:MM
  eta: string | null; // HH:MM, from the dispatcher's plan
  skippedLastRun: boolean;
  daysSinceServed: number | null;
  vanOnly: boolean;
  orders: StopOrder[];
  /** What the server already holds for this stop (so a fresh phone shows the true state). */
  serverStatus: ProgressStatus | null;
  serverProof: boolean;
  serverException: boolean;
}

export interface DriverRun {
  driver: { id: string; name: string };
  vehicle: { id: string; type: string; temp: string; depot: string | null };
  district: string | null;
  brand: string | null;
  tripIds: number[];
  /** Filled by the loader module. null until that module exists. */
  release: { releasedAt: string | null } | null;
  stops: DriverStop[];
  fetchedAt: string;
}

export type QueueKind = "event" | "proof" | "exception";
export type QueueState = "queued" | "syncing" | "synced" | "failed";

export interface QueueItem {
  id: string; // client-generated uuid; also the server idempotency key
  userId: string;
  kind: QueueKind;
  stopId: string;
  outletId: string;
  outletName: string;
  capturedAt: string; // ISO; the real time of the action, never the upload time
  state: QueueState;
  attempts: number;
  lastError: string | null;
  syncedAt: string | null;
  payload: {
    status?: ProgressStatus;
    receivedBy?: string;
    note?: string;
    reason?: ExceptionReason;
    details?: string;
    signatureEvidenceId?: string;
    photoEvidenceIds?: string[];
  };
}

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
