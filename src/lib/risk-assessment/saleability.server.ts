// Prognozowana łatwość sprzedaży (płynność wyjścia z inwestycji).
// Łączy: badanie popytu z otoczenia przez Perplexity (zaludnienie, większe miasto,
// zbiornik wodny, kurort/uzdrowisko, sanatorium, atrakcje turystyczne, dostępność
// komunikacyjna, siła nabywcza, popyt na najem) + realne aktywne oferty sprzedaży
// w okolicy wraz z cenami ofertowymi (Perplexity — portale ogłoszeniowe).

import type { SaleabilityForecast, SaleabilityBand } from "./types";
import { perplexityLocalOffers } from "@/lib/property-analysis/perplexity-offers.server";
import type { FloorFactorResult } from "./floor-factor";
import type { PlotBuildabilityResult } from "./plot-buildability";

const LOCAL_OFFERS_RADIUS_KM = 10;
// Podaż badamy w rosnących promieniach — Karta oferty pokazuje 10/20/30 km.
const OFFERS_RADII_KM = [10, 20, 30] as const;
const OFFERS_SOURCE = "Perplexity (portale ogłoszeniowe)";
// Próg „rozsądnego/sprzedawalnego" rynku dla nieruchomości innych niż grunt rolny.
const REASONABLE_POPULATION = 20000;

function bandFromScore(score: number): SaleabilityBand {
  if (score >= 80) return "bardzo_latwa";
  if (score >= 62) return "latwa";
  if (score >= 45) return "umiarkowana";
  if (score >= 28) return "trudna";
  return "bardzo_trudna";
}

export function saleabilityBandFromScore(score: number): SaleabilityBand {
  return bandFromScore(score);
}

type LocalOffers = SaleabilityForecast["localMarketOffers"];

function emptyLocalOffers(): LocalOffers {
  return {
    available: false,
    totalActiveListings: 0,
    agencyListings: 0,
    privateListings: 0,
    medianPricePerM2: null,
    radiusKm: LOCAL_OFFERS_RADIUS_KM,
    source: OFFERS_SOURCE,
    byRadius: [],
    sample: [],
  };
}

// ---- Aktywne oferty sprzedaży w okolicy (Perplexity — ceny ofertowe z portali) ----
// Podaż mierzymy w trzech promieniach (10/20/30 km); wartości główne (scoring,
// dotychczasowi konsumenci) pochodzą z najmniejszego promienia.
async function gatherLocalOffers(args: {
  propertyType: string;
  city: string | null;
  district: string | null;
  voivodeship: string | null;
  areaM2: number | null;
}): Promise<LocalOffers> {
  try {
    const results = await Promise.all(
      OFFERS_RADII_KM.map((radiusKm) =>
        perplexityLocalOffers({
          propertyType: args.propertyType,
          city: args.city,
          district: args.district,
          voivodeship: args.voivodeship,
          areaM2: args.areaM2,
          radiusKm,
        }).catch(() => null),
      ),
    );
    const primary = results[0];
    if (!primary) return emptyLocalOffers();
    const byRadius = OFFERS_RADII_KM.flatMap((radiusKm, i) => {
      const r = results[i];
      return r
        ? [
            {
              radiusKm,
              totalActiveListings: r.totalActiveListings,
              agencyListings: r.agencyListings,
              privateListings: r.privateListings,
              medianPricePerM2: r.medianPricePerM2,
            },
          ]
        : [];
    });
    return {
      available: primary.agencyListings > 0,
      totalActiveListings: primary.totalActiveListings,
      agencyListings: primary.agencyListings,
      privateListings: primary.privateListings,
      medianPricePerM2: primary.medianPricePerM2,
      radiusKm: LOCAL_OFFERS_RADIUS_KM,
      source: OFFERS_SOURCE,
      byRadius,
      sample: primary.offers.slice(0, 6).map((l) => ({
        title: l.title,
        url: l.url,
        source: l.source,
        postedBy: l.postedBy ?? "unknown",
        pricePln: l.pricePln,
        pricePerM2: l.pricePerM2,
      })),
    };
  } catch {
    return emptyLocalOffers();
  }
}

