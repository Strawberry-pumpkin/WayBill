import { PROGRESS_ORDER, type DriverRun, type DriverStop, type ProgressStatus, type QueueItem, type StopStatus } from "./types";

export interface StopView {
  stop: DriverStop;
  progress: ProgressStatus | null;
  delivered: boolean;
  proofRecorded: boolean;
  exception: boolean;
  status: StopStatus;
  times: Partial<Record<ProgressStatus | "exception" | "proof", string>>; // captured times known on this phone
  pendingSync: boolean;
}

const rank = (s: ProgressStatus | null) => (s ? PROGRESS_ORDER.indexOf(s) : -1);

/** Overlay what is queued on this phone on top of what the server already knows. */
export function deriveStop(stop: DriverStop, queue: QueueItem[], nowHHMM: string): StopView {
  const mine = queue.filter((q) => q.stopId === stop.stopId);
  let progress = stop.serverStatus;
  let proofRecorded = stop.serverProof;
  let exception = stop.serverException;
  const times: StopView["times"] = {};

  for (const q of mine) {
    if (q.kind === "event" && q.payload.status) {
      if (rank(q.payload.status) > rank(progress)) progress = q.payload.status;
      times[q.payload.status] = q.capturedAt;
    }
    if (q.kind === "proof") {
      proofRecorded = true;
      progress = "delivered";
      times.proof = q.capturedAt;
    }
    if (q.kind === "exception") {
      exception = true;
      times.exception = q.capturedAt;
    }
  }

  const delivered = progress === "delivered";
  const late = !delivered && !exception && ((stop.windowClose && nowHHMM > stop.windowClose) || (stop.windowClose && stop.eta && stop.eta > stop.windowClose));

  const status: StopStatus = proofRecorded ? "delivered" : exception ? "exception" : late ? "late" : "onplan";
  return { stop, progress, delivered, proofRecorded, exception, status, times, pendingSync: mine.some((q) => q.state !== "synced") };
}

export function currentTripId(run: DriverRun, views: StopView[]): number {
  const open = views.find((v) => v.status === "onplan" || v.status === "late");
  return open?.stop.tripId ?? run.tripIds[run.tripIds.length - 1] ?? 1;
}
