// Klient renderu rolek na Remotion Lambda (services/remotion) — napisy,
// znaczek „AI" i nakładki dynamiczne jako komponenty React zamiast pliku
// ASS wypalanego FFmpegiem. Worker nie rozmawia z AWS wprost: zleca render
// małej Lambdzie-gatewayowi (services/remotion/gateway.mjs) tym samym
// protokołem HTTPS + Bearer, co z usługą caption-burner, i odbiera podpisany
// link S3 do gotowego MP4. Kompresja przed publikacją (transcode) NIE idzie
// tędy — Remotion składa film z komponentów, nie konwertuje plików; zostaje
// w caption-burner (src/lib/video-rendition*.ts).
//
// Konfiguracja (sekrety środowiska; drukuje je `npm run lambda:deploy`):
//   REMOTION_RENDER_URL    — adres Function URL gatewaya
//   REMOTION_RENDER_SECRET — sekret Bearer gatewaya
// Gdy oba są ustawione, napisy idą na Remotion; inaczej na caption-burner
// (przełącznik w src/lib/caption-burner.server.ts).
//
// Kompozycja niczego nie liczy z tekstu: kwestie SRT tniemy pod styl TUTAJ
// (chunkCues — ta sama logika, co przy ASS), nakładki dopasowujemy do SRT
// (overlaysWithCueTiming) i wysyłamy gotowe do narysowania.

import {
  CUSTOM_CAPTION_STYLES,
  chunkCues,
  overlaysWithCueTiming,
  parseSubtitles,
  type CaptionStyle,
  type CustomCaptionStyleId,
  type DynamicOverlays,
  type SrtCue,
} from "./caption-style";
import { fixBrandInCues } from "./caption-brand";
import { fetchBytes } from "./media-storage.server";

export type RemotionRenderEnv = { configured: boolean; url: string; secret: string };

export function getRemotionRenderEnv(): RemotionRenderEnv {
  const url = (process.env.REMOTION_RENDER_URL ?? "").trim().replace(/\/+$/, "");
  const secret = (process.env.REMOTION_RENDER_SECRET ?? "").trim();
  return { configured: Boolean(url && secret), url, secret };
}

export const isRemotionRenderConfigured = (): boolean => getRemotionRenderEnv().configured;

/** Prefiks id zadania w `studio_video_jobs.caption_burn_id` — odróżnia render Remotion od caption-burnera. */
export const REMOTION_JOB_PREFIX = "remotion:";
export const isRemotionJobId = (id: string): boolean => id.startsWith(REMOTION_JOB_PREFIX);
const renderIdOf = (id: string) => encodeURIComponent(id.slice(REMOTION_JOB_PREFIX.length));

const MAX_SRT_BYTES = 2 * 1024 * 1024;

async function gatewayFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const env = getRemotionRenderEnv();
  if (!env.configured) {
    throw new Error(
      "Render Remotion nie jest skonfigurowany (REMOTION_RENDER_URL / REMOTION_RENDER_SECRET).",
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
    throw new Error(`remotion: ${/abort/i.test(msg) ? "przekroczony czas odpowiedzi" : msg}`);
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

/** Wejście kompozycji StudioReel (services/remotion/src/StudioReel.tsx). */
export type StudioReelInput = {
  videoUrl: string;
  cues: SrtCue[];
  style: CaptionStyle | null;
  aiBadge: boolean;
  overlays: DynamicOverlays | null;
};

/**
 * Buduje wejście kompozycji z SRT i zamówienia — czysta logika (testowalna).
 * Bez stylu kwestie nie idą (rolka bez napisów), ale SRT i tak służy do
 * czasów nakładek. `null`, gdy nie ma czego renderować.
 */
export function buildStudioReelInput(input: {
  videoUrl: string;
  srt: string | null;
  styleId: CustomCaptionStyleId | null;
  aiBadge: boolean;
  overlays: DynamicOverlays | null;
}): StudioReelInput | null {
  const parsed = input.srt ? fixBrandInCues(parseSubtitles(input.srt)) : [];
  const style = input.styleId ? CUSTOM_CAPTION_STYLES[input.styleId] : null;
  const cues = style
    ? chunkCues(parsed, { maxChars: style.maxChars, maxLines: style.maxLines })
    : [];
  if (style && !cues.length) return null;
  const overlays =
    input.overlays && parsed.length
      ? overlaysWithCueTiming(input.overlays, parsed)
      : input.overlays;
  if (!style && !input.aiBadge && !overlays) return null;
  return { videoUrl: input.videoUrl, cues, style, aiBadge: input.aiBadge, overlays };
}

/**
 * Zleca render rolki: napisy w stylu (z naszego SRT), znaczek „AI" i nakładki
 * — w dowolnym zestawie. Zwraca id z prefiksem `remotion:` do zapisu
 * w `studio_video_jobs.caption_burn_id`.
 */
export async function submitRemotionCaptionRender(input: {
  videoUrl: string;
  srtUrl?: string | null;
  styleId?: CustomCaptionStyleId | null;
  aiBadge?: boolean;
  overlays?: DynamicOverlays | null;
  name?: string;
}): Promise<string> {
  let srt: string | null = null;
  if (input.srtUrl) {
    try {
      const bytes = await fetchBytes(input.srtUrl, MAX_SRT_BYTES);
      srt = new TextDecoder().decode(bytes.bytes);
    } catch (e) {
      // Napisy zamówione → SRT jest konieczny; dla samych nakładek wystarczy szacunek czasu.
      if (input.styleId) throw e;
    }
  }
  const reel = buildStudioReelInput({
    videoUrl: input.videoUrl,
    srt,
    styleId: input.styleId ?? null,
    aiBadge: input.aiBadge === true,
    overlays: input.overlays ?? null,
  });
  if (!reel) {
    throw new Error(
      input.styleId
        ? "Plik SRT nie zawiera żadnej kwestii — nie ma czego wypalić."
        : "Nie ma czego wypalić: brak napisów, znaczka AI i nakładek.",
    );
  }
  const res = await gatewayFetch("/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      video_url: reel.videoUrl,
      cues: reel.cues,
      style: reel.style,
      ai_badge: reel.aiBadge,
      overlays: reel.overlays,
      name: input.name ?? "studio",
    }),
    timeoutMs: 60_000,
  });
  if (!res.ok) throw new Error(`remotion: ${await errorOf(res)}`);
  const json = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!json?.id) throw new Error("remotion: odpowiedź bez id renderu.");
  return `${REMOTION_JOB_PREFIX}${json.id}`;
}