// ---- Badanie popytu z otoczenia (Perplexity) ----
function buildPrompt(loc: string, propertyType: string): string {
  return `Jesteś analitykiem rynku nieruchomości w Polsce. Oceń PROGNOZOWANĄ ŁATWOŚĆ SPRZEDAŻY nieruchomości (${propertyType}) w lokalizacji: ${loc}. Weź pod uwagę popyt wynikający z otoczenia.

Przeszukaj aktualne źródła i ustal:
1. Liczbę mieszkańców miejscowości oraz trend demograficzny (rosnąca/stabilna/malejąca).
1a. ŁĄCZNĄ liczbę mieszkańców w promieniu 20 km od tej lokalizacji (suma ludności miejscowości/gmin w tym promieniu — oszacuj na podstawie danych GUS).
2. Najbliższe większe miasto (>50 tys.): nazwa, liczba mieszkańców, odległość w km.
3. Czy w promieniu 50 km jest duże miasto (>100 tys.).
4. Czy w promieniu 20 km jest: zbiornik wodny/jezioro/zalew; kurort lub miejscowość uzdrowiskowa; sanatorium; istotna atrakcja turystyczna.
5. Dostępność komunikacyjna: czy w promieniu 10 km jest droga ekspresowa/autostrada/droga krajowa.
6. Siła nabywcza / poziom bezrobocia w powiecie (krótki komentarz).
7. Popyt na najem (wysoki/średni/niski).
8. Szacowany przeciętny czas sprzedaży (dni na rynku) dla tego typu nieruchomości w tej okolicy.

ODPOWIEDŹ — wyłącznie poprawny JSON, bez markdown:
{
  "localityPopulation": <liczba lub null>,
  "populationWithin20Km": <liczba lub null>,
  "populationTrend": "rosnaca|stabilna|malejaca|nieznana",
  "nearestLargeCity": { "name": "<lub null>", "population": <liczba lub null>, "distanceKm": <liczba lub null> },
  "largeCityWithin50km": <true|false>,
  "waterBodyWithin20km": <true|false>,
  "spaResortWithin20km": <true|false>,
  "sanatoriumWithin20km": <true|false>,
  "touristAttractionWithin20km": <true|false>,
  "majorRoadWithin10km": <true|false>,
  "rentalDemand": "wysoki|sredni|niski|nieznany",
  "estimatedDaysOnMarket": <liczba lub null>,
  "purchasingPowerComment": "<1 zdanie>",
  "rationale": "<2-3 zdania uzasadnienia łatwości sprzedaży w kontekście popytu z otoczenia>"
}`;
}

function tryParseJson(s: string): any | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
function b(v: any): boolean {
  return v === true || v === "true";
}
function numOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function isAgriLand(propertyType: string): boolean {
  return propertyType === "grunt_rolny";
}

// Rozsądny/sprzedawalny rynek: miasto >20 tys. mieszk. albo grunt rolny (bez ograniczeń).
export function isReasonableMarket(
  propertyType: string,
  localityPopulation: number | null,
): boolean {
  if (isAgriLand(propertyType)) return true;
  return (localityPopulation ?? 0) >= REASONABLE_POPULATION;
}

