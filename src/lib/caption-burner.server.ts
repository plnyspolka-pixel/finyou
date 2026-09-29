// Klient usługi FFmpeg (services/caption-burner) — jedyne miejsce, które zna
// jej adres i sekret. Backend na Cloudflare Workers nie ma FFmpega, więc obraz
// przetwarza osobna usługa. Dwa zastosowania:
//   * napisy własne — wysyłamy adres czystego mastera HeyGena i gotowy plik
//     ASS (styl liczy src/lib/caption-style.ts), gotowy MP4 kopiujemy do
//     bucketu `studio-media` (trwały publiczny link — linki HeyGena wygasają
//     po ~7 dniach, nasz nie);
//   * kompresja przed publikacją — zadanie `transcode` do profilu publikacji
//     (src/lib/video-rendition*.ts); usługa sama wgrywa wynik na podpisany
//     URL Storage, żeby bajty nie szły przez worker.
//
// Konfiguracja (sekrety środowiska):
//   CAPTION_BURNER_URL    — np. https://finyou-caption-burner.fly.dev
//   CAPTION_BURNER_SECRET — ten sam, co w usłudze (Bearer)
//   STUDIO_AI_BADGE       — opcjonalnie `0` / `off` wyłącza znaczek „AI" w rogu
//                           rolek (domyślnie włączony)
// Bez nich pipeline zostaje przy napisach HeyGena, a publikacja wysyła
// oryginalne pliki (nic nie pada) — tylko bez znaczka „AI", bo HeyGen nie ma
// warstw, na których dałoby się go położyć.

import { aiBadgeAss, srtToAss, type CustomCaptionStyleId } from "./caption-style";
import { fetchBytes, storeMedia, type StoredMedia } from "./media-storage.server";

export type CaptionBurnerEnv = { configured: boolean; url: string; secret: string };

export function getCaptionBurnerEnv(): CaptionBurnerEnv {
  const url = (process.env.CAPTION_BURNER_URL ?? "").trim().replace(/\/+$/, "");
  const secret = (process.env.CAPTION_BURNER_SECRET ?? "").trim();
  return { configured: Boolean(url && secret), url, secret };
}

export const isCaptionBurnerConfigured = (): boolean => getCaptionBurnerEnv().configured;

/**
 * Czy rolki Studia dostają znaczek „AI" w rogu. Domyślnie tak — to
 * oznaczenie treści wygenerowanej przez AI; `STUDIO_AI_BADGE=0` wyłącza.
 */
export function isAiBadgeEnabled(): boolean {
  const v = (process.env.STUDIO_AI_BADGE ?? "").trim().toLowerCase();
  return !["0", "false", "off", "no", "nie"].includes(v);
}

const MAX_SRT_BYTES = 2 * 1024 * 1024;
const MAX_RESULT_BYTES = 300 * 1024 * 1024;

async function burnerFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const env = getCaptionBurnerEnv();
  if (!env.configured) {
    throw new Error(
      "Usługa wypalania napisów nie jest skonfigurowana (CAPTION_BURNER_URL / CAPTION_BURNER_SECRET).",
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  try {
    return await fetch(`${env.url}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${env.secret}`,
        accept: "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`caption-burner: ${/abort/i.test(msg) ? "przekroczony czas odpowiedzi" : msg}`);
  } finally {
    clearTimeout(timer);
  }
}

async function errorOf(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { error?: unknown };
    if (json?.error) return String(json.error);
  } catch {
    // nie-JSON — bierzemy początek treści
  }
  return text.slice(0, 300) || `HTTP ${res.status}`;
}

/**
 * Zleca wypalenie: napisy własne (SRT HeyGena → ASS w wybranym stylu),
 * znaczek „AI" albo oba naraz — i wysyła zadanie. Bez `srtUrl` / `styleId`
 * wypala sam znaczek (wideo z napisami HeyGena albo bez napisów). Zwraca id
 * zadania w usłudze (zapisywane w `studio_video_jobs.caption_burn_id`).
 */
export async function submitCaptionBurn(input: {
  videoUrl: string;
  srtUrl?: string | null;
  styleId?: CustomCaptionStyleId | null;
  aiBadge?: boolean;
  name?: string;
}): Promise<string> {
  let ass: string | null;
  if (input.srtUrl && input.styleId) {
    const srt = await fetchBytes(input.srtUrl, MAX_SRT_BYTES);
    ass = srtToAss(new TextDecoder().decode(srt.bytes), input.styleId, undefined, {
      aiBadge: input.aiBadge === true,
    });
    if (!ass) {
      throw new Error("Plik SRT z HeyGena nie zawiera żadnej kwestii — nie ma czego wypalić.");
    }
  } else if (input.aiBadge) {
    ass = aiBadgeAss();
  } else {
    throw new Error("Nie ma czego wypalić: brak napisów i znaczka AI.");
  }
  // Darmowe hostingi (Render, Koyeb, Fly z usypianiem) budzą kontener dopiero
  // przy pierwszym zapytaniu i trzymają je ok. minutę — stąd długi limit.
  const res = await burnerFetch("/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ video_url: input.videoUrl, ass, name: input.name ?? "studio" }),
    timeoutMs: 120_000,
  });
  if (!res.ok) throw new Error(`caption-burner: ${await errorOf(res)}`);
  const json = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!json?.id) throw new Error("caption-burner: odpowiedź bez id zadania.");
  return json.id;
}

export type CaptionBurnState = "queued" | "processing" | "done" | "failed" | "missing";
const KNOWN_STATES: readonly CaptionBurnState[] = ["queued", "processing", "done", "failed"];

