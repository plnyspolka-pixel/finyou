// Id zadania wykończenia rolki w `studio_video_jobs.caption_burn_id`.
// Jedyny silnik wykończenia to Remotion Lambda (services/remotion), a render
// identyfikuje para bucket S3 + renderId — sklejamy ją w jeden tekst
// z prefiksem, żeby kolumna niosła wszystko, czego trzeba do odpytania
// statusu i sprzątania w S3. Czysty moduł (bez I/O) — do testów.

const REMOTION_ID_PREFIX = "remotion:";

export function remotionJobId(bucketName: string, renderId: string): string {
  return `${REMOTION_ID_PREFIX}${bucketName}:${renderId}`;
}

export function parseRemotionJobId(id: string): { bucketName: string; renderId: string } | null {
  if (!id.startsWith(REMOTION_ID_PREFIX)) return null;
  const rest = id.slice(REMOTION_ID_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0 || sep === rest.length - 1) return null;
  return { bucketName: rest.slice(0, sep), renderId: rest.slice(sep + 1) };
}