// Scoring 0–100 z sygnałów popytu.
function computeScore(d: {
  propertyType: string;
  localityPopulation: number | null;
  populationTrend: string;
  nearestCityDistanceKm: number | null;
  largeCityWithin50km: boolean;
  waterBodyWithin20km: boolean;
  spaResortWithin20km: boolean;
  sanatoriumWithin20km: boolean;
  touristAttractionWithin20km: boolean;
  majorRoadWithin10km: boolean;
  rentalDemand: string;
  agencyListings: number;
  totalActiveListings: number;
  liquidType: boolean;
}): number {
  const agri = isAgriLand(d.propertyType);

  // GRUNT ROLNY: rynek rolny (ceny GUS) jest relatywnie płynny i rządzi się
  // inną logiką niż mieszkaniowy. Nie stosujemy „miejskich" kar (mała ludność,
  // oddalenie od miasta, brak ofert biur, „nietypowy typ") — zawyżałyby ryzyko.
  if (agri) {
    let sa = 58; // bazowa płynność rynku gruntów rolnych
    if (d.majorRoadWithin10km) sa += 4; // dojazd/logistyka
    if (d.waterBodyWithin20km) sa += 2;
    if (d.largeCityWithin50km) sa += 4; // bliskość rynku zbytu podnosi cenę/płynność
    if (d.nearestCityDistanceKm != null && d.nearestCityDistanceKm <= 30) sa += 3;
    if (d.populationTrend === "malejaca") sa -= 2; // słaby wpływ
    if (d.agencyListings >= 1 || d.totalActiveListings >= 3) sa += 4; // aktywny obrót w okolicy
    return Math.max(0, Math.min(100, Math.round(sa)));
  }

  let s = 30; // baza (nieruchomości nierolne)
  // Zaludnienie miejscowości.
  const pop = d.localityPopulation ?? 0;
  if (pop >= 200000) s += 22;
  else if (pop >= 50000) s += 17;
  else if (pop >= 20000) s += 12;
  else if (pop >= 5000) s += 7;
  else if (pop >= 1000) s += 3;
  // Próg rozsądnego rynku: >20 tys. = premia, <20 tys. = kara.
  if (pop >= REASONABLE_POPULATION) s += 6;
  else if (pop > 0) s -= 14; // miasto poniżej 20 tys. — słaba sprzedawalność
  // Trend demograficzny.
  if (d.populationTrend === "rosnaca") s += 6;
  else if (d.populationTrend === "malejaca") s -= 8;
  // Położenie względem większego miasta — im bliżej, tym lepsza płynność; duża
  // odległość od jakiegokolwiek większego ośrodka istotnie obniża sprzedawalność.
  if (d.largeCityWithin50km) s += 8;
  if (d.nearestCityDistanceKm != null) {
    if (d.nearestCityDistanceKm <= 15) s += 10;
    else if (d.nearestCityDistanceKm <= 30) s += 6;
    else if (d.nearestCityDistanceKm <= 50) s += 3;
    else if (d.nearestCityDistanceKm <= 80) s -= 6;
    else s -= 12; // >80 km od większego miasta — peryferyjna lokalizacja
  }
  // Czynniki turystyczno-rekreacyjne (popyt drugodomowy/sezonowy).
  if (d.waterBodyWithin20km) s += 5;
  if (d.spaResortWithin20km) s += 5;
  if (d.sanatoriumWithin20km) s += 3;
  if (d.touristAttractionWithin20km) s += 4;
  // Dostępność komunikacyjna.
  if (d.majorRoadWithin10km) s += 5;
  // Popyt na najem (alternatywne wyjście).
  if (d.rentalDemand === "wysoki") s += 5;
  else if (d.rentalDemand === "niski") s -= 3;
  // Aktywne oferty biur w okolicy = płynny, obsługiwany rynek.
  if (d.agencyListings >= 8) s += 8;
  else if (d.agencyListings >= 4) s += 5;
  else if (d.agencyListings >= 1) s += 2;
  else s -= 5; // brak ofert biur = płytki rynek
  if (d.totalActiveListings >= 10) s += 2; // aktywna podaż porównywalnych ofert
  // Typ nieruchomości.
  if (d.liquidType) s += 4;
  else s -= 4;
  return Math.max(0, Math.min(100, Math.round(s)));
}

const LIQUID_TYPES = ["mieszkanie", "dom", "dzialka_budowlana", "lokal_uslugowy"];

