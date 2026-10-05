import { MAX_EVIDENCE_BYTES } from "./types";

/** Shrinks a camera photo so it stores and uploads quickly on weak mobile data. Output is always JPEG ≤ 5 MB. */
export async function compressPhoto(file: File, maxEdge = 1600): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const q of [0.8, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= MAX_EVIDENCE_BYTES) return blob;
  }
  throw new Error("Photo is too large");
}
