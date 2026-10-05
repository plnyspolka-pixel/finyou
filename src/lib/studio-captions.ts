// Napisy rolek Studia — czysta logika decyzyjna (bez I/O, testowalna).
//
// ZASADA: napisy ZAWSZE wypalamy u siebie (usługa services/caption-burner,
// styl z src/lib/caption-style.ts) z NASZEGO pliku SRT — tekst scenariusza
// z panelu + czasy znaków z syntezy ElevenLabs (src/lib/studio-subtitles.ts).
// HeyGen dostaje gotowe audio i NIE zamawiamy u niego napisów (`caption`
// wyłączone): jego rozpoznawanie mowy przekręcało nazwę firmy („fajnasiu",
// „finansu.pl"), a wyglądu napisów HeyGena nie da się ustawić.
//
// Nie ma więc już „wersji z napisami HeyGena", na którą dałoby się zejść.
// Gdy napisów nie da się wypalić (brak usługi, brak SRT, usługa padła mimo
// ponowienia, przekroczony czas), zadanie kończy się statusem `failed`
// z jasnym powodem w `last_error` — z zachowanym czystym masterem
// (`video_url_clean`) i plikiem SRT (`subtitle_url`), żeby ponowienie wypaliło
// napisy bez nowego renderu w HeyGen. Rolka bez napisów nie wychodzi do
// publikacji „po cichu". Wyjątki:
//   * zmiana napisów GOTOWEJ rolki — przy porażce zostaje poprzednia wersja,
//   * rolka zamówiona bez napisów — dostaje tylko znaczek „AI", a gdy i to
//     się nie uda, wychodzi bez znaczka (z adnotacją).
//
// KONTRAKT HEYGEN (/v3/videos) nadal zna `caption` — używa go Awatar FAQ i
// pipeline YouTube (sam plik SRT obok wideo); Studio wysyła `off`.

import {
  captionStyleLabel,
  isCustomCaptionStyle,
  parseCaptionStyleId,
  type CaptionStyleId,
  type CustomCaptionStyleId,
  type DynamicOverlays,
} from "./caption-style";

/** Co zamawiamy u HeyGena (parametr `caption` API). */
export type CaptionMode =
  /** Napisy wypalone w obrazie + plik SRT. */
  | "burned"
  /** Sam plik SRT, obraz zostaje czysty. */
  | "sidecar"
  /** Bez napisów — tak renderuje Studio. */
  | "off";

/** Pola z odpowiedzi `GET /v3/videos/{id}` istotne dla napisów. */
export type HeygenCaptionOutputs = {
  video_url?: string | null;
  captioned_video_url?: string | null;
  subtitle_url?: string | null;
};

/** Etykieta stanu napisów dla panelu (biblioteka wygenerowanych wideo). */
export function captionBadgeLabel(job: {
  captions: boolean;
  subtitle_url: string | null;
  caption_style?: string | null;
}): string {
  if (job.captions) {
    return isCustomCaptionStyle(job.caption_style)
      ? `napisy: ${captionStyleLabel(job.caption_style)}`
      : `napisy: ${captionStyleLabel(job.caption_style)}`;
  }
  return job.subtitle_url ? "tylko plik SRT" : "bez napisów";
}

// ── Napisy własne — plan i domknięcie ───────────────────────────────────────

/** Ile czekamy na usługę wypalania, zanim uznamy zadanie za nieudane. */
export const CAPTION_BURN_TIMEOUT_MS = 45 * 60_000;
/** Ile razy zlecamy wypalenie, zanim odpuścimy (usługa mogła się zrestartować). */
export const CAPTION_BURN_MAX_ATTEMPTS = 2;

export type CaptionBurnPlan =
  | {
      action: "burn";
      videoUrl: string;
      srtUrl: string;
      styleId: CustomCaptionStyleId;
      /** Ten sam przebieg dokłada znaczek „AI" w rogu. */
      aiBadge: boolean;
      /** …i nakładki dynamiczne (znacznik kategorii + duże pytanie). */
      overlays: DynamicOverlays | null;
    }
  /** Napisy wyłączone dla tej rolki — nic do wypalenia (poza znaczkiem). */
  | { action: "skip" }
  /** Napisy zamówione, ale nie da się ich wypalić — zadanie ma paść z tym powodem. */
  | { action: "fail"; reason: string };

export const NO_BURNER_REASON =
  "Napisy nie zostały wypalone: brak usługi wypalania (CAPTION_BURNER_URL / CAPTION_BURNER_SECRET). Skonfiguruj usługę i ponów zadanie.";
export const NO_SRT_REASON =
  "Napisy nie zostały wypalone: brak pliku SRT (tekst scenariusza z czasami ElevenLabs). Ponów zadanie, żeby nagrać lektora od nowa.";
export const NO_MASTER_REASON =
  "Napisy nie zostały wypalone: HeyGen nie oddał czystego pliku wideo.";

/**
 * Czy i jak wypalamy napisy dla tego joba. Napisy włączone wymagają usługi,
 * czystego mastera i naszego SRT — każdy brak to porażka zadania z powodem,
 * nie publikacja bez napisów.
 */
