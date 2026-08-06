// Klasyfikacja błędów Meta Graph API (Studio publikacji: FB post / FB Reels /
// IG Reels). Czysta logika — bez sieci i bazy, żeby dało się ją przetestować.
//
// Po co: kody #4 („Application request limit reached"), #17, #32, #341 i #613
// to CHWILOWE limity zapytań. Traktowanie ich jak zwykłej porażki zjadało
// próby publikacji i kasowało gotowy kontener IG — kolejny przebieg tworzył
// kontener od zera i tym mocniej dobijał limit (spirala: „Instagram nie łapie
// uploadu"). Takie błędy odkładamy w czasie, bez zużywania prób i bez
// kasowania kontenera.

export type GraphErrorInfo = {
  /** Kod błędu Meta (error.code) — null, gdy odpowiedź go nie miała. */
  code: number | null;
  /** Podkod (error.error_subcode) — dla IG niesie konkretną przyczynę. */
  subcode: number | null;
  /** Status HTTP (0 = błąd sieci / brak odpowiedzi). */
  httpStatus: number;
  /** Oryginalny komunikat Meta. */
  message: string;
  /** Można ponowić bez zużywania próby (limit, chwilowa awaria, sieć). */
  transient: boolean;
  /** Limit zapytań — warto wstrzymać cały przebieg, nie tylko ten wpis. */
  rateLimited: boolean;
  /** Problem z tokenem/uprawnieniami — ponawianie nic nie da. */
  authProblem: boolean;
  /** Sugestia Meta z nagłówków (minuty do odzyskania dostępu). */
  retryAfterMin: number | null;
  /** Komunikat po polsku do panelu (z oryginałem w nawiasie). */
  friendly: string;
};

// Chwilowe: limity zapytań + „API Unknown/Service" (typowe przy przeciążeniu).
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 341, 613]);
// IG: nieznany błąd uploadu / błąd transkodowania — Meta zaleca ponowienie.
const TRANSIENT_SUBCODES = new Set([2207051, 2207052, 2207053]);
// Token / uprawnienia — ponawianie nie pomoże, trzeba odnowić sekret.
const AUTH_CODES = new Set([3, 10, 102, 190, 200, 803]);

const CODE_MESSAGES: Record<number, string> = {
  1: "Meta zwróciła nieokreślony błąd API (kod 1).",
  2: "Chwilowa awaria po stronie Meta (kod 2).",
  4: "Limit zapytań aplikacji w Meta (kod 4).",
  17: "Limit zapytań użytkownika w Meta (kod 17).",
  32: "Limit zapytań strony w Meta (kod 32).",
  341: "Chwilowy limit aplikacji w Meta (kod 341).",
  613: "Przekroczony limit zapytań na sekundę (kod 613).",
  190: "Token Meta wygasł lub został unieważniony (kod 190).",
  200: "Token Meta nie ma wymaganych uprawnień (kod 200).",
  10: "Aplikacja nie ma uprawnień do tej operacji (kod 10).",
  3: "Metoda niedostępna dla tej aplikacji (kod 3).",
  102: "Sesja Meta wygasła (kod 102).",
  803: "Meta nie znalazła obiektu o podanym id (kod 803).",
  100: "Meta odrzuciła parametry żądania (kod 100).",
  368: "Konto tymczasowo zablokowane przez Meta za naruszenie zasad (kod 368).",
};

const SUBCODE_MESSAGES: Record<number, string> = {
  2207003: "Instagram nie pobrał pliku wideo z podanego URL.",
  2207004: "Instagram nie pobrał pliku — URL musi być publiczny i trwały.",
  2207020: "Instagram odrzucił format wideo (wymagany MP4/MOV, pion 9:16).",
  2207026: "Nieobsługiwany format wideo dla Reels (MP4 H.264 + AAC, 3 s – 15 min).",
  2207032: "Instagram nie utworzył kontenera mediów.",
  2207051: "Chwilowy błąd uploadu po stronie Instagrama.",
  2207052: "Chwilowy błąd transkodowania po stronie Instagrama.",
  2207053: "Chwilowy błąd przetwarzania po stronie Instagrama.",
  2207057: "Wideo przekracza dozwoloną długość Reels (15 minut).",
  9007: "To wideo zostało już opublikowane na Instagramie.",
};

export const BASE_RETRY_MIN = 15;
export const MAX_RETRY_MIN = 360;
/** Limity Meta resetują się w oknie godzinowym — nie warto pukać wcześniej. */
export const RATE_LIMIT_MIN_DELAY_MIN = 60;

function toNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Nagłówki zużycia limitów Meta → ile minut czekać.
 * `x-business-use-case-usage` / `x-ad-account-usage` niosą
 * `estimated_time_to_regain_access` (minuty); `x-app-usage` tylko procenty —
 * przy ≥ 95% zakładamy pełną godzinę przerwy.
 */
