// Kategoria zbywalności (A–E) — GŁÓWNA oś scoringu łatwości sprzedaży.
// Klasyfikuje nieruchomość po potencjale szybkiej sprzedaży wynikającym z liczby
// mieszkańców miejscowości i położenia względem dużego miasta, w rozbiciu na typ:
//   A — mieszkanie w wielkim/dużym mieście (najpłynniejsze zabezpieczenie),
//   B — dom w dużym mieście lub w jego okolicach, mieszkanie w średnim mieście,
//   C — rynek powiatowy (miasto 20–50 tys.) lub bliskość średniego miasta; grunt rolny,
//   D — miejscowość <20 tys. bez zaplecza dużego miasta (trudno sprzedawalne),
//   E — lokalizacja peryferyjna (bardzo trudno sprzedawalne).
// Czysta, deterministyczna logika — testowalna bez sieci.

// Progi wielkości miejscowości (liczba mieszkańców).
export const METROPOLIS_POPULATION = 200_000; // „wielkie miasto"
export const LARGE_CITY_POPULATION = 100_000; // „duże miasto"
export const MEDIUM_CITY_POPULATION = 50_000; // „średnie miasto"
export const REASONABLE_POPULATION = 20_000; // próg rozsądnego rynku
// „W okolicach" miasta = w promieniu dojazdowym do codziennych migracji.
export const NEAR_CITY_KM = 25;

export type SellabilityCategory = "A" | "B" | "C" | "D" | "E";

export interface SellabilityCategoryResult {
  category: SellabilityCategory;
  /** Kotwica scoringu 0–100 — pozostałe sygnały korygują wynik wokół niej. */
  baseScore: number;
  /** Krótka etykieta do UI/karty oferty, np. „mieszkanie w dużym mieście". */
  label: string;
  /** Uzasadnienie klasyfikacji (dla analityka i karty oferty). */
  rationale: string;
}

export interface SellabilityCategoryInput {
  propertyType: string;
  localityPopulation: number | null;
  /** Najbliższe większe miasto (>50 tys.): populacja i odległość. */
  nearestCityPopulation: number | null;
  nearestCityDistanceKm: number | null;
  largeCityWithin50km: boolean;
}

export function categoryLabel(c: SellabilityCategory): string {
  switch (c) {
    case "A":
      return "A — bardzo łatwo zbywalna";
    case "B":
      return "B — łatwo zbywalna";
    case "C":
      return "C — umiarkowanie zbywalna";
    case "D":
      return "D — trudno zbywalna";
    case "E":
      return "E — bardzo trudno zbywalna";
  }
}

const CATEGORY_BASE: Record<SellabilityCategory, number> = {
  A: 86,
  B: 72,
  C: 56,
  D: 38,
  E: 22,
};

function fmtPop(n: number | null): string {
  return n != null ? `~${Math.round(n / 1000)} tys. mieszk.` : "liczba mieszkańców nieznana";
}

/**
 * Klasyfikacja zbywalności: typ nieruchomości × wielkość miejscowości × bliskość
 * dużego miasta. Mieszkanie w wielkim mieście → A; dom w okolicach dużego miasta → B.
 */
