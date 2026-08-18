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
}): "napisy na wideo" | "tylko plik SRT" | "bez napisów" {
  if (job.captions) return "napisy na wideo";
  return job.subtitle_url ? "tylko plik SRT" : "bez napisów";
}