export function parseUsageRetryMinutes(
  headers: Headers | Record<string, string | null | undefined>,
): number | null {
  const get = (name: string): string | null => {
    if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name);
    const rec = headers as Record<string, string | null | undefined>;
    return rec[name] ?? rec[name.toLowerCase()] ?? null;
  };

  // Deklaracja Meta („za tyle minut odzyskasz dostęp") jest wiążąca;
  // odczyt procentowego zużycia to tylko fallback, gdy deklaracji nie ma.
  let declared: number | null = null;
  let guessed: number | null = null;
  const bumpDeclared = (v: number | null) => {
    if (v != null && v > 0) declared = Math.max(declared ?? 0, v);
  };

  const retryAfter = Number(get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) bumpDeclared(Math.ceil(retryAfter / 60));

  for (const header of ["x-business-use-case-usage", "x-ad-account-usage", "x-app-usage"]) {
    const raw = get(header);
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const entry of collectUsageEntries(parsed)) {
      const est = toNumber(entry.estimated_time_to_regain_access);
      if (est != null && est > 0) {
        bumpDeclared(est);
        continue;
      }
      const usage = Math.max(
        toNumber(entry.call_count) ?? 0,
        toNumber(entry.total_cputime) ?? 0,
        toNumber(entry.total_time) ?? 0,
      );
      if (usage >= 95) guessed = Math.max(guessed ?? 0, RATE_LIMIT_MIN_DELAY_MIN);
    }
  }
  return declared ?? guessed;
}

/** Nagłówki Meta bywają płaskie (`x-app-usage`) albo zagnieżdżone w tablicach
 *  pod id konta (`x-business-use-case-usage`) — wyciągamy wszystkie wpisy. */
function collectUsageEntries(parsed: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 3 || parsed == null) return [];
  if (Array.isArray(parsed)) return parsed.flatMap((v) => collectUsageEntries(v, depth + 1));
  if (typeof parsed !== "object") return [];
  const entry = parsed as Record<string, unknown>;
  const isUsage = [
    "estimated_time_to_regain_access",
    "call_count",
    "total_cputime",
    "total_time",
  ].some((k) => k in entry);
  if (isUsage) return [entry];
  return Object.values(entry).flatMap((v) => collectUsageEntries(v, depth + 1));
}

export function classifyGraphError(input: {
  httpStatus: number;
  code?: number | null;
  subcode?: number | null;
  message?: string | null;
  retryAfterMinutes?: number | null;
}): GraphErrorInfo {
  const code = toNumber(input.code);
  const subcode = toNumber(input.subcode);
  const httpStatus = input.httpStatus;
  const message = (input.message ?? "").trim() || `HTTP ${httpStatus}`;

  const rateLimited =
    (code != null && RATE_LIMIT_CODES.has(code)) ||
    httpStatus === 429 ||
    /request limit reached|calls per second|rate limit/i.test(message);
  const transient =
    rateLimited ||
    (code != null && TRANSIENT_CODES.has(code)) ||
    (subcode != null && TRANSIENT_SUBCODES.has(subcode)) ||
    httpStatus === 0 ||
    httpStatus >= 500;
  const authProblem = !transient && code != null && AUTH_CODES.has(code);

  const head =
    (subcode != null ? SUBCODE_MESSAGES[subcode] : undefined) ??
    (code != null ? CODE_MESSAGES[code] : undefined) ??
    (httpStatus === 0
      ? "Nie udało się połączyć z Meta."
      : `Meta odrzuciła żądanie (HTTP ${httpStatus}).`);

  const tail = authProblem
    ? " Odnów META_PAGE_ACCESS_TOKEN (uprawnienia: instagram_basic, instagram_content_publish)."
    : transient
      ? " Ponowimy automatycznie — próba nie została zużyta."
      : "";

  return {
    code,
    subcode,
    httpStatus,
    message,
    transient,
    rateLimited,
    authProblem,
    retryAfterMin: toNumber(input.retryAfterMinutes),
    friendly: `${head}${tail} [Meta: ${message}]`,
  };
}

/**
 * Odstęp do kolejnej próby: wykładniczo od liczby dotychczasowych prób,
 * z podłogą godziny dla limitów zapytań i respektem dla sugestii Meta.
 */
export function retryDelayMinutes(
  attemptCount: number,
  info?: Pick<GraphErrorInfo, "rateLimited" | "retryAfterMin">,
): number {
  const attempts = Math.max(0, Math.floor(attemptCount));
  let delay = Math.min(BASE_RETRY_MIN * 2 ** attempts, MAX_RETRY_MIN);
  if (info?.rateLimited) delay = Math.max(delay, RATE_LIMIT_MIN_DELAY_MIN);
  if (info?.retryAfterMin != null && info.retryAfterMin > 0) {
    // Meta sama mówi, kiedy odzyska się dostęp — dokładamy minutę zapasu.
    return Math.max(delay, Math.ceil(info.retryAfterMin) + 1);
  }
  return delay;
}

/** „za 90 min (14:35)" — czytelna informacja o kolejnej próbie w panelu. */
export function formatNextAttempt(nextAt: Date, minutes: number): string {
  const hh = String(nextAt.getUTCHours()).padStart(2, "0");
  const mm = String(nextAt.getUTCMinutes()).padStart(2, "0");
  return `Kolejna próba za ${minutes} min (${hh}:${mm} UTC).`;
}
