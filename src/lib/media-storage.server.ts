// Zapis wygenerowanych mediów (TTS, muzyka, efekty, nagrania, dubbing) do
// Storage i zwrot adresu: publicznego (bucket `studio-media`) albo podpisanego
// na godzinę (bucket `documents`, dla nagrań rozmów i innych rzeczy, które nie
// powinny być dostępne dla każdego z linkiem).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StoredMedia = {
  bucket: string;
  path: string;
  url: string;
  /** Dla adresów podpisanych: kiedy link wygasa (ISO). Publiczne: null. */
  expires_at: string | null;
  bytes: number;
  content_type: string;
};

const PUBLIC_BUCKET = "studio-media";
const PRIVATE_BUCKET = "documents";
const SIGNED_TTL_SECONDS = 3600;

const EXT_BY_TYPE: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/json": "json",
  "text/plain": "txt",
  "application/x-subrip": "srt",
};

function extFor(contentType: string, fallback = "bin"): string {
  const base = contentType.split(";")[0].trim().toLowerCase();
  return EXT_BY_TYPE[base] ?? fallback;
}

function safeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Upload z samonaprawą: gdy bucket nie istnieje (np. migracja nie poszła na
 * produkcji), tworzy go z właściwą widocznością i ponawia zapis raz.
 * `upsert: true` nadpisuje plik pod stałą ścieżką (np. film z landingu).
 */
export async function uploadEnsuringBucket(
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string,
  opts: { upsert?: boolean } = {},
): Promise<void> {
  const upload = () =>
    supabaseAdmin.storage
      .from(bucket)
      .upload(path, bytes, { contentType, upsert: opts.upsert ?? false });
  let { error } = await upload();
  if (error && /bucket.*not.*found/i.test(error.message)) {
    const { error: createErr } = await supabaseAdmin.storage.createBucket(bucket, {
      public: bucket === PUBLIC_BUCKET,
    });
    if (createErr && !/already exists/i.test(createErr.message)) {
      throw new Error(`storage ${bucket}: nie można utworzyć bucketa: ${createErr.message}`);
    }
    ({ error } = await upload());
  }
  if (error) throw new Error(`storage ${bucket}: ${error.message}`);
}

/**
 * Zapisuje bajty w Storage pod `mcp/<rok-miesiąc>/<nazwa>-<losowe>.<ext>` i
 * zwraca adres. `visibility: "private"` = podpisany link na godzinę.
 */
export async function storeMedia(
  data: ArrayBuffer | Uint8Array,
  opts: {
    contentType: string;
    visibility: "public" | "private";
    /** Podfolder, np. `tts`, `music`, `recordings`. */
    prefix?: string;
    /** Czytelna część nazwy pliku. */
    name?: string;
    ext?: string;
  },
): Promise<StoredMedia> {
  const bucket = opts.visibility === "public" ? PUBLIC_BUCKET : PRIVATE_BUCKET;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const ext = opts.ext ?? extFor(opts.contentType);
  const month = new Date().toISOString().slice(0, 7);
  const rand = crypto.randomUUID().slice(0, 8);
  const base = safeName(opts.name ?? "media") || "media";
  const path = `mcp/${opts.prefix ? `${safeName(opts.prefix)}/` : ""}${month}/${base}-${rand}.${ext}`;

  await uploadEnsuringBucket(bucket, path, bytes, opts.contentType);

  if (opts.visibility === "public") {
    const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);
    return {
      bucket,
      path,
      url: pub.publicUrl,
      expires_at: null,
      bytes: bytes.byteLength,
      content_type: opts.contentType,
    };
  }
  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    throw new Error(`storage ${bucket}: ${signErr?.message ?? "brak podpisanego adresu"}`);
  }
  return {
    bucket,
    path,
    url: signed.signedUrl,
    expires_at: new Date(Date.now() + SIGNED_TTL_SECONDS * 1000).toISOString(),
    bytes: bytes.byteLength,
    content_type: opts.contentType,
  };
}

/** Podpisany link do istniejącego pliku w prywatnym buckecie. */
export async function signedUrlFor(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(`storage ${bucket}: ${error?.message ?? "brak"}`);
  return data.signedUrl;
}

/** Pobiera plik z adresu http(s) (limit rozmiaru) — do STT, dubbingu itp. */
export async function fetchBytes(
  url: string,
  maxBytes = 50 * 1024 * 1024,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (!/^https?:\/\//i.test(url)) throw new Error("Adres musi zaczynać się od http(s)://");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pobranie ${url} nie powiodło się: HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len && len > maxBytes) throw new Error(`Plik za duży (${len} B, limit ${maxBytes} B).`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error(`Plik za duży (limit ${maxBytes} B).`);
  return { bytes, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}

const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * Pobiera obraz spod adresu i zwraca blok `image` (base64) do wyniku
 * narzędzia MCP — podgląd inline w czacie. `null`, gdy to nie obraz, jest za
 * duży albo pobranie się nie powiodło (podgląd nigdy nie psuje wyniku).
 */
export async function fetchImageBlock(
  url: string | null | undefined,
  maxBytes = 3 * 1024 * 1024,
): Promise<{ type: "image"; data: string; mimeType: string } | null> {
  if (!url) return null;
  try {
    const { bytes, contentType } = await fetchBytes(url, maxBytes);
    let mime = contentType.split(";")[0].trim().toLowerCase();
    if (!mime.startsWith("image/")) {
      const ext = /\.(png|jpe?g|webp|gif)(?:$|\?)/i.exec(url)?.[1]?.toLowerCase();
      if (!ext) return null;
      mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    }
    if (!INLINE_IMAGE_TYPES.has(mime)) return null;
    return { type: "image", data: Buffer.from(bytes).toString("base64"), mimeType: mime };
  } catch {
    return null;
  }
}

/** Kilka obrazów naraz (pomija te, których nie da się pokazać). */
export async function fetchImageBlocks(
  urls: (string | null | undefined)[],
  opts: { max?: number; maxBytes?: number } = {},
): Promise<{ type: "image"; data: string; mimeType: string }[]> {
  const picked = urls.filter((u): u is string => Boolean(u)).slice(0, opts.max ?? 4);
  const blocks = await Promise.all(picked.map((u) => fetchImageBlock(u, opts.maxBytes)));
  return blocks.filter((b): b is NonNullable<typeof b> => b !== null);
}