export async function analyzeSaleability(args: {
  propertyType: string;
  address: string | null;
  city: string | null;
  district?: string | null;
  voivodeship: string | null;
  areaM2?: number | null;
}): Promise<SaleabilityForecast> {
  const loc =
    [args.address, args.city, args.voivodeship, "Polska"].filter(Boolean).join(", ") || "Polska";
  const liquidType = LIQUID_TYPES.includes(args.propertyType);

  // Aktywne oferty biur w okolicy — równolegle z Perplexity.
  const offersPromise = gatherLocalOffers({
    propertyType: args.propertyType,
    city: args.city,
    district: args.district ?? null,
    voivodeship: args.voivodeship,
    areaM2: args.areaM2 ?? null,
  });

  const empty = (summary: string, offers: LocalOffers): SaleabilityForecast => ({
    available: false,
    score: 45,
    band: "nieznana",
    estimatedDaysOnMarket: null,
    localityPopulation: null,
    populationWithin20Km: null,
    populationTrend: "nieznana",
    nearestLargeCity: { name: null, population: null, distanceKm: null },
    demandDrivers: {
      largeCityWithin50km: false,
      waterBodyWithin20km: false,
      spaResortWithin20km: false,
      sanatoriumWithin20km: false,
      touristAttractionWithin20km: false,
      majorRoadWithin10km: false,
    },
    rentalDemand: "nieznany",
    purchasingPowerComment: null,
    reasonableMarket: isReasonableMarket(args.propertyType, null),
    floorFactor: null,
    localMarketOffers: offers,
    rationale: "",
    citations: [],
    summary,
  });

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    const offers = await offersPromise;
    return empty(
      "Brak PERPLEXITY_API_KEY — prognoza łatwości sprzedaży pominięta (dane o ofertach biur zachowane).",
      offers,
    );
  }

  try {
    const [res, offers] = await Promise.all([
      fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            {
              role: "system",
              content:
                "Jesteś analitykiem rynku nieruchomości w Polsce. Odpowiadasz wyłącznie poprawnym JSON-em.",
            },
            { role: "user", content: buildPrompt(loc, args.propertyType) },
          ],
          temperature: 0.2,
          search_recency_filter: "year",
        }),
      }),
      offersPromise,
    ]);

    if (!res.ok) {
      return empty(
        `Perplexity HTTP ${res.status} — prognoza łatwości sprzedaży niedostępna.`,
        offers,
      );
    }
    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const citations: string[] = Array.isArray(json?.citations) ? json.citations : [];
    const parsed = tryParseJson(content);
    if (!parsed) return empty("Nie udało się sparsować prognozy łatwości sprzedaży.", offers);

    const nearest = parsed.nearestLargeCity ?? {};
    const demandDrivers = {
      largeCityWithin50km: b(parsed.largeCityWithin50km),
      waterBodyWithin20km: b(parsed.waterBodyWithin20km),
      spaResortWithin20km: b(parsed.spaResortWithin20km),
      sanatoriumWithin20km: b(parsed.sanatoriumWithin20km),
      touristAttractionWithin20km: b(parsed.touristAttractionWithin20km),
      majorRoadWithin10km: b(parsed.majorRoadWithin10km),
    };
    const populationTrend = ["rosnaca", "stabilna", "malejaca"].includes(parsed.populationTrend)
      ? parsed.populationTrend
      : "nieznana";
    const rentalDemand = ["wysoki", "sredni", "niski"].includes(parsed.rentalDemand)
      ? parsed.rentalDemand
      : "nieznany";
    const localityPopulation = numOrNull(parsed.localityPopulation);
    const populationWithin20Km = numOrNull(parsed.populationWithin20Km);
    const nearestDistanceKm = numOrNull(nearest.distanceKm);

    const score = computeScore({
      propertyType: args.propertyType,
      localityPopulation,
      populationTrend,
      nearestCityDistanceKm: nearestDistanceKm,
      ...demandDrivers,
      rentalDemand,
      agencyListings: offers.agencyListings,
      totalActiveListings: offers.totalActiveListings,
      liquidType,
    });

    const band = bandFromScore(score);
    const reasonableMarket = isReasonableMarket(args.propertyType, localityPopulation);
    const drivers: string[] = [];
    if (demandDrivers.largeCityWithin50km) drivers.push("duże miasto w 50 km");
    if (demandDrivers.waterBodyWithin20km) drivers.push("zbiornik wodny w 20 km");
    if (demandDrivers.spaResortWithin20km) drivers.push("kurort/uzdrowisko w 20 km");
    if (demandDrivers.sanatoriumWithin20km) drivers.push("sanatorium w 20 km");
    if (demandDrivers.touristAttractionWithin20km) drivers.push("atrakcja turystyczna w 20 km");
    if (demandDrivers.majorRoadWithin10km) drivers.push("dobra dostępność drogowa");

    const reasonNote = isAgriLand(args.propertyType)
      ? "Grunt rolny — bez progu wielkości miejscowości. "
      : reasonableMarket
        ? "Miejscowość powyżej 20 tys. mieszkańców — rynek uznany za rozsądny/sprzedawalny. "
        : "Miejscowość poniżej 20 tys. mieszkańców — ograniczona sprzedawalność. ";
    const summary =
      `Prognozowana łatwość sprzedaży: ${score}/100 (${band.replace(/_/g, " ")}). ` +
      (localityPopulation
        ? `Miejscowość ~${localityPopulation.toLocaleString("pl-PL")} mieszk. (${populationTrend}). `
        : "") +
      reasonNote +
      (nearest.name
        ? `Najbliższe większe miasto: ${nearest.name}${nearestDistanceKm ? ` (${nearestDistanceKm} km)` : ""}. `
        : "") +
      (drivers.length ? `Czynniki popytu: ${drivers.join(", ")}. ` : "") +
      `Oferty sprzedaży w okolicy: ${offers.totalActiveListings} (biura: ${offers.agencyListings}).`;

    return {
      available: true,
      score,
      band,
      estimatedDaysOnMarket: numOrNull(parsed.estimatedDaysOnMarket),
      localityPopulation,
      populationWithin20Km,
      populationTrend,
      reasonableMarket,
      floorFactor: null,
      nearestLargeCity: {
        name: typeof nearest.name === "string" ? nearest.name : null,
        population: numOrNull(nearest.population),
        distanceKm: nearestDistanceKm,
      },
      demandDrivers,
      rentalDemand,
      purchasingPowerComment:
        typeof parsed.purchasingPowerComment === "string" ? parsed.purchasingPowerComment : null,
      localMarketOffers: offers,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
      citations,
      summary,
    };
  } catch (e: any) {
    const offers = await offersPromise.catch<LocalOffers>(() => emptyLocalOffers());
    return empty(`Błąd prognozy łatwości sprzedaży: ${e?.message ?? "nieznany"}.`, offers);
  }
}

