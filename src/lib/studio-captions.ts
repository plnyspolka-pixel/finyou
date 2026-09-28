// Napisy w wideo HeyGen — czysta logika decyzyjna (bez I/O, testowalna).
//
// KONTRAKT HEYGEN (/v3/videos):
//   caption: { file_format: "srt" }                  → sam plik SRT obok wideo,
//   caption: { file_format: "srt", style: "default" } → DODATKOWO napisy wypalone
//                                                       w obrazie.
// Wypalona wersja NIE nadpisuje `video_url` — wraca osobnym polem
// `captioned_video_url`, a `video_url` zostaje czystym masterem. Kto czyta samo
// `video_url`, publikuje film bez napisów — i dokładnie to robiliśmy wcześniej.
//
// Rolki i shorty ogląda się bez dźwięku, więc do publikacji bierzemy wersję
// wypaloną, a czysty master trzymamy obok (montaż, inne przeznaczenie).
//
// NAPISY WŁASNE: `caption.style` HeyGena przyjmuje wyłącznie "default", więc
// gdy job ma styl inny niż `heygen`, po zakończeniu renderu bierzemy czysty
// master + plik SRT i wypalamy napisy sami (src/lib/caption-style.ts +
// usługa services/caption-burner). Decyzje o tym, kiedy to robić i na co
// schodzić, gdy się nie uda, siedzą tutaj (czysta logika, testowana).

import {
  captionStyleLabel,
  isCustomCaptionStyle,
  parseCaptionStyleId,
  type CaptionStyleId,
  type CustomCaptionStyleId,
} from "./caption-style";

/** Co zamawiamy u HeyGena. */
export type CaptionMode =
  /** Napisy wypalone w obrazie + plik SRT. */
  | "burned"
  /** Sam plik SRT, obraz zostaje czysty. */
  | "sidecar"
  /** Bez napisów. */
  | "off";

/** Pola z odpowiedzi `GET /v3/videos/{id}` istotne dla napisów. */
export type HeygenCaptionOutputs = {
  video_url?: string | null;
  captioned_video_url?: string | null;
  subtitle_url?: string | null;
};

/**
 * Ile czekamy na plik z wypalonymi napisami, jeśli HeyGen zdążył oddać samo
 * wideo. Tick kolejki chodzi co 10 minut, więc okno daje co najmniej jeszcze
 * jedno odpytanie, zanim uznamy, że napisów nie będzie.
 */
export const CAPTION_GRACE_MS = 12 * 60_000;

export type CaptionResolution =
  /** Wideo gotowe, ale czekamy jeszcze na wersję z napisami. */
  | { state: "waiting"; waitSince: string }
  | {
      state: "ready";
      /** Plik do publikacji (z napisami, jeśli je zamówiono i dojechały). */
      videoUrl: string;
      /** Czysty master bez napisów — null, gdy nie ma osobnej wersji. */
      cleanVideoUrl: string | null;
      subtitleUrl: string | null;
      /** Czy `videoUrl` faktycznie ma napisy wypalone w obrazie. */
      captionsBurned: boolean;
      /** Komunikat do panelu, gdy dostaliśmy mniej, niż zamawialiśmy. */
      note: string | null;
    };

/**
 * Decyduje, który plik HeyGena publikujemy i czy warto jeszcze poczekać.
 *
 * `waitSince` to znacznik pierwszego odpytania, w którym wideo było gotowe,
 * a wypalonej wersji jeszcze nie było (null = jeszcze nie czekaliśmy).
 */
export function resolveCaptionedOutput(input: {
  want: CaptionMode;
  outputs: HeygenCaptionOutputs;
  waitSince: string | null;
  now: Date;
  graceMs?: number;
}): CaptionResolution {
  const { want, outputs, waitSince, now } = input;
  const graceMs = input.graceMs ?? CAPTION_GRACE_MS;
  const videoUrl = outputs.video_url ?? "";
  const subtitleUrl = outputs.subtitle_url ?? null;
  const captionedUrl = outputs.captioned_video_url ?? null;

  if (want !== "burned") {
    return {
      state: "ready",
      videoUrl,
      cleanVideoUrl: null,
      subtitleUrl,
      captionsBurned: false,
      note: null,
    };
  }

  if (captionedUrl) {
    return {
      state: "ready",
      videoUrl: captionedUrl,
      // Czysty master trzymamy tylko wtedy, gdy naprawdę jest inny plik.
      cleanVideoUrl: videoUrl && videoUrl !== captionedUrl ? videoUrl : null,
      subtitleUrl,
      captionsBurned: true,
      note: null,
    };
  }

  const since = waitSince ? Date.parse(waitSince) : Number.NaN;
  if (!waitSince || Number.isNaN(since)) {
    return { state: "waiting", waitSince: now.toISOString() };
  }
  if (now.getTime() - since < graceMs) {
    return { state: "waiting", waitSince };
  }

  // Poddajemy się: publikujemy czysty plik, ale mówimy o tym wprost, zamiast
  // zostawiać w panelu badge „napisy" przy wideo bez napisów.
  return {
    state: "ready",
    videoUrl,
    cleanVideoUrl: null,
    subtitleUrl,
    captionsBurned: false,
    note: `HeyGen nie zwrócił wersji z wypalonymi napisami w ciągu ${Math.round(
      graceMs / 60_000,
    )} min — opublikowany plik jest bez napisów.`,
  };
}

/** Etykieta stanu napisów dla panelu (biblioteka wygenerowanych wideo). */
export function captionBadgeLabel(job: {
  captions: boolean;
  subtitle_url: string | null;
  caption_style?: string | null;
}): string {
  if (job.captions) {
    return isCustomCaptionStyle(job.caption_style)
      ? `napisy: ${captionStyleLabel(job.caption_style)}`
      : "napisy na wideo";
  }
  return job.subtitle_url ? "tylko plik SRT" : "bez napisów";
}

