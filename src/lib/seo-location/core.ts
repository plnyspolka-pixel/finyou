// Programmatic SEO — czysta logika generowania treści podstron lokalizacyjnych
// /pozyczki/[slug]. Bez dostępu do bazy (testowalna): dane wejściowe to gotowe
// rekordy geo_units + geo_unit_location_metrics, wyjście to jsonb `content`
// zapisywany w seo_location_pages.
//
// Zasady (prompt SEO §MODUŁ 1 + twarde ograniczenia):
//  * Strona powstaje TYLKO gdy są dane — brak metryk = brak strony (bez
//    fabrykowania liczb). Walidację robi buildLocationPage (zwraca null).
//  * Warianty sekcji wybierane deterministycznie z TERYT (ta sama gmina zawsze
//    dostaje tę samą wersję → stabilny content_hash), ale różne gminy dostają
//    różne kombinacje wariantów → strony nie są near-duplicate.
//  * Jedyne liczby w treści pochodzą z naszych tabel referencyjnych.
//  * Zero obietnic niezgodnych z prawem („gwarantowana pożyczka" itp.).

export interface GeoUnitInput {
  id: string;
  teryt: string;
  name: string;
  unit_type: string;
  parent_teryt: string | null;
  population: number | null;
  area_km2: number | null;
  degurba: number | null;
  is_city_above_30k: boolean;
  is_city_above_100k: boolean;
  is_city_above_250k: boolean;
  data_version: string;
}

export interface GeoMetricsInput {
  teryt: string;
  population_within_10km: number;
  population_within_25km: number;
  population_within_45km: number;
  density_per_km2: number;
  is_urban_cluster: boolean;
  fua_role: "core" | "commuting_zone" | "none";
  base_location_attractiveness: number | null;
  data_version: string;
}

export interface NearbyLink {
  slug: string;
  name: string;
}

export interface LocationFaq {
  question: string;
  answer: string;
}

export interface LocationPageContent {
  city: string;
  intro: string[];
  market: {
    heading: string;
    paragraphs: string[];
    stats: Array<{ label: string; value: string }>;
  };
  how: {
    heading: string;
    steps: Array<{ title: string; text: string }>;
  };
  faq: LocationFaq[];
  nearby: NearbyLink[];
  dataVersion: string;
}

export interface LocationPageDraft {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  content: LocationPageContent;
  contentHash: string;
}

// ── Pomocnicze ───────────────────────────────────────────────────────────────

const PL_MAP: Record<string, string> = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
  Ą: "a",
  Ć: "c",
  Ę: "e",
  Ł: "l",
  Ń: "n",
  Ó: "o",
  Ś: "s",
  Ź: "z",
  Ż: "z",
};

