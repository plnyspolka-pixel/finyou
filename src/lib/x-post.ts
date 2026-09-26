// X (dawniej Twitter) — czysta logika posta i uploadu mediów (bez I/O), żeby
// dała się testować bez klienta Supabase. Strona serwerowa: src/lib/x.server.ts.
// Odpowiednik src/lib/tiktok-upload.ts dla modułu TikToka.

/**
 * Limit posta dla zwykłego konta. Konta z X Premium mają 25 000 znaków —
 * podnosi się go sekretem X_POST_MAX_CHARS, bo API nie zdradza, czy konto
 * jest płatne, a wysłanie 500 znaków z darmowego konta kończy się błędem 403.
 */
export const X_TEXT_LIMIT = 280;

/**
 * Każdy link X skraca do t.co i liczy jako dokładnie tyle znaków, niezależnie
 * od długości oryginału (transformedURLLength z konfiguracji twitter-text).
 */
export const X_URL_WEIGHT = 23;

/** Chunk uploadu: /2/media/upload/{id}/append przyjmuje do 5 MB na segment. */
export const X_CHUNK_BYTES = 4 * 1024 * 1024;

/** Limity X-a na materiał (obrazy 5 MB, wideo formalnie 512 MB). */
export const X_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/**
 * Wideo tniemy znacznie poniżej limitu X-a: plik buforujemy w pamięci (append
 * wymaga znanych granic segmentów), a worker ma 128 MB — jak przy TikToku.
 */
export const X_MAX_VIDEO_BYTES = 64 * 1024 * 1024;

/**
 * Wagi znaków z konfiguracji twitter-text: znaki z poniższych zakresów liczą
 * się jako 1, cała reszta (CJK, emoji, znaki spoza BMP) jako 2. Bez tego
 * post z emoji przechodzi naszą walidację i dostaje 403 od X-a.
 */
const WEIGHT_ONE_RANGES: Array<[number, number]> = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];

// Dopasowanie linków wystarczające do liczenia: X skraca do t.co wszystko,
// co wygląda na URL ze schematem albo zaczyna się od www.
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

function charWeight(codePoint: number): number {
  return WEIGHT_ONE_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi) ? 1 : 2;
}

/**
 * Długość posta liczona tak, jak liczy ją X: linki po {@link X_URL_WEIGHT}
 * znaków, znaki spoza zakresów łacińskich podwójnie.
 */
export function xWeightedLength(text: string): number {
  let total = 0;
  let cursor = 0;
  URL_RE.lastIndex = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    total += plainWeight(text.slice(cursor, start));
    total += X_URL_WEIGHT;
    cursor = start + match[0].length;
  }
  total += plainWeight(text.slice(cursor));
  return total;
}

function plainWeight(text: string): number {
  let total = 0;
  for (const ch of text) total += charWeight(ch.codePointAt(0)!);
  return total;
}

/**
 * Treść posta: normalizacja białych znaków (akapity zostają, bo X je szanuje)
 * i przycięcie do limitu na granicy słowa. Przycinamy PRZED wysyłką, bo X
 * odrzuca za długi post błędem, zamiast go skrócić.
 *
 * Linki nigdy nie są rozcinane w połowie — wypadają w całości albo zostają
 * w całości, inaczej w poście wylądowałby martwy adres.
 */
export function xPostText(raw: string | null | undefined, limit = X_TEXT_LIMIT): string {
  const text = (raw ?? "")
    .replace(/\r\n?/g, "\n")
    // Spacje i taby scalamy, znaki nowej linii zostawiamy (akapity).
    .replace(/[^\S\n]+/g, " ")
    // Spacja przed albo po złamaniu linii jest niewidoczna, a zjada limit.
    .replace(/ ?\n ?/g, "\n")
    // Więcej niż jedna pusta linia z rzędu nic nie wnosi, a zjada limit.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return "";
  if (xWeightedLength(text) <= limit) return text;

  // Miejsce na wielokropek doklejany po przycięciu.
  const budget = limit - 1;
  // Granice, na których wolno ciąć: początki „kawałków" tekstu i linków.
  const pieces = splitOnUrls(text);
  let used = 0;
  let out = "";
  for (const piece of pieces) {
    if (piece.isUrl) {
      if (used + X_URL_WEIGHT > budget) break;
      used += X_URL_WEIGHT;
      out += piece.text;
      continue;
    }
    for (const ch of piece.text) {
      const w = charWeight(ch.codePointAt(0)!);
      if (used + w > budget) {
        used = budget + 1;
        break;
      }
      used += w;
      out += ch;
    }
    if (used > budget) break;
  }
  // Cofnij do granicy słowa, o ile nie zjada to więcej niż ostatni wyraz.
  const lastSpace = out.search(/\s+\S*$/);
  if (lastSpace > 0 && out.length - lastSpace < 20) out = out.slice(0, lastSpace);
  return `${out.trimEnd()}…`;
}

