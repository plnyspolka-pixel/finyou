// Prognozowana łatwość sprzedaży (płynność wyjścia z inwestycji).
// Łączy: badanie popytu z otoczenia przez Perplexity (zaludnienie, większe miasto,
// zbiornik wodny, kurort/uzdrowisko, sanatorium, atrakcje turystyczne, dostępność
// komunikacyjna, siła nabywcza, popyt na najem) + realną dostępność pośredników
// nieruchomości na rynku lokalnym (Google Maps Places).

import type { SaleabilityForecast, SaleabilityBand } from "./types";

const GM_GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

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

// ---- Pośrednicy nieruchomości w okolicy (Google Maps Places) ----
async function countRealEstateAgents(lat: number, lng: number, radiusM: number): Promise<number | null> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) return null;
  try {
    const res = await fetch(`${GM_GATEWAY}/places/v1/places:searchNearby`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "places.displayName,places.types",
      },
      body: JSON.stringify({
        includedTypes: ["real_estate_agency"],
        maxResultCount: 20,
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radiusM, 50000) } },
        languageCode: "pl",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.places) ? data.places.length : 0;
  } catch {
    return null;
  }
}

// ---- Badanie popytu z otoczenia (Perplexity) ----
function buildPrompt(loc: string, propertyType: string): string {
  return `Jesteś analitykiem rynku nieruchomości w Polsce. Oceń PROGNOZOWANĄ ŁATWOŚĆ SPRZEDAŻY nieruchomości (${propertyType}) w lokalizacji: ${loc}. Weź pod uwagę popyt wynikający z otoczenia.

Przeszukaj aktualne źródła i ustal:
1. Liczbę mieszkańców miejscowości oraz trend demograficzny (rosnąca/stabilna/malejąca).
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
  try { return JSON.parse(m[0]); } catch { return null; }
}
function b(v: any): boolean { return v === true || v === "true"; }
function numOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// Scoring 0–100 z sygnałów popytu.
function computeScore(d: {
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
  agentsCount: number | null;
  liquidType: boolean;
}): number {
  let s = 30; // baza
  // Zaludnienie miejscowości.
  const pop = d.localityPopulation ?? 0;
  if (pop >= 200000) s += 22;
  else if (pop >= 50000) s += 17;
  else if (pop >= 20000) s += 12;
  else if (pop >= 5000) s += 7;
  else if (pop >= 1000) s += 3;
  // Trend demograficzny.
  if (d.populationTrend === "rosnaca") s += 6;
  else if (d.populationTrend === "malejaca") s -= 8;
  // Bliskość większego miasta.
  if (d.largeCityWithin50km) s += 8;
  if (d.nearestCityDistanceKm != null) {
    if (d.nearestCityDistanceKm <= 20) s += 8;
    else if (d.nearestCityDistanceKm <= 50) s += 4;
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
  // Aktywni pośrednicy = płynny, obsługiwany rynek.
  if (d.agentsCount != null) {
    if (d.agentsCount >= 10) s += 8;
    else if (d.agentsCount >= 4) s += 5;
    else if (d.agentsCount >= 1) s += 2;
    else s -= 5; // brak pośredników = rynek płytki
  }
  // Typ nieruchomości.
  if (d.liquidType) s += 4; else s -= 4;
  return Math.max(0, Math.min(100, Math.round(s)));
}

const LIQUID_TYPES = ["mieszkanie", "dom", "dzialka_budowlana", "lokal_uslugowy"];

export async function analyzeSaleability(args: {
  propertyType: string;
  address: string | null;
  city: string | null;
  voivodeship: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<SaleabilityForecast> {
  const loc = [args.address, args.city, args.voivodeship, "Polska"].filter(Boolean).join(", ") || "Polska";
  const liquidType = LIQUID_TYPES.includes(args.propertyType);

  // Pośrednicy — równolegle z Perplexity.
  const agentsRadiusKm = 25;
  const agentsPromise =
    args.latitude != null && args.longitude != null
      ? countRealEstateAgents(args.latitude, args.longitude, agentsRadiusKm * 1000)
      : Promise.resolve(null);

  const empty = (summary: string, agentsCount: number | null): SaleabilityForecast => ({
    available: false,
    score: 45,
    band: "nieznana",
    estimatedDaysOnMarket: null,
    localityPopulation: null,
    populationTrend: "nieznana",
    nearestLargeCity: { name: null, population: null, distanceKm: null },
    demandDrivers: {
      largeCityWithin50km: false, waterBodyWithin20km: false, spaResortWithin20km: false,
      sanatoriumWithin20km: false, touristAttractionWithin20km: false, majorRoadWithin10km: false,
    },
    rentalDemand: "nieznany",
    purchasingPowerComment: null,
    realEstateAgents: {
      available: (agentsCount ?? 0) > 0,
      count: agentsCount ?? 0,
      radiusKm: agentsRadiusKm,
      source: "Google Maps Places",
    },
    rationale: "",
    citations: [],
    summary,
  });

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    const agentsCount = await agentsPromise;
    return empty("Brak PERPLEXITY_API_KEY — prognoza łatwości sprzedaży pominięta.", agentsCount);
  }

  try {
    const [res, agentsCount] = await Promise.all([
      fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            { role: "system", content: "Jesteś analitykiem rynku nieruchomości w Polsce. Odpowiadasz wyłącznie poprawnym JSON-em." },
            { role: "user", content: buildPrompt(loc, args.propertyType) },
          ],
          temperature: 0.2,
          search_recency_filter: "year",
        }),
      }),
      agentsPromise,
    ]);

    if (!res.ok) {
      return empty(`Perplexity HTTP ${res.status} — prognoza łatwości sprzedaży niedostępna.`, agentsCount);
    }
    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const citations: string[] = Array.isArray(json?.citations) ? json.citations : [];
    const parsed = tryParseJson(content);
    if (!parsed) return empty("Nie udało się sparsować prognozy łatwości sprzedaży.", agentsCount);

    const nearest = parsed.nearestLargeCity ?? {};
    const demandDrivers = {
      largeCityWithin50km: b(parsed.largeCityWithin50km),
      waterBodyWithin20km: b(parsed.waterBodyWithin20km),
      spaResortWithin20km: b(parsed.spaResortWithin20km),
      sanatoriumWithin20km: b(parsed.sanatoriumWithin20km),
      touristAttractionWithin20km: b(parsed.touristAttractionWithin20km),
      majorRoadWithin10km: b(parsed.majorRoadWithin10km),
    };
    const populationTrend = ["rosnaca", "stabilna", "malejaca"].includes(parsed.populationTrend) ? parsed.populationTrend : "nieznana";
    const rentalDemand = ["wysoki", "sredni", "niski"].includes(parsed.rentalDemand) ? parsed.rentalDemand : "nieznany";
    const localityPopulation = numOrNull(parsed.localityPopulation);
    const nearestDistanceKm = numOrNull(nearest.distanceKm);

    const score = computeScore({
      localityPopulation,
      populationTrend,
      nearestCityDistanceKm: nearestDistanceKm,
      ...demandDrivers,
      rentalDemand,
      agentsCount,
      liquidType,
    });

    const band = bandFromScore(score);
    const drivers: string[] = [];
    if (demandDrivers.largeCityWithin50km) drivers.push("duże miasto w 50 km");
    if (demandDrivers.waterBodyWithin20km) drivers.push("zbiornik wodny w 20 km");
    if (demandDrivers.spaResortWithin20km) drivers.push("kurort/uzdrowisko w 20 km");
    if (demandDrivers.sanatoriumWithin20km) drivers.push("sanatorium w 20 km");
    if (demandDrivers.touristAttractionWithin20km) drivers.push("atrakcja turystyczna w 20 km");
    if (demandDrivers.majorRoadWithin10km) drivers.push("dobra dostępność drogowa");

    const summary =
      `Prognozowana łatwość sprzedaży: ${score}/100 (${band.replace(/_/g, " ")}). ` +
      (localityPopulation ? `Miejscowość ~${localityPopulation.toLocaleString("pl-PL")} mieszk. (${populationTrend}). ` : "") +
      (nearest.name ? `Najbliższe większe miasto: ${nearest.name}${nearestDistanceKm ? ` (${nearestDistanceKm} km)` : ""}. ` : "") +
      (drivers.length ? `Czynniki popytu: ${drivers.join(", ")}. ` : "") +
      (agentsCount != null ? `Pośrednicy w ${agentsRadiusKm} km: ${agentsCount}.` : "");

    return {
      available: true,
      score,
      band,
      estimatedDaysOnMarket: numOrNull(parsed.estimatedDaysOnMarket),
      localityPopulation,
      populationTrend,
      nearestLargeCity: {
        name: typeof nearest.name === "string" ? nearest.name : null,
        population: numOrNull(nearest.population),
        distanceKm: nearestDistanceKm,
      },
      demandDrivers,
      rentalDemand,
      purchasingPowerComment: typeof parsed.purchasingPowerComment === "string" ? parsed.purchasingPowerComment : null,
      realEstateAgents: {
        available: (agentsCount ?? 0) > 0,
        count: agentsCount ?? 0,
        radiusKm: agentsRadiusKm,
        source: "Google Maps Places",
      },
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
      citations,
      summary,
    };
  } catch (e: any) {
    const agentsCount = await agentsPromise.catch(() => null);
    return empty(`Błąd prognozy łatwości sprzedaży: ${e?.message ?? "nieznany"}.`, agentsCount);
  }
}
