// Kompresja wideo przed publikacją — czysta logika decyzyjna (bez I/O,
// testowalna). Strona serwerowa: src/lib/video-rendition.server.ts.
//
// PROBLEM: każda platforma ma inne limity (X: 512 MB, ale my buforujemy plik
// w pamięci workera i tniemy na 64 MB; TikTok / YouTube: 100 MB bufora;
// Instagram Reels: 1 GB i tylko określone kodeki), a materiały z biblioteki
// bywają nagrane telefonem (MOV/HEVC, 4K, 60 kl./s) albo mają setki MB.
// Publikacja takiego pliku kończy się „Plik za duży" albo odrzuceniem przez
// platformę po transkodowaniu — za późno, żeby coś poprawić.
//
// ROZWIĄZANIE: JEDEN „profil publikacji" (MP4 H.264/AAC, ≤ 1080p, ≤ 30 kl./s,
// ≤ 60 MB), do którego usługa FFmpeg (services/caption-burner, zadanie
// `transcode`) sprowadza każde wideo PRZED wysyłką na jakąkolwiek platformę.
// Wynik trafia do publicznego bucketu `studio-media` (`renditions/…`),
// a tabela `video_renditions` pamięta go per adres źródłowy, więc ten sam
// plik publikowany na cztery platformy kompresuje się raz. Plik już zgodny
// z profilem (typowa rolka z HeyGena) wraca jako `unchanged` — bez
// przekodowania i bez utraty jakości.
//
// Publikator pyta `ensurePublishableVideo(url)`: dostaje adres gotowego
// pliku albo wyjątek VideoPreparingError (wpis kolejki wraca na chwilę do
// `pending` BEZ zużycia próby). Gdy usługa nie jest skonfigurowana albo
// kompresja ostatecznie się nie uda, jedzie oryginał — jak do tej pory.

const MB = 1024 * 1024;

/**
 * Wersja profilu w nazwie: zmiana progów niżej = nowy profil = stare
 * renditions nie są brane za dobre.
 */
export const VIDEO_RENDITION_PROFILE = "social-v1";

/** Parametry profilu wysyłane do usługi (kształt z transcode-plan.mjs). */
export const VIDEO_RENDITION_TARGET = {
  /**
   * 60 MB: poniżej najciaśniejszego bufora (X: 64 MB) z zapasem na nagłówki.
   * Rolka 60 s w 1080p mieści się w tym z jakością 6 Mb/s; 3 minuty —
   * ~2,6 Mb/s; dłuższe materiały schodzą do 720p (drabina w usłudze).
   */
  max_bytes: 60 * MB,
  max_long_edge: 1920,
  max_short_edge: 1080,
  max_fps: 30,
  audio_kbps: 128,
  video_kbps_cap: 6000,
} as const;

/** Ile razy zlecamy kompresję, zanim odpuścimy i wyślemy oryginał. */
export const VIDEO_RENDITION_MAX_ATTEMPTS = 2;
/**
 * Ile czekamy na usługę (kolejka + kodowanie). Darmowy Render (0,1 vCPU)
 * potrafi kodować 3-minutowy film pół godziny; 2 h to bezpieczny sufit.
 */
export const VIDEO_RENDITION_TIMEOUT_MS = 120 * 60_000;
/** Po ilu minutach wpis kolejki próbuje ponownie, gdy wideo jest w przygotowaniu. */
export const VIDEO_PREPARING_RETRY_MIN = 5;

export type VideoRenditionStatus = "pending" | "processing" | "ready" | "failed";

export type VideoRenditionRowLike = {
  id: string;
  source_url: string;
  status: VideoRenditionStatus | string;
  job_id: string | null;
  job_started_at: string | null;
  attempt_count: number;
  unchanged: boolean;
  output_url: string | null;
  last_error: string | null;
};

/** Odpowiedź usługi o zadaniu (`missing` = usługa nie zna id, np. po restarcie). */
export type RenditionJobProbe = {
  status: "queued" | "processing" | "done" | "failed" | "missing";
  error: string | null;
  unchanged?: boolean;
  uploaded?: boolean;
  upload_error?: string | null;
  bytes?: number | null;
  /** Co usługa zrobiła z plikiem (np. „przekodowanie: kontener MOV, 4K…"). */
  note?: string | null;
};

export type VideoRenditionResolution =
  /** Gotowe — `url` to plik do publikacji (oryginał, gdy był zgodny z profilem). */
  | { state: "ready"; url: string; unchanged: boolean }
  /** Wpis czeka na zlecenie — wołający wysyła zadanie do usługi. */
  | { state: "submit" }
  /** Usługa pracuje (albo chwilowo nie odpowiada) — publikacja odroczona. */
  | { state: "waiting" }
  /** Usługa skończyła — plik jest już w Storage (`upload`) albo trzeba go pobrać (`download`). */
  | { state: "store"; via: "upload" | "download"; unchanged: boolean }
  /** Zlecenie od nowa (błąd, zaginione zadanie, przekroczony czas) — próby jeszcze są. */
  | { state: "retry"; reason: string }
  /** Odpuszczamy: publikacja oryginału z powodem w `last_error` renditionu. */
  | { state: "give_up"; reason: string };

