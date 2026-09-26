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

// ── Ustawienia posta wybrane przez twórcę ────────────────────────────────────
//
// Wytyczne TikToka (Content Sharing Guidelines) wymagają, żeby ekran
// publikacji pokazywał twórcy opcje z creator_info i NIE hardkodował
// prywatności. Dlatego komplet ustawień jednego posta powstaje w panelu,
// leci do kolejki (social_publish_queue.tiktok_post_options) i dopiero tick
// przekłada go na pola post_info w /video/init/.

export type TiktokPostOptions = {
  /** Z privacy_level_options creator_info — bez wartości domyślnej. */
  privacyLevel: string;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  /** „Your brand" → brand_organic_toggle (promujesz własną markę). */
  brandOrganic: boolean;
  /** „Branded content" → brand_content_toggle (płatna współpraca). */
  brandedContent: boolean;
};

/** Prywatność, przy której TikTok nie dopuszcza treści brandowanej. */
export const PRIVACY_SELF_ONLY = "SELF_ONLY";

/**
 * Waliduje komplet ustawień posta. `allowedPrivacy` to lista z creator_info —
 * podana, zawęża wybór do tego, na co konto twórcy aktualnie pozwala (opcje
 * potrafią się zmienić między zaplanowaniem a publikacją).
 *
 * Reguła TikToka: treść oznaczona jako „Branded content" nie może być
 * prywatna — dlatego odrzucamy takie połączenie zamiast po cichu zmieniać
 * którekolwiek z ustawień twórcy.
 */
export function parseTiktokPostOptions(
  raw: unknown,
  allowedPrivacy?: readonly string[],
): TiktokPostOptions {
  if (!raw || typeof raw !== "object") {
    throw new Error(
      "Brak ustawień publikacji TikToka — wybierz poziom prywatności w panelu przed dodaniem do kolejki.",
    );
  }
  const o = raw as Record<string, unknown>;
  const privacyLevel = typeof o.privacyLevel === "string" ? o.privacyLevel.trim() : "";
  if (!privacyLevel) {
    throw new Error("Wybierz, kto może zobaczyć film na TikToku (poziom prywatności).");
  }
  if (allowedPrivacy && allowedPrivacy.length && !allowedPrivacy.includes(privacyLevel)) {
    throw new Error(
      `TikTok nie pozwala już na wybrany poziom prywatności (${privacyLevel}). Dostępne: ${allowedPrivacy.join(", ")}. Ustaw go ponownie w panelu.`,
    );
  }
  const options: TiktokPostOptions = {
    privacyLevel,
    disableComment: o.disableComment === true,
    disableDuet: o.disableDuet === true,
    disableStitch: o.disableStitch === true,
    brandOrganic: o.brandOrganic === true,
    brandedContent: o.brandedContent === true,
  };
  if (options.brandedContent && options.privacyLevel === PRIVACY_SELF_ONLY) {
    throw new Error(
      'TikTok nie dopuszcza treści oznaczonej jako „Branded content" przy prywatności „tylko ja" — zmień prywatność albo wyłącz to oznaczenie.',
    );
  }
  return options;
}

/**
 * Domykanie przełączników interakcji ustawieniami konta twórcy: gdy konto ma
 * komentarze/duet/stitch wyłączone globalnie, post MUSI je mieć wyłączone —
 * inaczej TikTok odrzuci init. Nigdy nie włączamy niczego, czego twórca nie
 * zaznaczył: to iloczyn, nie nadpisanie.
 */
export function applyCreatorConstraints(
  options: TiktokPostOptions,
  creator: {
    commentDisabled: boolean;
    duetDisabled: boolean;
    stitchDisabled: boolean;
  },
): TiktokPostOptions {
  return {
    ...options,
    disableComment: options.disableComment || creator.commentDisabled,
    disableDuet: options.disableDuet || creator.duetDisabled,
    disableStitch: options.disableStitch || creator.stitchDisabled,
  };
}

/** Stan startowy formularza: BEZ prywatności — twórca musi ją wskazać sam. */
export const EMPTY_TIKTOK_OPTIONS: TiktokPostOptions = {
  privacyLevel: "",
  disableComment: false,
  disableDuet: false,
  disableStitch: false,
  brandOrganic: false,
  brandedContent: false,
};

/**
 * Komunikat blokady dla formularza albo null, gdy komplet jest gotowy.
 * Świadomie liczone TYM SAMYM walidatorem co publikacja — inaczej panel
 * przepuszczałby coś, co serwer i tak odrzuci (albo odwrotnie).
 */
export function tiktokOptionsError(
  options: TiktokPostOptions,
  allowedPrivacy?: readonly string[],
): string | null {
  try {
    parseTiktokPostOptions(options, allowedPrivacy);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