export function slugifyCity(name: string): string {
  return name
    .trim()
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => PL_MAP[ch] ?? ch)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Format liczby po polsku (spacja jako separator tysięcy). */
export function formatPl(n: number): string {
  const rounded = Math.round(n);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Oficjalne kody TERYT województw (stałe słownikowe, nie dane statystyczne). */
export const VOIVODESHIP_NAMES: Record<string, string> = {
  "02": "dolnośląskie",
  "04": "kujawsko-pomorskie",
  "06": "lubelskie",
  "08": "lubuskie",
  "10": "łódzkie",
  "12": "małopolskie",
  "14": "mazowieckie",
  "16": "opolskie",
  "18": "podkarpackie",
  "20": "podlaskie",
  "22": "pomorskie",
  "24": "śląskie",
  "26": "świętokrzyskie",
  "28": "warmińsko-mazurskie",
  "30": "wielkopolskie",
  "32": "zachodniopomorskie",
};

/** Deterministyczny hash (FNV-1a 32-bit) — wybór wariantów i content_hash. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function contentHashOf(content: unknown): string {
  const json = JSON.stringify(content);
  // Dwa przebiegi FNV z różnymi solami — wystarczające do detekcji zmian treści.
  return `${fnv1a(json).toString(16)}${fnv1a(`salt:${json}`).toString(16)}`;
}

function pick<T>(variants: T[], seed: number, sectionSalt: string): T {
  const idx = fnv1a(`${sectionSalt}:${seed}`) % variants.length;
  return variants[idx];
}

// Odmiana „w Krakowie" jest ryzykowna automatycznie — używamy bezpiecznych
// konstrukcji bez odmiany: „w mieście Kraków", „na terenie gminy Kraków",
// „Kraków i okolice".

// ── Meta title / description ────────────────────────────────────────────────

export function buildMetaTitle(city: string): string {
  const variants = [
    `Pożyczka pod zastaw nieruchomości ${city} | Finance You`,
    `Pożyczka pod zastaw — ${city} | Finance You`,
    `Pożyczka pod zastaw — ${city}`,
  ];
  for (const t of variants) {
    if (t.length <= 60) return t;
  }
  // Skrajnie długa nazwa — przycięcie ostatniego wariantu.
  return variants[variants.length - 1].slice(0, 60);
}

export function buildMetaDescription(city: string, m: GeoMetricsInput): string {
  return (
    `Pożyczka pod zastaw nieruchomości — ${city} i okolice. ` +
    `W promieniu 25 km mieszka ${formatPl(m.population_within_25km)} osób. ` +
    `Finansowanie prywatne do 1 mln zł, decyzja w 24 h. Złóż bezpłatny wniosek online.`
  );
}

// ── Sekcje treści ───────────────────────────────────────────────────────────

function introVariants(city: string, u: GeoUnitInput, m: GeoMetricsInput): string[][] {
  const pop = u.population ? formatPl(u.population) : null;
  const size = u.is_city_above_250k
    ? "jednym z największych miast w Polsce"
    : u.is_city_above_100k
      ? "dużym miastem regionalnym"
      : u.is_city_above_30k
        ? "miastem średniej wielkości"
        : "lokalnym ośrodkiem";
  const popSentence = pop
    ? ` Miasto zamieszkuje ${pop} osób, a w promieniu 45 km — ${formatPl(m.population_within_45km)}.`
    : "";
  return [
    [
      `Szukasz finansowania pod zabezpieczenie nieruchomości położonej na terenie miasta ${city}? ` +
        `Finance You łączy właścicieli nieruchomości z prywatnymi inwestorami w całej Polsce — również w Twojej okolicy. ` +
        `${city} jest ${size}, co dla finansujących oznacza płynny lokalny rynek nieruchomości.${popSentence}`,
      `Wniosek składasz online i bezpłatnie. Liczy się przede wszystkim wartość i położenie nieruchomości, a nie sam scoring bankowy.`,
    ],
    [
      `Pożyczka pod zastaw nieruchomości to sposób na szybkie finansowanie bez procedur bankowych — także dla właścicieli nieruchomości z lokalizacji ${city}. ` +
        `${city} jest ${size}, a lokalizacja zabezpieczenia ma bezpośredni wpływ na warunki, jakie zaproponują inwestorzy.${popSentence}`,
      `Przez Finance You jedno zgłoszenie trafia do wielu prywatnych inwestorów. Decyzje zapadają zwykle w ciągu 24 godzin od skompletowania dokumentów.`,
    ],
    [
      `Właściciele mieszkań, domów i działek w okolicy: ${city} mogą pozyskać finansowanie prywatne zabezpieczone hipoteką — do 1 mln zł. ` +
        `${city} jest ${size}; dla inwestora finansującego oznacza to przewidywalną wartość zabezpieczenia.${popSentence}`,
      `Zgłoszenie w Finance You jest bezpłatne i niezobowiązujące — po analizie nieruchomości otrzymujesz propozycje od zainteresowanych inwestorów.`,
    ],
  ];
}

function marketSection(city: string, u: GeoUnitInput, m: GeoMetricsInput, seed: number) {
  const headings = [
    `Rynek nieruchomości — ${city} w liczbach`,
    `${city}: dane o lokalizacji zabezpieczenia`,
    `Dlaczego lokalizacja ma znaczenie — dane dla miasta ${city}`,
  ];
  const stats: Array<{ label: string; value: string }> = [];
  if (u.population) stats.push({ label: "Liczba mieszkańców", value: formatPl(u.population) });
  if (u.area_km2)
    stats.push({ label: "Powierzchnia", value: `${formatPl(Number(u.area_km2))} km²` });
  stats.push(
    { label: "Ludność w promieniu 10 km", value: formatPl(m.population_within_10km) },
    { label: "Ludność w promieniu 25 km", value: formatPl(m.population_within_25km) },
    { label: "Ludność w promieniu 45 km", value: formatPl(m.population_within_45km) },
    { label: "Gęstość zaludnienia", value: `${formatPl(Number(m.density_per_km2))} os./km²` },
  );

  const fuaText =
    m.fua_role === "core"
      ? `${city} stanowi rdzeń funkcjonalnego obszaru miejskiego — nieruchomości w takich lokalizacjach cechuje najwyższa płynność na rynku wtórnym.`
      : m.fua_role === "commuting_zone"
        ? `${city} leży w strefie dojazdów dużego ośrodka miejskiego, co podtrzymuje popyt na lokalne nieruchomości.`
        : m.is_urban_cluster
          ? `${city} tworzy zwarty klaster miejski — zabudowa i infrastruktura sprzyjają utrzymaniu wartości nieruchomości.`
          : `${city} to lokalny rynek nieruchomości — w wycenie zabezpieczenia większą wagę mają cechy konkretnej nieruchomości.`;

  const paragraphs = [
    pick(
      [
        `Dla prywatnego inwestora finansującego pożyczkę kluczowa jest zbywalność zabezpieczenia. ` +
          `W promieniu 25 km od miasta ${city} mieszka ${formatPl(m.population_within_25km)} osób — to realny popyt na lokalnym rynku nieruchomości. ${fuaText}`,
        `Im większy lokalny rynek, tym łatwiej o korzystne warunki finansowania. ` +
          `Zasięg 45 km wokół miasta ${city} obejmuje ${formatPl(m.population_within_45km)} mieszkańców. ${fuaText}`,
      ],
      seed,
      "market-p",
    ),
    `Dane pochodzą z opracowań statystycznych GUS/TERYT (wersja danych: ${m.data_version}) i służą wyłącznie celom informacyjnym — nie są wyceną nieruchomości.`,
  ];

  return { heading: pick(headings, seed, "market-h"), paragraphs, stats };
}

function howSection(city: string, seed: number) {
  const headings = [
    "Jak działa pożyczka pod zastaw nieruchomości?",
    "Proces finansowania krok po kroku",
    "Od wniosku do wypłaty — jak to przebiega",
  ];
  const steps = [
    {
      title: "Bezpłatny wniosek online",
      text:
        `Opisujesz nieruchomość (mieszkanie, dom lub działkę) w okolicy: ${city}, oczekiwaną kwotę i okres. ` +
        `Zgłoszenie nie zobowiązuje do zawarcia umowy.`,
    },
    {
      title: "Analiza nieruchomości i księgi wieczystej",
      text:
        "Weryfikujemy stan prawny w księdze wieczystej oraz wartość i zbywalność nieruchomości. " +
        "To na tej podstawie inwestorzy oceniają sprawę — nie na samym scoringu bankowym.",
    },
    {
      title: "Propozycje od prywatnych inwestorów",
      text: "Jedno zgłoszenie trafia do wielu finansujących. Otrzymujesz konkretne propozycje warunków: kwotę, okres i koszty.",
    },
    {
      title: "Umowa i zabezpieczenie hipoteczne",
      text: "Umowa pożyczki zawierana jest z zabezpieczeniem hipotecznym (akt notarialny). Środki trafiają na Twoje konto po ustanowieniu zabezpieczenia.",
    },
  ];
  return { heading: pick(headings, seed, "how-h"), steps };
}

function faqPool(city: string, u: GeoUnitInput, m: GeoMetricsInput): LocationFaq[] {
  return [
    {
      question: `Czy mogę dostać pożyczkę pod zastaw mieszkania w lokalizacji ${city}?`,
      answer:
        `Tak — finansowanie dotyczy mieszkań, domów i działek położonych na terenie miasta ${city} i w okolicy. ` +
        `O warunkach decyduje przede wszystkim wartość i stan prawny nieruchomości.`,
    },
    {
      question: "Jaką kwotę pożyczki mogę uzyskać?",
      answer:
        "Typowo do ok. 50–60% wartości nieruchomości, maksymalnie 1 mln zł. Ostateczna kwota zależy od wyceny i propozycji konkretnego inwestora.",
    },
    {
      question: "Jak szybko otrzymam decyzję?",
      answer:
        "Pierwsze propozycje pojawiają się zwykle w ciągu 24 godzin od skompletowania dokumentów. Wypłata następuje po podpisaniu umowy i ustanowieniu zabezpieczenia.",
    },
    {
      question: "Czy zła historia kredytowa (BIK) przekreśla szanse?",
      answer:
        "Nie musi. Dla inwestorów prywatnych kluczowe jest zabezpieczenie na nieruchomości, a nie wyłącznie scoring — każda sprawa oceniana jest indywidualnie. Wpisy w rejestrach nie oznaczają automatycznej odmowy ani automatycznej zgody.",
    },
    {
      question: `Czy lokalizacja ${city} wpływa na warunki pożyczki?`,
      answer: `Tak. W promieniu 25 km od miasta ${city} mieszka ${formatPl(m.population_within_25km)} osób — im większy lokalny rynek nieruchomości, tym łatwiej o finansowanie i lepsze warunki.`,
    },
    {
      question: "Jakie dokumenty są potrzebne?",
      answer:
        "Numer księgi wieczystej, podstawowe informacje o nieruchomości oraz dokument tożsamości. W dalszym kroku mogą być potrzebne dokumenty potwierdzające wartość nieruchomości.",
    },
    {
      question: "Czy wcześniejsza spłata jest możliwa?",
      answer:
        "Tak, warunki wcześniejszej spłaty ustalane są w umowie z inwestorem. Warto zwrócić na nie uwagę przed podpisaniem.",
    },
    {
      question: "Ile kosztuje złożenie wniosku?",
      answer:
        "Zgłoszenie w Finance You jest bezpłatne i niezobowiązujące. Koszty pożyczki poznasz w konkretnych propozycjach inwestorów — przed podjęciem decyzji.",
    },
    {
      question: "Czy pożyczka wymaga wyprowadzki z nieruchomości?",
      answer:
        "Nie. Zabezpieczeniem jest hipoteka wpisana do księgi wieczystej — pozostajesz właścicielem i użytkownikiem nieruchomości, spłacając pożyczkę zgodnie z umową.",
    },
  ];
}

function pickFaqs(pool: LocationFaq[], seed: number, count: number): LocationFaq[] {
  // Deterministyczna rotacja: start i krok zależne od seeda — różne miasta
  // dostają różne podzbiory i kolejność pytań, to samo miasto zawsze te same.
  const start = fnv1a(`faq:${seed}`) % pool.length;
  const step = (fnv1a(`faq-step:${seed}`) % 2) + 1; // 1 lub 2
  const out: LocationFaq[] = [];
  const seen = new Set<number>();
  for (let i = 0; out.length < count && i < pool.length * 2; i++) {
    const idx = (start + i * step) % pool.length;
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(pool[idx]);
  }
  return out;
}

// ── Główny builder ──────────────────────────────────────────────────────────

/**
 * Buduje kompletną podstronę lokalizacyjną. Zwraca null, gdy brakuje danych
 * (brak metryk lub populacji) — strona wtedy NIE powstaje (zasada: żadnego
 * fabrykowania danych).
 */
export function buildLocationPage(
  unit: GeoUnitInput,
  metrics: GeoMetricsInput | null | undefined,
  nearby: NearbyLink[],
): LocationPageDraft | null {
  if (!metrics) return null;
  if (!unit.name?.trim()) return null;
  if (
    !(metrics.population_within_25km > 0) ||
    !(metrics.population_within_45km > 0) ||
    !(Number(metrics.density_per_km2) > 0)
  ) {
    return null;
  }

  const city = unit.name.trim();
  const seed = fnv1a(unit.teryt);

  const content: LocationPageContent = {
    city,
    intro: pick(introVariants(city, unit, metrics), seed, "intro"),
    market: marketSection(city, unit, metrics, seed),
    how: howSection(city, seed),
    faq: pickFaqs(faqPool(city, unit, metrics), seed, 6),
    nearby: nearby.slice(0, 8),
    dataVersion: metrics.data_version,
  };

  return {
    slug: slugifyCity(city),
    metaTitle: buildMetaTitle(city),
    metaDescription: buildMetaDescription(city, metrics),
    content,
    contentHash: contentHashOf(content),
  };
}