export function classifySellability(i: SellabilityCategoryInput): SellabilityCategoryResult {
  const type = (i.propertyType ?? "").toLowerCase();
  const pop = i.localityPopulation ?? 0;
  const popKnown = i.localityPopulation != null;
  const cityPop = i.nearestCityPopulation ?? 0;
  const cityKm = i.nearestCityDistanceKm;
  // „W okolicach dużego miasta": duże miasto (>100 tys.) w promieniu dojazdowym.
  const nearLargeCity =
    cityPop >= LARGE_CITY_POPULATION && cityKm != null && cityKm <= NEAR_CITY_KM;
  const nearMediumCity =
    cityPop >= MEDIUM_CITY_POPULATION && cityKm != null && cityKm <= NEAR_CITY_KM;
  // Peryferia tylko przy POTWIERDZONEJ dużej odległości — brak danych o
  // odległości nie może sam z siebie degradować do kategorii E.
  const peripheral = !i.largeCityWithin50km && cityKm != null && cityKm > 80;

  const done = (
    category: SellabilityCategory,
    label: string,
    rationale: string,
  ): SellabilityCategoryResult => ({
    category,
    baseScore: CATEGORY_BASE[category],
    label,
    rationale,
  });

  // Grunt rolny — odrębny, relatywnie płynny rynek (ceny GUS zł/ha); nie stosujemy
  // miejskich progów ludności. Bliskość rynku zbytu nieznacznie poprawia klasę.
  if (type === "grunt_rolny") {
    if (nearLargeCity)
      return done(
        "B",
        "grunt rolny przy dużym mieście",
        "Grunt rolny w zasięgu dużego miasta — płynny rynek rolny plus presja inwestycyjna.",
      );
    return done(
      "C",
      "grunt rolny",
      "Grunt rolny — rynek wyceniany wg cen GUS (zł/ha), relatywnie płynny niezależnie od wielkości miejscowości.",
    );
  }

  if (type === "mieszkanie") {
    if (pop >= LARGE_CITY_POPULATION)
      return done(
        "A",
        pop >= METROPOLIS_POPULATION
          ? "mieszkanie w wielkim mieście"
          : "mieszkanie w dużym mieście",
        `Mieszkanie w mieście ${fmtPop(i.localityPopulation)} — najszerszy krąg nabywców, szybka sprzedaż.`,
      );
    if (pop >= MEDIUM_CITY_POPULATION || nearLargeCity)
      return done(
        "B",
        nearLargeCity && pop < MEDIUM_CITY_POPULATION
          ? "mieszkanie w okolicach dużego miasta"
          : "mieszkanie w średnim mieście",
        nearLargeCity && pop < MEDIUM_CITY_POPULATION
          ? `Mieszkanie w zasięgu dojazdowym dużego miasta (${cityKm} km) — popyt zasilany migracją podmiejską.`
          : `Mieszkanie w mieście ${fmtPop(i.localityPopulation)} — stabilny lokalny popyt.`,
      );
    if (pop >= REASONABLE_POPULATION || nearMediumCity)
      return done(
        "C",
        "mieszkanie w mniejszym mieście",
        `Mieszkanie w miejscowości ${fmtPop(i.localityPopulation)} — rynek powiatowy, dłuższy czas sprzedaży.`,
      );
    if (peripheral && popKnown && pop < 5000)
      return done(
        "E",
        "mieszkanie w lokalizacji peryferyjnej",
        "Mała miejscowość bez zaplecza większego miasta — bardzo wąski krąg nabywców.",
      );
    return done(
      "D",
      "mieszkanie w małej miejscowości",
      `Miejscowość poniżej ${REASONABLE_POPULATION / 1000} tys. mieszkańców — ograniczona sprzedawalność.`,
    );
  }

  if (type === "dom") {
    if (pop >= METROPOLIS_POPULATION)
      return done(
        "A",
        "dom w wielkim mieście",
        `Dom w mieście ${fmtPop(i.localityPopulation)} — rzadka podaż przy bardzo szerokim popycie.`,
      );
    if (pop >= LARGE_CITY_POPULATION || nearLargeCity)
      return done(
        "B",
        pop >= LARGE_CITY_POPULATION ? "dom w dużym mieście" : "dom w okolicach dużego miasta",
        pop >= LARGE_CITY_POPULATION
          ? `Dom w mieście ${fmtPop(i.localityPopulation)} — szeroki krąg nabywców.`
          : `Dom w zasięgu dojazdowym dużego miasta (${cityKm} km) — silny popyt podmiejski.`,
      );
    if (pop >= MEDIUM_CITY_POPULATION || nearMediumCity)
      return done(
        "C",
        "dom przy średnim mieście",
        "Dom w średnim mieście lub jego okolicy — umiarkowany, lokalny popyt.",
      );
    if (pop >= REASONABLE_POPULATION)
      return done(
        "C",
        "dom w mniejszym mieście",
        `Dom w miejscowości ${fmtPop(i.localityPopulation)} — rynek powiatowy.`,
      );
    if (peripheral && popKnown && pop < 5000)
      return done(
        "E",
        "dom w lokalizacji peryferyjnej",
        "Dom w małej miejscowości daleko od większego miasta — bardzo trudna sprzedaż.",
      );
    return done(
      "D",
      "dom w małej miejscowości",
      `Miejscowość poniżej ${REASONABLE_POPULATION / 1000} tys. mieszkańców bez zaplecza dużego miasta — trudna sprzedaż.`,
    );
  }

  if (type === "dzialka_budowlana") {
    if (nearLargeCity || pop >= LARGE_CITY_POPULATION)
      return done(
        "B",
        "działka budowlana przy dużym mieście",
        "Działka budowlana w dużym mieście lub jego okolicach — popyt deweloperski i indywidualny.",
      );
    if (nearMediumCity || pop >= REASONABLE_POPULATION)
      return done(
        "C",
        "działka budowlana",
        "Działka budowlana przy średnim/mniejszym mieście — umiarkowany popyt.",
      );
    if (peripheral)
      return done(
        "E",
        "działka budowlana peryferyjna",
        "Działka budowlana daleko od większych ośrodków — bardzo wąski krąg nabywców.",
      );
    return done(
      "D",
      "działka budowlana w małej miejscowości",
      "Działka w małej miejscowości — ograniczony popyt budowlany.",
    );
  }

  if (type === "lokal_uslugowy") {
    if (pop >= LARGE_CITY_POPULATION)
      return done(
        "B",
        "lokal usługowy w dużym mieście",
        `Lokal usługowy w mieście ${fmtPop(i.localityPopulation)} — popyt inwestycyjny (najem).`,
      );
    if (pop >= MEDIUM_CITY_POPULATION || nearLargeCity)
      return done(
        "C",
        "lokal usługowy",
        "Lokal usługowy w średnim mieście lub przy dużym mieście — popyt zależny od lokalnego biznesu.",
      );
    return done(
      "D",
      "lokal usługowy w małej miejscowości",
      "Lokal usługowy poza większym rynkiem — wąski krąg nabywców inwestycyjnych.",
    );
  }

  // Typy nietypowe (inna, siedlisko itd.) — z natury trudniej zbywalne.
  if (nearLargeCity || pop >= LARGE_CITY_POPULATION)
    return done(
      "C",
      "nieruchomość nietypowa przy dużym mieście",
      "Nietypowy rodzaj nieruchomości — mimo dobrej lokalizacji krąg nabywców jest zawężony.",
    );
  if (peripheral)
    return done(
      "E",
      "nieruchomość nietypowa, peryferyjna",
      "Nietypowy rodzaj nieruchomości w lokalizacji peryferyjnej — bardzo trudna sprzedaż.",
    );
  return done(
    "D",
    "nieruchomość nietypowa",
    "Nietypowy rodzaj nieruchomości poza dużym rynkiem — trudna sprzedaż.",
  );
}
