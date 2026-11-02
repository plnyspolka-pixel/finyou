// Zawieszone uploady YouTube (wpis w `uploading`) — czysta logika.
//
// Wpis zostaje w `uploading`, gdy przebieg ticka zostanie przerwany między
// przejęciem a zapisem wyniku (29.10.2026: „ILE DOSTANIESZ?” był na kanale,
// a wpis wisiał cztery dni). Nie było żadnego wyjścia z tego stanu.
//
// Teraz adres sesji uploadu (resumable upload) zapisujemy zaraz po inicjacji,
// a tick pyta YouTube o jej stan (PUT z `Content-Range: bytes */<rozmiar>`):
//   * 200/201 z id filmu → film jest na kanale, domykamy wpis jako `published`,
//   * 308 albo 404/410 → plik nie dotarł w całości / sesja wygasła → ponowienie,
//   * inny wynik (5xx, 401, błąd sieci) → czekamy do kolejnego ticka.
// Bez adresu sesji: przebieg padł przed inicjacją, więc nic nie poszło na
// kanał i wpis bezpiecznie wraca do kolejki. Wyjątek to wpisy sprzed tej
// zmiany (brak `upload_claimed_at`) — film mógł wyjść, więc `failed` z prośbą
// o sprawdzenie kanału zamiast ryzyka duplikatu.

/** Po tylu minutach w `uploading` upload uznajemy za zawieszony i sprawdzamy w YouTube. */
export const STALLED_YOUTUBE_UPLOAD_MIN = 30;
/** Po tylu godzinach bez rozstrzygnięcia (YouTube nie odpowiada) wpis idzie do `failed`. */
export const STALLED_YOUTUBE_GIVE_UP_HOURS = 24;

/** Wynik zapytania o stan sesji uploadu; null = nie udało się zapytać (sieć). */
export type UploadProbe = { status: number; videoId: string | null } | null;

export type StalledUploadDecision =
  /** Film jest na kanale — domknij wpis jako opublikowany. */
  | { action: "published"; videoId: string }
  /** Nie wiadomo (YouTube nie odpowiedział jednoznacznie) — sprawdź w kolejnym ticku. */
  | { action: "wait" }
  /** Nic nie wyszło — wpis wraca do kolejki (albo `failed` po limicie prób). */
  | { action: "requeue"; reason: string }
  /** Nie da się rozstrzygnąć automatycznie — `failed` z opisem, decyzja ręczna. */
  | { action: "fail"; reason: string };

/** Id filmu z odpowiedzi zakończonej sesji uploadu (`{ id: "..." }`). */
export function videoIdFromUploadResponse(json: unknown): string | null {
  const id = (json as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.trim() ? id : null;
}

export function decideStalledYoutubeUpload(input: {
  /** Czy wpis przejęto po wdrożeniu zapisu sesji (jest `upload_claimed_at`). */
  claimTracked: boolean;
  sessionUrl: string | null;
  probe: UploadProbe;
  /** Ile godzin wpis wisi w `uploading`. */
  stalledHours: number;
}): StalledUploadDecision {
  const { claimTracked, sessionUrl, probe, stalledHours } = input;
  if (!sessionUrl) {
    if (!claimTracked) {
      return {
        action: "fail",
        reason:
          "Upload przerwany (wpis sprzed automatycznego sprawdzania). Sprawdź kanał YouTube, " +
          "czy film nie wyszedł, i dopiero wtedy ponów (retry_youtube_queue_item).",
      };
    }
    return { action: "requeue", reason: "przebieg przerwany przed rozpoczęciem uploadu" };
  }
  if (probe && (probe.status === 200 || probe.status === 201) && probe.videoId) {
    return { action: "published", videoId: probe.videoId };
  }
  if (probe && probe.status === 308) {
    return {
      action: "requeue",
      reason: "upload przerwany w trakcie (YouTube nie dostał całego pliku)",
    };
  }
  if (probe && (probe.status === 404 || probe.status === 410)) {
    return { action: "requeue", reason: "sesja uploadu wygasła bez filmu na kanale" };
  }
  if (stalledHours >= STALLED_YOUTUBE_GIVE_UP_HOURS) {
    return {
      action: "fail",
      reason:
        `Upload zawieszony ponad ${STALLED_YOUTUBE_GIVE_UP_HOURS} h, YouTube nie potwierdził stanu ` +
        `(ostatnio: ${probe ? `HTTP ${probe.status}` : "brak odpowiedzi"}). Sprawdź kanał i dopiero ` +
        "wtedy ponów (retry_youtube_queue_item).",
    };
  }
  return { action: "wait" };
}