export type RemotionJobStatus = {
  status: "queued" | "processing" | "done" | "failed" | "missing";
  error: string | null;
  bytes: number | null;
  /** Szacowany koszt renderu wg Remotion (np. "$0.012"). */
  cost: string | null;
  progress: number | null;
};

export async function getRemotionJobStatus(id: string): Promise<RemotionJobStatus> {
  const res = await gatewayFetch(`/jobs/${renderIdOf(id)}`, { timeoutMs: 60_000 });
  if (res.status === 404) {
    return {
      status: "missing",
      error: "gateway nie zna tego renderu",
      bytes: null,
      cost: null,
      progress: null,
    };
  }
  if (!res.ok) throw new Error(`remotion: ${await errorOf(res)}`);
  const json = (await res.json().catch(() => null)) as {
    status?: string;
    error?: string | null;
    bytes?: number | null;
    cost?: string | null;
    progress?: number | null;
  } | null;
  const known: RemotionJobStatus["status"][] = ["queued", "processing", "done", "failed"];
  const status = known.find((s) => s === json?.status) ?? "failed";
  return {
    status,
    error: json?.error ?? (status === "failed" ? "nieznany błąd renderu" : null),
    bytes: typeof json?.bytes === "number" ? json.bytes : null,
    cost: json?.cost ?? null,
    progress: typeof json?.progress === "number" ? json.progress : null,
  };
}

/** Pobiera gotowy MP4: gateway oddaje podpisany link S3, bajty idą prosto z S3. */
export async function fetchRemotionResult(id: string, maxBytes: number): Promise<ArrayBuffer> {
  const res = await gatewayFetch(`/jobs/${renderIdOf(id)}/file`, { timeoutMs: 60_000 });
  if (!res.ok) throw new Error(`remotion: ${await errorOf(res)}`);
  const json = (await res.json().catch(() => null)) as {
    url?: string;
    bytes?: number | null;
  } | null;
  if (!json?.url) throw new Error("remotion: odpowiedź bez linku do pliku.");
  if (typeof json.bytes === "number" && json.bytes > maxBytes) {
    throw new Error(`remotion: plik za duży (${json.bytes} B).`);
  }
  const file = await fetchBytes(json.url, maxBytes);
  if (!file.bytes.byteLength) throw new Error("remotion: pusty plik wynikowy.");
  return file.bytes;
}

/** Kasuje pliki renderu w S3 — nie może psuć przebiegu (bucket i tak ma wygasanie). */
export async function discardRemotionJob(id: string): Promise<void> {
  try {
    await gatewayFetch(`/jobs/${renderIdOf(id)}`, { method: "DELETE" });
  } catch {
    // ignorujemy — reguła wygasania w buckecie dokończy
  }
}

/** Do statusu integracji: czy gateway odpowiada i ma komplet ustawień. */
export async function checkRemotionRenderHealth(): Promise<{
  ok: boolean;
  function: string | null;
  error: string | null;
}> {
  const env = getRemotionRenderEnv();
  if (!env.configured) return { ok: false, function: null, error: "nie skonfigurowany" };
  try {
    const res = await gatewayFetch("/health", { timeoutMs: 10_000 });
    if (!res.ok) return { ok: false, function: null, error: await errorOf(res) };
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      function?: string | null;
    } | null;
    return {
      ok: json?.ok === true,
      function: json?.function ?? null,
      error: json?.ok ? null : "gateway bez kompletu ustawień",
    };
  } catch (e) {
    return { ok: false, function: null, error: e instanceof Error ? e.message : String(e) };
  }
}
