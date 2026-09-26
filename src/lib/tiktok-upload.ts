// TikTok Content Posting API — czysta logika uploadu (bez I/O), żeby dała się
// testować bez klienta Supabase. Strona serwerowa: src/lib/tiktok.server.ts.

// TikTok wymaga chunków 5 MB–64 MB; 10 MB to wartość ze specyfikacji modułu.
export const TARGET_CHUNK_BYTES = 10 * 1024 * 1024;
export const MIN_CHUNK_BYTES = 5 * 1024 * 1024;
export const MAX_CHUNK_COUNT = 1000;

// Limit tytułu posta przyjęty w module (TikTok dopuszcza więcej).
export const TITLE_MAX = 150;

export type ChunkPlan = {
  chunkSize: number;
  totalChunkCount: number;
  ranges: Array<{ start: number; end: number }>;
};

/**
 * Podział pliku na chunki zgodny z walidacją TikToka — UWAGA: NIE ceil().
 *   * plik < 5 MB → jeden chunk równy całości (TikTok nie przyjmie mniejszego),
 *   * inaczej chunk_size ≈ 10 MB, total_chunk_count = floor(size / chunk_size),
 *     a OSTATNI chunk pochłania resztę (może być większy niż chunk_size).
 *
 * TikTok odrzuca init, gdy total_chunk_count != floor(video_size / chunk_size),
 * dlatego ceil() dawałoby błąd `invalid_params` dla każdego rozmiaru
 * niepodzielnego przez chunk_size (np. 25 MB → ceil 3, a TikTok oczekuje 2).
 */
export function planChunks(totalBytes: number): ChunkPlan {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    throw new Error("Plik wideo jest pusty.");
  }
  if (totalBytes < MIN_CHUNK_BYTES) {
    return {
      chunkSize: totalBytes,
      totalChunkCount: 1,
      ranges: [{ start: 0, end: totalBytes - 1 }],
    };
  }
  let chunkSize = Math.min(TARGET_CHUNK_BYTES, totalBytes);
  let totalChunkCount = Math.floor(totalBytes / chunkSize);
  // Bardzo duże pliki: trzymaj się limitu 1000 chunków.
  if (totalChunkCount > MAX_CHUNK_COUNT) {
    chunkSize = Math.ceil(totalBytes / MAX_CHUNK_COUNT);
    totalChunkCount = Math.floor(totalBytes / chunkSize);
  }
  const ranges: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < totalChunkCount; i++) {
    const start = i * chunkSize;
    // Ostatni chunk dociąga ogon pliku.
    const end = i === totalChunkCount - 1 ? totalBytes - 1 : start + chunkSize - 1;
    ranges.push({ start, end });
  }
  return { chunkSize, totalChunkCount, ranges };
}

/** Tytuł posta: normalizacja białych znaków i limit TITLE_MAX. */
export function tiktokTitle(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().replace(/\s+/g, " ");
  return t.length <= TITLE_MAX ? t : `${t.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

/**
 * privacy_level dla publikacji: wyłącznie z listy zwróconej przez
 * creator_info/query. PUBLIC_TO_EVERYONE gdy dostępne, inaczej pierwsza opcja.
 * Zero hardkodu — klient bez audytu TikToka dostaje tylko SELF_ONLY.
 */
export function pickPrivacyLevel(options: readonly string[]): string {
  const valid = options.filter((o) => typeof o === "string" && o.length > 0);
  if (!valid.length) {
    throw new Error(
      "TikTok nie zwrócił dozwolonych poziomów prywatności (privacy_level_options) — nie publikujemy bez nich.",
    );
  }
  return valid.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : valid[0];
}
