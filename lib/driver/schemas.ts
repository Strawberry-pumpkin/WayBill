import { z } from "zod";
import { EXCEPTION_REASONS, PROGRESS_ORDER } from "./types";

const uuid = z.string().uuid();
const stopId = z.string().min(3).max(120).regex(/^[A-Za-z0-9_-]+\|[12]\|[A-Za-z0-9_-]+$/);
const iso = z.string().datetime({ offset: true });
const text = (max: number) => z.string().trim().max(max);

const base = { id: uuid, stopId, capturedAt: iso };

export const recordSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("event"), status: z.enum(PROGRESS_ORDER as [string, ...string[]]), note: text(500).optional() }),
  z.object({
    ...base,
    kind: z.literal("proof"),
    receivedBy: text(120).min(1),
    note: text(500).optional(),
    // Evidence is uploaded first (PUT /api/driver/evidence/:id); the record only references it.
    signatureEvidenceId: uuid,
    photoEvidenceIds: z.array(uuid).min(1).max(4),
  }),
  z.object({
    ...base,
    kind: z.literal("exception"),
    reason: z.enum(EXCEPTION_REASONS.map((r) => r.key) as [string, ...string[]]),
    details: text(1000).optional(),
  }),
]);
export type RecordInput = z.infer<typeof recordSchema>;

export const syncSchema = z.object({ queued: z.number().int().min(0).max(10_000) });

export function parseStopId(id: string) {
  const [vehicleId, trip, outletId] = id.split("|");
  return { vehicleId, tripId: Number(trip), outletId };
}
