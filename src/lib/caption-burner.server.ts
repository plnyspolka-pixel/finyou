// Klient usługi wypalania napisów (services/caption-burner) — jedyne miejsce,
// które zna jej adres i sekret. Backend na Cloudflare Workers nie ma FFmpega,
// więc obraz przetwarza osobna usługa; my wysyłamy jej adres czystego mastera
// HeyGena i gotowy plik ASS (styl liczy src/lib/caption-style.ts), a gotowy
// MP4 kopiujemy do bucketu `studio-media` (trwały publiczny link — linki
// HeyGena wygasają po ~7 dniach, nasz nie).
//
// Konfiguracja (sekrety środowiska):
//   CAPTION_BURNER_URL    — np. https://finyou-caption-burner.fly.dev
//   CAPTION_BURNER_SECRET — ten sam, co w usłudze (Bearer)
// Bez nich pipeline zostaje przy napisach HeyGena (nic nie pada).

import { srtToAss, type CustomCaptionStyleId } from "./caption-style";
import { fetchBytes, storeMedia, type StoredMedia } from "./media-storage.server";

export type CaptionBurnerEnv = { configured: boolean; url: string; secret: string };

export function getCaptionBurnerEnv(): CaptionBurnerEnv {
  const url = (process.env.CAPTION_BURNER_URL ?? "").trim().replace(/\/+$/, "");
  const secret = (process.env.CAPTION_BURNER_SECRET ?? "").trim();
  return { configured: Boolean(url && secret), url, secret };
}

export const isCaptionBurnerConfigured = (): boolean => getCaptionBurnerEnv().configured;

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
 * Zleca wypalenie: pobiera SRT HeyGena, buduje ASS w wybranym stylu i
 * wysyła zadanie. Zwraca id zadania w usłudze (zapisywane w
 * `studio_video_jobs.caption_burn_id`).
 */
export async function submitCaptionBurn(input: {
  videoUrl: string;
  srtUrl: string;
  styleId: CustomCaptionStyleId;
  name?: string;
}): Promise<string> {
  const srt = await fetchBytes(input.srtUrl, MAX_SRT_BYTES);
  const ass = srtToAss(new TextDecoder().decode(srt.bytes), input.styleId);
  if (!ass) {
    throw new Error("Plik SRT z HeyGena nie zawiera żadnej kwestii — nie ma czego wypalić.");
  }
  const res = await burnerFetch("/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ video_url: input.videoUrl, ass, name: input.name ?? "studio" }),
    timeoutMs: 60_000,
  });
  if (!res.ok) throw new Error(`caption-burner: ${await errorOf(res)}`);
  const json = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!json?.id) throw new Error("caption-burner: odpowiedź bez id zadania.");
  return json.id;
}

export type CaptionBurnState = "queued" | "processing" | "done" | "failed" | "missing";
const KNOWN_STATES: readonly CaptionBurnState[] = ["queued", "processing", "done", "failed"];

/** `missing` = usługa nie zna zadania (np. restart) — klient decyduje, czy ponowić. */
export async function getCaptionBurnStatus(
  id: string,
): Promise<{ status: CaptionBurnState; error: string | null }> {
  const res = await burnerFetch(`/jobs/${encodeURIComponent(id)}`);
  if (res.status === 404) {
    return { status: "missing", error: "usługa nie zna tego zadania (restart usługi?)" };
  }
  if (!res.ok) throw new Error(`caption-burner: ${await errorOf(res)}`);
  const json = (await res.json().catch(() => null)) as {
    status?: string;
    error?: string | null;
  } | null;
  const status = KNOWN_STATES.find((s) => s === json?.status) ?? "failed";
  return {
    status,
    error: json?.error ?? (status === "failed" ? "nieznany błąd usługi" : null),
  };
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
export async function discardCaptionBurn(id: string): Promise<void> {
  try {
    await burnerFetch(`/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // ignorujemy — TTL po stronie usługi dokończy
  }
}

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