function splitOnUrls(text: string): Array<{ text: string; isUrl: boolean }> {
  const pieces: Array<{ text: string; isUrl: boolean }> = [];
  let cursor = 0;
  URL_RE.lastIndex = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    if (start > cursor) pieces.push({ text: text.slice(cursor, start), isUrl: false });
    pieces.push({ text: match[0], isUrl: true });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), isUrl: false });
  return pieces;
}

// ── Media ────────────────────────────────────────────────────────────────────

export type XMediaKind = "image" | "gif" | "video";

export type XMedia = {
  url: string;
  kind: XMediaKind;
  /** media_category dla /2/media/upload — X waliduje spójność z plikiem. */
  category: "tweet_image" | "tweet_gif" | "tweet_video";
  contentType: string;
  maxBytes: number;
};

const EXT_MAP: Record<string, { kind: XMediaKind; contentType: string }> = {
  mp4: { kind: "video", contentType: "video/mp4" },
  m4v: { kind: "video", contentType: "video/mp4" },
  mov: { kind: "video", contentType: "video/quicktime" },
  gif: { kind: "gif", contentType: "image/gif" },
  jpg: { kind: "image", contentType: "image/jpeg" },
  jpeg: { kind: "image", contentType: "image/jpeg" },
  png: { kind: "image", contentType: "image/png" },
  webp: { kind: "image", contentType: "image/webp" },
};

/**
 * Rozpoznaje materiał po rozszerzeniu w URL-u (query string odpada).
 * `fallback` rozstrzyga pliki bez rozszerzenia — do kolejki trafiają osobne
 * kolumny video_url i image_url, więc wiemy, czego się spodziewać.
 */
export function xMediaFromUrl(url: string, fallback: XMediaKind): XMedia {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // Nie-URL trafi dalej do walidacji sieciowej — tu wystarczy sama ścieżka.
  }
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const hit = EXT_MAP[ext];
  const kind = hit?.kind ?? fallback;
  const contentType =
    hit?.contentType ??
    (kind === "video" ? "video/mp4" : kind === "gif" ? "image/gif" : "image/jpeg");
  return {
    url,
    kind,
    category: kind === "video" ? "tweet_video" : kind === "gif" ? "tweet_gif" : "tweet_image",
    contentType,
    // Animowany GIF chodzi u X-a ścieżką wideo i ma własny, wyższy limit.
    maxBytes: kind === "image" ? X_MAX_IMAGE_BYTES : X_MAX_VIDEO_BYTES,
  };
}

/**
 * Materiał do posta: wideo ma pierwszeństwo przed grafiką, bo X i tak nie
 * pozwala ich łączyć. Brak obu = post czysto tekstowy (na X to norma).
 */
export function pickXMedia(item: {
  video_url?: string | null;
  image_url?: string | null;
}): XMedia | null {
  if (item.video_url) return xMediaFromUrl(item.video_url, "video");
  if (item.image_url) return xMediaFromUrl(item.image_url, "image");
  return null;
}

export type XChunk = { index: number; start: number; end: number };

/**
 * Podział pliku na segmenty uploadu. W odróżnieniu od TikToka X nie narzuca
 * relacji między liczbą segmentów a rozmiarem — liczy się tylko sufit 5 MB
 * na segment i ciągła numeracja od zera, więc dzielimy po prostu ceil().
 */
export function planXChunks(totalBytes: number, chunkSize = X_CHUNK_BYTES): XChunk[] {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
    throw new Error("Plik do publikacji na X jest pusty.");
  }
  const size = Math.min(chunkSize, X_CHUNK_BYTES);
  const chunks: XChunk[] = [];
  for (let start = 0, index = 0; start < totalBytes; start += size, index += 1) {
    chunks.push({ index, start, end: Math.min(start + size, totalBytes) - 1 });
  }
  return chunks;
}