/**
 * Nakłada czynnik kondygnacji (mieszkania) na prognozę łatwości sprzedaży —
 * koryguje wynik o piętro i przelicza pasmo. Zwraca nowy obiekt (bez mutacji).
 */
export function applyFloorToSaleability(
  base: SaleabilityForecast,
  floor: FloorFactorResult,
): SaleabilityForecast {
  if (!floor.available) return { ...base, floorFactor: floor };
  // Odchylenie od neutralnych 70 pkt, skala 0.15 → maks. ±~6 pkt.
  const delta = Math.max(-6, Math.min(5, Math.round((floor.score - 70) * 0.15)));
  const newScore = Math.max(0, Math.min(100, base.score + delta));
  const suffix = ` Kondygnacja: ${floor.label} (${floor.note}).`;
  return {
    ...base,
    score: base.available ? newScore : base.score,
    band: base.available ? bandFromScore(newScore) : base.band,
    floorFactor: floor,
    summary: base.summary + suffix,
  };
}

/**
 * Nakłada wpływ prawa zabudowy działki (RM/siedlisko/grunt rolny) na łatwość
 * sprzedaży — ograniczony krąg nabywców obniża wynik. Zwraca nowy obiekt.
 */
export function applyPlotBuildabilityToSaleability(
  base: SaleabilityForecast,
  pb: PlotBuildabilityResult,
): SaleabilityForecast {
  if (!pb.applicable || pb.saleabilityDelta === 0) return base;
  const newScore = Math.max(0, Math.min(100, base.score + pb.saleabilityDelta));
  return {
    ...base,
    score: base.available ? newScore : base.score,
    band: base.available ? bandFromScore(newScore) : base.band,
    summary: `${base.summary} Zabudowa działki: ${pb.summary}`,
  };
}
