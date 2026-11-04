// Produkty sklepu panelu inwestora (/inwestor/sklep) — jedno źródło prawdy
// dla strony, koszyka, wyceny po stronie serwera i sprawdzania uprawnień.
//
// Decyzja właściciela 04.11.2026 (wieczór): publicznego sklepu /sklep nie ma
// (301 → /inwestor/sklep). Sklep panelu sprzedaje WYŁĄCZNIE:
//  • pojedyncze lekcje Akademii (149 zł; lekcja 1 bezpłatna) — item_kind
//    "lesson", item_id = uuid training_videos,
//  • „Pełna mapa szans i zagrożeń — analiza finansowa pożyczki" (HIT, 9,99 zł):
//    pełny kalkulator compliance w panelu (/inwestor/kalkulator) na 30 dni;
//    item_kind "course", item_id "kalkulator:<unikalny sufiks>" — każda tura to
//    osobne uprawnienie, okres liczymy z paid_at opłaconych zamówień,
//  • raport analityczny jednej księgi wieczystej (99 zł) — item_kind "kw".
//
// WYCOFANE ze sprzedaży (priceItems je odrzuca), ale opłacone wcześniej
// uprawnienia nadal działają (assertEntitled, managementModuleActive):
//  • moduły Akademii (item_id "module-<n>") i pakiet „cała Akademia" ("academy")
//    — ACADEMY_MODULES zostaje jako grupowanie lekcji w katalogu,
//  • Centrum Zarządzania (item_id "centrum:<sufiks>", tury po 30 dni).

/** Pojedyncza lekcja Akademii (lekcja 1 bezpłatna). */
export const ACADEMY_LESSON_PRICE_PLN = 149;
/** Długość jednej opłaconej tury Centrum Zarządzania (produkt wycofany; okresy liczone dla dawnych zakupów). */
export const MANAGEMENT_MODULE_DAYS = 30;
/** Raport analityczny jednej księgi wieczystej (/inwestor/sklep#raport-kw, /dla-inwestora/analityk-ai#raport-kw). */
export const KW_REPORT_PRICE_PLN = 99;

/** Tytuł lekcji bez numeru porządkowego („7. Interpretacja…” → „Interpretacja…”). */
export const cleanLessonTitle = (t: string) => t.replace(/^\s*\d{1,2}\s*[.)]\s*/, "");