// ── Napisy własne — plan i domknięcie ───────────────────────────────────────

/** Ile czekamy na usługę wypalania, zanim opublikujemy wersję zapasową. */
export const CAPTION_BURN_TIMEOUT_MS = 45 * 60_000;
/** Ile razy zlecamy wypalenie, zanim odpuścimy (usługa mogła się zrestartować). */
export const CAPTION_BURN_MAX_ATTEMPTS = 2;

export type CaptionBurnPlan =
  | { action: "burn"; videoUrl: string; srtUrl: string; styleId: CustomCaptionStyleId }
  /** Zostajemy przy napisach HeyGena; `reason` trafia do `last_error`, gdy nie jest null. */
  | { action: "heygen"; reason: string | null };

/**
 * Czy dla tego joba wypalamy napisy u siebie. Warunki: napisy włączone, styl
 * własny, usługa skonfigurowana, HeyGen oddał czysty master i plik SRT.
 * Każdy brak = napisy HeyGena, z powodem tam, gdzie użytkownik czegoś oczekiwał.
 */
export function planCaptionBurn(input: {
  captions: boolean;
  captionStyle: string | null | undefined;
  burnerConfigured: boolean;
  outputs: HeygenCaptionOutputs;
}): CaptionBurnPlan {
  if (!input.captions) return { action: "heygen", reason: null };
  const style = parseCaptionStyleId(input.captionStyle);
  if (!isCustomCaptionStyle(style)) return { action: "heygen", reason: null };
  if (!input.burnerConfigured) {
    return {
      action: "heygen",
      reason:
        "Własne napisy pominięte: brak usługi wypalania (CAPTION_BURNER_URL / CAPTION_BURNER_SECRET) — napisy HeyGena.",
    };
  }
  const videoUrl = input.outputs.video_url ?? "";
  if (!videoUrl) return { action: "heygen", reason: null };
  const srtUrl = input.outputs.subtitle_url ?? null;
  if (!srtUrl) {
    return {
      action: "heygen",
      reason: "Własne napisy pominięte: HeyGen nie oddał pliku SRT — napisy HeyGena.",
    };
  }
  return { action: "burn", videoUrl, srtUrl, styleId: style };
}

export type CaptionBurnState = "queued" | "processing" | "done" | "failed" | "missing";

/** Poprzedni plik do publikacji — przy zmianie napisów gotowego wideo wraca on, gdy się nie uda. */
export type CaptionBurnFallback = {
  previous: { videoUrl: string; captions: boolean; captionStyle: string | null } | null;
  heygen: HeygenCaptionOutputs | null;
};

export type CaptionBurnResolution =
  | { state: "waiting" }
  /** Usługa skończyła — pobierz plik i zapisz (I/O robi wołający). */
  | { state: "store" }
  | { state: "retry"; reason: string }
  | {
      state: "fallback";
      videoUrl: string;
      captionsBurned: boolean;
      captionStyle: CaptionStyleId;
      note: string;
    };

/**
 * Domyka wypalanie po odpytaniu usługi. Błąd, zaginione zadanie i przekroczony
 * czas nie zostawiają joba w zawieszeniu: najpierw ponowienie (do limitu),
 * potem publikacja wersji zapasowej z jasnym komunikatem w `last_error`.
 */
export function resolveCaptionBurn(input: {
  status: CaptionBurnState;
  error: string | null;
  startedAt: string | null;
  attempts: number;
  now: Date;
  fallback: CaptionBurnFallback;
  timeoutMs?: number;
  maxAttempts?: number;
}): CaptionBurnResolution {
  const timeoutMs = input.timeoutMs ?? CAPTION_BURN_TIMEOUT_MS;
  const maxAttempts = input.maxAttempts ?? CAPTION_BURN_MAX_ATTEMPTS;

  if (input.status === "done") return { state: "store" };

  if (input.status === "queued" || input.status === "processing") {
    const since = input.startedAt ? Date.parse(input.startedAt) : Number.NaN;
    const elapsed = Number.isNaN(since) ? 0 : input.now.getTime() - since;
    if (elapsed < timeoutMs) return { state: "waiting" };
    return fallbackFor(
      input.fallback,
      `Własne napisy nieudane: usługa nie skończyła w ciągu ${Math.round(timeoutMs / 60_000)} min`,
    );
  }

  const why = input.error ?? (input.status === "missing" ? "zadanie zaginęło" : "błąd usługi");
  if (input.attempts < maxAttempts) return { state: "retry", reason: why };
  return fallbackFor(input.fallback, `Własne napisy nieudane: ${why}`);
}

function fallbackFor(fallback: CaptionBurnFallback, note: string): CaptionBurnResolution {
  if (fallback.previous?.videoUrl) {
    return {
      state: "fallback",
      videoUrl: fallback.previous.videoUrl,
      captionsBurned: fallback.previous.captions,
      captionStyle: parseCaptionStyleId(fallback.previous.captionStyle),
      note: `${note} — zostaje poprzednia wersja.`,
    };
  }
  const captioned = fallback.heygen?.captioned_video_url ?? null;
  const clean = fallback.heygen?.video_url ?? "";
  if (captioned) {
    return {
      state: "fallback",
      videoUrl: captioned,
      captionsBurned: true,
      captionStyle: "heygen",
      note: `${note} — opublikowano wersję z napisami HeyGena.`,
    };
  }
  return {
    state: "fallback",
    videoUrl: clean,
    captionsBurned: false,
    captionStyle: "heygen",
    note: `${note} — opublikowany plik jest bez napisów.`,
  };
}