/**
 * Decyduje, co zrobić z renditionem po odczycie wiersza (i — gdy trwa —
 * po odpytaniu usługi). Żaden stan nie zostawia wpisu w zawieszeniu: usługa
 * milczy dłużej niż limit → ponowienie; próby wyczerpane → oryginał.
 */
export function resolveVideoRendition(input: {
  row: VideoRenditionRowLike;
  /** null = usługa nie odpowiedziała (sieć, uśpiony kontener) albo nie było czego pytać. */
  probe: RenditionJobProbe | null;
  now: Date;
  timeoutMs?: number;
  maxAttempts?: number;
}): VideoRenditionResolution {
  const { row, probe, now } = input;
  const timeoutMs = input.timeoutMs ?? VIDEO_RENDITION_TIMEOUT_MS;
  const maxAttempts = input.maxAttempts ?? VIDEO_RENDITION_MAX_ATTEMPTS;
  const retryOrGiveUp = (reason: string): VideoRenditionResolution =>
    row.attempt_count < maxAttempts ? { state: "retry", reason } : { state: "give_up", reason };

  if (row.status === "ready") {
    return { state: "ready", url: row.output_url || row.source_url, unchanged: row.unchanged };
  }
  if (row.status === "failed") {
    // Wiersz „failed" to wynik wyczerpanych prób — chyba że ktoś (Ponów)
    // wyzerował licznik; wtedy próbujemy od nowa.
    return retryOrGiveUp(row.last_error ?? "kompresja nieudana");
  }
  if (row.status === "pending") return { state: "submit" };

  // processing
  if (!row.job_id) return retryOrGiveUp("brak id zadania w usłudze");
  const since = row.job_started_at ? Date.parse(row.job_started_at) : Number.NaN;
  const elapsed = Number.isNaN(since) ? 0 : now.getTime() - since;
  const timedOut = elapsed >= timeoutMs;

  if (!probe) {
    return timedOut
      ? retryOrGiveUp(`usługa nie odpowiada od ${Math.round(elapsed / 60_000)} min`)
      : { state: "waiting" };
  }
  if (probe.status === "done") {
    const unchanged = probe.unchanged === true;
    return { state: "store", via: unchanged || probe.uploaded ? "upload" : "download", unchanged };
  }
  if (probe.status === "queued" || probe.status === "processing") {
    return timedOut
      ? retryOrGiveUp(`usługa nie skończyła w ciągu ${Math.round(timeoutMs / 60_000)} min`)
      : { state: "waiting" };
  }
  const why = probe.error ?? (probe.status === "missing" ? "zadanie zaginęło" : "błąd usługi");
  return retryOrGiveUp(why);
}

// ── Ścieżki i adresy ────────────────────────────────────────────────────────

/** Katalog renditions w publicznym buckecie `studio-media`. */
export const VIDEO_RENDITION_DIR = "renditions";

/** Stała ścieżka wyniku w Storage: `renditions/<profil>/<id wiersza>.mp4`. */
export function renditionStoragePath(rowId: string, profile = VIDEO_RENDITION_PROFILE): string {
  return `${VIDEO_RENDITION_DIR}/${profile}/${rowId}.mp4`;
}

/**
 * Czy adres w ogóle kwalifikuje się do kompresji: publiczny https, który nie
 * jest już naszym renditionem (kompresowanie własnego wyniku = strata czasu).
 */
export function isRenditionCandidateUrl(url: string | null | undefined): url is string {
  if (!url || !/^https:\/\//i.test(url)) return false;
  return !url.includes(`/${VIDEO_RENDITION_DIR}/`);
}

/** Unikalne adresy wideo z wpisów kolejek, które jeszcze nie mają renditionu. */
export function renditionSourcesToDiscover(
  queuedUrls: readonly (string | null | undefined)[],
  knownSources: ReadonlySet<string>,
  limit = 20,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const url of queuedUrls) {
    if (!isRenditionCandidateUrl(url) || seen.has(url) || knownSources.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= limit) break;
  }
  return out;
}

// ── Komunikaty do panelu ────────────────────────────────────────────────────

const PREPARING_PREFIX = "Wideo w przygotowaniu";

export function formatMb(bytes: number): string {
  const mb = bytes / MB;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

/** Notatka do `last_error` wpisu kolejki, gdy publikacja czeka na kompresję. */
export function preparingNote(nextAt: Date, target = VIDEO_RENDITION_TARGET): string {
  const when = nextAt.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });
  return `${PREPARING_PREFIX} (kompresja do ${formatMb(target.max_bytes)}, MP4 H.264) — publikacja ruszy automatycznie, kolejne sprawdzenie o ${when}.`;
}

/** Panel: notatka o przygotowaniu to informacja, nie błąd — inny kolor. */
export function isVideoPreparingNote(text: string | null | undefined): boolean {
  return typeof text === "string" && text.startsWith(PREPARING_PREFIX);
}

/** Notatka, gdy kompresja się nie udała i jedzie oryginał. */
export function renditionGiveUpNote(reason: string): string {
  return `Kompresja wideo nieudana (${reason}) — wysyłam oryginalny plik.`;
}