/** „ok. 35 min” / „1 h 10 min”; null, gdy nagranie nie ma czasu w bazie (training_videos.duration_seconds). */
export function formatLessonDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `ok. ${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** HIT: pełna mapa szans i zagrożeń — kalkulator compliance na 30 dni. */
export const CALCULATOR_UNLOCK_PRICE_GROSZ = 999;
export const CALCULATOR_UNLOCK_PRICE_LABEL = "9,99 zł";
export const CALCULATOR_UNLOCK_DAYS = 30;
export const CALCULATOR_CART_ID = "mapa-szans-30d";
export const CALCULATOR_ITEM_PREFIX = "kalkulator:";
export const CALCULATOR_UNLOCK_TITLE = "Pełna mapa szans i zagrożeń — analiza finansowa pożyczki";
/** Ścieżka panelu, którą otwiera sam produkt HIT (bez Centrum Zarządzania i abonamentu). */
export const CALCULATOR_PATH = "/inwestor/kalkulator";

export function isCalculatorPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === CALCULATOR_PATH || p.startsWith(`${CALCULATOR_PATH}/`);
}

/** Prefiks item_id uprawnienia Centrum Zarządzania w store_entitlements (produkt wycofany). */
export const MANAGEMENT_ITEM_PREFIX = "centrum:";

export interface AcademyModule {
  number: number;
  /** item_id w store_entitlements (item_kind "course"). */
  id: string;
  title: string;
  image: string;
  /** Zakres numerów lekcji (numeracja katalogu, od 1). `to = null` — do końca. */
  from: number;
  to: number | null;
  topics: string[];
}

export const ACADEMY_MODULES: AcademyModule[] = [
  {
    number: 1, id: "module-1", title: "Wprowadzenie i strategia",
    image: "/marketing/akademia/modul-1.png", from: 1, to: 5,
    topics: ["Rynek pożyczek pod hipotekę", "Zarabianie na pożyczkach", "Strategie inwestycyjne", "Pośrednictwo inwestycyjne", "Pozyskiwanie klientów"],
  },
  {
    number: 2, id: "module-2", title: "Prawo",
    image: "/marketing/akademia/modul-2.png", from: 6, to: 9,
    topics: ["Aspekty prawne udzielania pożyczek", "Wyłączenia z ustawy o kredycie konsumenckim", "Art. 304 Kodeksu karnego", "Lichwa — przepisy i orzecznictwo"],
  },
  {
    number: 3, id: "module-3", title: "Operacje",
    image: "/marketing/akademia/modul-3.png", from: 10, to: 10,
    topics: ["Zarządzanie umowami i klientami w nieruchomościach"],
  },
  {
    number: 4, id: "module-4", title: "Analiza nieruchomości",
    image: "/marketing/akademia/modul-4.png", from: 11, to: 12,
    topics: ["Nieruchomość jako zabezpieczenie pożyczki", "Różnice w rodzajach nieruchomości"],
  },
  {
    number: 5, id: "module-5", title: "Analiza klienta",
    image: "/marketing/akademia/modul-5.png", from: 13, to: 13,
    topics: ["Analiza klientów i decyzji kredytowych"],
  },
  {
    number: 6, id: "module-6", title: "Case study",
    image: "/marketing/akademia/modul-6.png", from: 14, to: 19,
    topics: ["Mieszkanie w Świebodzicach", "Nieruchomość w Siemionce", "Nieruchomość w Lipinach", "Działka w Żelewie", "Działka w Strzyżewicach", "Lubań"],
  },
  {
    number: 7, id: "module-7", title: "Windykacja — miękka i twarda",
    image: "/marketing/akademia/modul-7.png", from: 20, to: null,
    topics: ["Kontakt i przypomnienia", "Negocjacje i ugody", "Wezwania i monity", "Egzekucja i zabezpieczenia"],
  },
];

/**
 * Moduł dla lekcji z katalogu (getPublicStoreCatalog). Lekcje Akademii mają
 * w tytule numer („7. Interpretacja…”) — on rozstrzyga. Lekcja bezpłatna bez
 * numeru to lekcja 1. Nagrania bez numeru (kategoria „inwestor”: umowy,
 * oferty, windykacja w praktyce) idą po sort_order: do 199 → Operacje (3),
 * od 200 → Windykacja (7). Gdy nic nie pasuje — po pozycji w katalogu.
 */
export function academyModuleForCatalogLesson(l: {
  number: number;
  title: string;
  free?: boolean;
  sortOrder?: number | null;
}): AcademyModule | null {
  const m = /^\s*(\d{1,2})\s*[.)]/.exec(l.title);
  if (m) return academyModuleForLesson(Number(m[1]));
  if (l.free) return academyModuleForLesson(1);
  if (typeof l.sortOrder === "number") return academyModuleForLesson(l.sortOrder >= 200 ? 20 : 10);
  return academyModuleForLesson(l.number);
}

export function academyModuleById(id: string): AcademyModule | null {
  return ACADEMY_MODULES.find((m) => m.id === id) ?? null;
}

/** Moduł, do którego należy lekcja o danym numerze katalogu (od 1). */
export function academyModuleForLesson(lessonNumber: number): AcademyModule | null {
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1) return null;
  return ACADEMY_MODULES.find((m) => lessonNumber >= m.from && (m.to === null || lessonNumber <= m.to)) ?? null;
}

/** Ścieżki panelu inwestora otwierane przez aktywny (dawniej opłacony) okres Centrum Zarządzania. */
export const MANAGEMENT_MODULE_PATHS = [
  "/inwestor/kreator-dokumentow",
  "/inwestor/podpisy",
  "/inwestor/aml",
  "/inwestor/kalkulator",
] as const;

export function isManagementModulePath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return MANAGEMENT_MODULE_PATHS.some((f) => p === f || p.startsWith(`${f}/`));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Koniec okresu Centrum Zarządzania z opłaconych tur (każda = 30 dni).
 * Tury się sumują: opłacenie w trakcie okresu przedłuża go od bieżącego końca
 * (jak computeGrantWindow abonamentu). Zwraca null, gdy nic nie opłacono.
 */
export function managementActiveUntil(paidAt: Array<string | Date>, days = MANAGEMENT_MODULE_DAYS): Date | null {
  const times = paidAt
    .map((d) => new Date(d).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  let until: number | null = null;
  for (const t of times) {
    const base: number = until !== null && until > t ? until : t;
    until = base + days * DAY_MS;
  }
  return until === null ? null : new Date(until);
}