/** Stan zadania w usłudze — wspólny dla napisów i transkodowania. */
export type BurnerJobStatus = {
  status: CaptionBurnState;
  error: string | null;
  /** Transkodowanie: plik był już zgodny z profilem — nic nie kodowano. */
  unchanged: boolean;
  /** Transkodowanie: wynik poszedł prosto na `upload_url` (Storage). */
  uploaded: boolean;
  upload_error: string | null;
  bytes: number | null;
  note: string | null;
};

/** `missing` = usługa nie zna zadania (np. restart) — klient decyduje, czy ponowić. */
export async function getBurnerJobStatus(id: string): Promise<BurnerJobStatus> {
  const res = await burnerFetch(`/jobs/${encodeURIComponent(id)}`, { timeoutMs: 90_000 });
  if (res.status === 404) {
    return {
      status: "missing",
      error: "usługa nie zna tego zadania (restart usługi?)",
      unchanged: false,
      uploaded: false,
      upload_error: null,
      bytes: null,
      note: null,
    };
  }
  if (!res.ok) throw new Error(`caption-burner: ${await errorOf(res)}`);
  const json = (await res.json().catch(() => null)) as {
    status?: string;
    error?: string | null;
    unchanged?: boolean;
    uploaded?: boolean;
    upload_error?: string | null;
    bytes?: number | null;
    note?: string | null;
  } | null;
  const status = KNOWN_STATES.find((s) => s === json?.status) ?? "failed";
  return {
    status,
    error: json?.error ?? (status === "failed" ? "nieznany błąd usługi" : null),
    unchanged: json?.unchanged === true,
    uploaded: json?.uploaded === true,
    upload_error: json?.upload_error ?? null,
    bytes: typeof json?.bytes === "number" ? json.bytes : null,
    note: json?.note ?? null,
  };
}

export async function getCaptionBurnStatus(
  id: string,
): Promise<{ status: CaptionBurnState; error: string | null }> {
  const { status, error } = await getBurnerJobStatus(id);
  return { status, error };
}

/**
 * Zleca kompresję do profilu publikacji. `uploadUrl` to podpisany adres
 * uploadu w Storage — usługa wgra tam wynik sama; gdy się nie uda, plik
 * zostaje w usłudze i pobieramy go przez `fetchBurnerFile`.
 */
export async function submitTranscode(input: {
  videoUrl: string;
  uploadUrl: string | null;
  target: Record<string, number>;
  name?: string;
}): Promise<string> {
  const res = await burnerFetch("/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "transcode",
      video_url: input.videoUrl,
      upload_url: input.uploadUrl ?? undefined,
      target: input.target,
      name: input.name ?? "publikacja",
    }),
    timeoutMs: 120_000,
  });
  if (!res.ok) throw new Error(`caption-burner: ${await errorOf(res)}`);
  const json = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!json?.id) throw new Error("caption-burner: odpowiedź bez id zadania.");
  return json.id;
}

/** Pobiera gotowy plik zadania (gdy usługa nie wgrała go sama), z limitem rozmiaru. */
export async function fetchBurnerFile(id: string, maxBytes: number): Promise<ArrayBuffer> {
  const res = await burnerFetch(`/jobs/${encodeURIComponent(id)}/file`, {
    headers: { accept: "video/mp4" },
    timeoutMs: 5 * 60_000,
  });
  if (!res.ok) throw new Error(`caption-burner: ${await errorOf(res)}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`caption-burner: plik za duży (${declared} B).`);
  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) throw new Error("caption-burner: pusty plik wynikowy.");
  if (bytes.byteLength > maxBytes) {
    throw new Error(`caption-burner: plik za duży (${bytes.byteLength} B).`);
  }
  return bytes;
}

/** Pobiera gotowy MP4 z usługi i zapisuje go w publicznym buckecie `studio-media`. */
export async function storeCaptionBurnResult(id: string, name: string): Promise<StoredMedia> {
  const res = await burnerFetch(`/jobs/${encodeURIComponent(id)}/file`, {
    headers: { accept: "video/mp4" },
    timeoutMs: 5 * 60_000,
  });
  if (!res.ok) throw new Error(`caption-burner: ${await errorOf(res)}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_RESULT_BYTES) throw new Error(`caption-burner: plik za duży (${declared} B).`);
  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) throw new Error("caption-burner: pusty plik wynikowy.");
  if (bytes.byteLength > MAX_RESULT_BYTES) {
    throw new Error(`caption-burner: plik za duży (${bytes.byteLength} B).`);
  }
  return storeMedia(bytes, {
    contentType: "video/mp4",
    visibility: "public",
    prefix: "studio-napisy",
    name,
    ext: "mp4",
  });
}

/** Sprzątanie w usłudze — nie może psuć przebiegu (usługa i tak ma TTL zadań). */
export async function discardBurnerJob(id: string): Promise<void> {
  try {
    await burnerFetch(`/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // ignorujemy — TTL po stronie usługi dokończy
  }
}

export const discardCaptionBurn = discardBurnerJob;

/** Do statusu integracji: czy usługa odpowiada i ma FFmpega. */
export async function checkCaptionBurnerHealth(): Promise<{
  ok: boolean;
  ffmpeg: string | null;
  error: string | null;
}> {
  const env = getCaptionBurnerEnv();
  if (!env.configured) return { ok: false, ffmpeg: null, error: "nie skonfigurowana" };
  try {
    const res = await burnerFetch("/health", { timeoutMs: 10_000 });
    if (!res.ok) return { ok: false, ffmpeg: null, error: await errorOf(res) };
    const json = (await res.json().catch(() => null)) as { ffmpeg?: string | null } | null;
    return { ok: true, ffmpeg: json?.ffmpeg ?? null, error: null };
  } catch (e) {
    return { ok: false, ffmpeg: null, error: e instanceof Error ? e.message : String(e) };
  }
}