export function planCaptionBurn(input: {
  captions: boolean;
  captionStyle: string | null | undefined;
  burnerConfigured: boolean;
  videoUrl: string | null | undefined;
  srtUrl: string | null | undefined;
  /** Dołóż znaczek „AI" do wypalanych napisów. */
  aiBadge?: boolean;
  /** Dołóż nakładki dynamiczne (rolki z paczki 250 pytań). */
  overlays?: DynamicOverlays | null;
}): CaptionBurnPlan {
  if (!input.captions) return { action: "skip" };
  if (!input.burnerConfigured) return { action: "fail", reason: NO_BURNER_REASON };
  const videoUrl = input.videoUrl ?? "";
  if (!videoUrl) return { action: "fail", reason: NO_MASTER_REASON };
  const srtUrl = input.srtUrl ?? "";
  if (!srtUrl) return { action: "fail", reason: NO_SRT_REASON };
  return {
    action: "burn",
    videoUrl,
    srtUrl,
    styleId: parseCaptionStyleId(input.captionStyle),
    aiBadge: input.aiBadge === true,
    overlays: input.overlays ?? null,
  };
}

// ── Znaczek „AI" bez napisów ────────────────────────────────────────────────

export type BadgeBurnPlan =
  | { action: "badge"; videoUrl: string; aiBadge: boolean; overlays: DynamicOverlays | null }
  /** Publikujemy bez znaczka; `reason` trafia do `last_error`, gdy nie jest null. */
  | { action: "skip"; reason: string | null };

/**
 * Znaczek „AI" i/lub nakładki dynamiczne dla rolki bez napisów: usługa
 * wypalania kładzie je na czysty master. Bez usługi nie da się ich położyć
 * (HeyGen nie ma warstw) — mówimy o tym w `last_error`, ale rolki nie
 * blokujemy.
 */
export function planBadgeBurn(input: {
  aiBadge: boolean;
  burnerConfigured: boolean;
  videoUrl: string | null | undefined;
  overlays?: DynamicOverlays | null;
}): BadgeBurnPlan {
  const overlays = input.overlays ?? null;
  if (!input.aiBadge && !overlays) return { action: "skip", reason: null };
  if (!input.burnerConfigured) {
    const what =
      input.aiBadge && overlays
        ? "Znaczek AI i nakładki dynamiczne pominięte"
        : input.aiBadge
          ? "Znaczek AI pominięty"
          : "Nakładki dynamiczne pominięte";
    return {
      action: "skip",
      reason: `${what}: brak usługi wypalania (CAPTION_BURNER_URL / CAPTION_BURNER_SECRET).`,
    };
  }
  if (!input.videoUrl) return { action: "skip", reason: null };
  return { action: "badge", videoUrl: input.videoUrl, aiBadge: input.aiBadge, overlays };
}

export type CaptionBurnState = "queued" | "processing" | "done" | "failed" | "missing";

/** Poprzedni plik do publikacji — przy zmianie napisów gotowego wideo wraca on, gdy się nie uda. */
export type CaptionBurnFallback = {
  previous: { videoUrl: string; captions: boolean; captionStyle: string | null } | null;
};

export type CaptionBurnResolution =
  | { state: "waiting" }
  /** Usługa skończyła — pobierz plik i zapisz (I/O robi wołający). */
  | { state: "store" }
  | { state: "retry"; reason: string }
  /** Zmiana napisów gotowej rolki nie wyszła — zostaje poprzednia wersja. */
  | {
      state: "fallback";
      videoUrl: string;
      captionsBurned: boolean;
      captionStyle: CaptionStyleId | string;
      note: string;
    }
  /** Pierwsze wypalenie nie wyszło — zadanie pada z tym powodem (master i SRT zostają). */
  | { state: "fail"; note: string };

/**
 * Domyka wypalanie po odpytaniu usługi. Błąd, zaginione zadanie i przekroczony
 * czas nie zostawiają joba w zawieszeniu: najpierw ponowienie (do limitu),
 * potem porażka z jasnym komunikatem (albo powrót poprzedniej wersji przy
 * zmianie napisów gotowej rolki).
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
  /** Początek komunikatu przy porażce (np. „Znaczek AI nieudany"). */
  failureLabel?: string;
}): CaptionBurnResolution {
  const timeoutMs = input.timeoutMs ?? CAPTION_BURN_TIMEOUT_MS;
  const maxAttempts = input.maxAttempts ?? CAPTION_BURN_MAX_ATTEMPTS;
  const label = input.failureLabel ?? "Napisy nieudane";

  if (input.status === "done") return { state: "store" };

  if (input.status === "queued" || input.status === "processing") {
    const since = input.startedAt ? Date.parse(input.startedAt) : Number.NaN;
    const elapsed = Number.isNaN(since) ? 0 : input.now.getTime() - since;
    if (elapsed < timeoutMs) return { state: "waiting" };
    return failureFor(
      input.fallback,
      `${label}: usługa nie skończyła w ciągu ${Math.round(timeoutMs / 60_000)} min`,
    );
  }

  const why = input.error ?? (input.status === "missing" ? "zadanie zaginęło" : "błąd usługi");
  if (input.attempts < maxAttempts) return { state: "retry", reason: why };
  return failureFor(input.fallback, `${label}: ${why}`);
}

function failureFor(fallback: CaptionBurnFallback, note: string): CaptionBurnResolution {
  if (fallback.previous?.videoUrl) {
    return {
      state: "fallback",
      videoUrl: fallback.previous.videoUrl,
      captionsBurned: fallback.previous.captions,
      captionStyle: fallback.previous.captionStyle ?? parseCaptionStyleId(null),
      note: `${note} — zostaje poprzednia wersja.`,
    };
  }
  return { state: "fail", note };
}
