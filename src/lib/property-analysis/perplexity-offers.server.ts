// Aktywne oferty sprzedaży nieruchomości w okolicy — przez Perplexity (sonar-pro).
// Zastępuje wcześniejsze scrapowanie Firecrawl, które słabo radziło sobie z
// wyłuskiwaniem cen ofertowych z portali. Perplexity przeszukuje aktualne ogłoszenia
// (Otodom, OLX, Morizon, Gratka, Domiporta, Nieruchomości-online) i zwraca strukturę
// zgodną z blokiem „oferty w okolicy" (liczba ofert, biura vs prywatne, mediana zł/m²).
// Server-only.

import type { PropertyType } from "./types";

export type OfferPostedBy = "agency" | "private" | "unknown";

export interface PerplexityOffer {
  title: string;
  url: string;
  source: string; // domena portalu, np. "otodom.pl"
  postedBy: OfferPostedBy;
  pricePln: number | null;
  pricePerM2: number | null;
}

export interface PerplexityOffersResult {
  status: "success" | "no_data" | "error";
  totalActiveListings: number;
  agencyListings: number;
  privateListings: number;
  medianPricePerM2: number | null;
  offers: PerplexityOffer[];
  citations: string[];
  errorMessage?: string;
}

export interface PerplexityOffersParams {
  propertyType: PropertyType | string;
  city?: string | null;
  district?: string | null;
  voivodeship?: string | null;
  areaM2?: number | null;
  radiusKm?: number;
}

const PROPERTY_LABELS: Record<string, string> = {
  mieszkanie: "mieszkanie",
  dom: "dom",
  lokal_uslugowy: "lokal użytkowy / usługowy",
  dzialka_budowlana: "działka budowlana",
  dzialka_zabudowana: "działka zabudowana",
  grunt_rolny: "grunt rolny / działka rolna",
  inna: "nieruchomość",
};

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function numOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function classifyPostedBy(v: any): OfferPostedBy {
  const s = String(v ?? "").toLowerCase();
  if (/agency|biuro|agencja|po[śs]rednik/.test(s)) return "agency";
  if (/private|prywatn|w[łl]a[śs]cic/.test(s)) return "private";
  return "unknown";
}

function buildPrompt(p: PerplexityOffersParams): string {
  const typeLabel = PROPERTY_LABELS[String(p.propertyType)] ?? "nieruchomość";
  const loc = [p.district, p.city, p.voivodeship].filter(Boolean).join(", ") || "Polska";
  const radius = p.radiusKm ?? 10;
  const areaHint = p.areaM2
    ? ` Podobna powierzchnia do ~${p.areaM2} m² jest preferowana, ale nie wymagana.`
    : "";

  return `Jesteś analitykiem rynku nieruchomości w Polsce. Znajdź AKTUALNE, aktywne ogłoszenia SPRZEDAŻY typu „${typeLabel}" w okolicy (promień ok. ${radius} km od: ${loc}).${areaHint}

Przeszukaj polskie portale ogłoszeniowe: otodom.pl, olx.pl, domiporta.pl, gratka.pl, morizon.pl, nieruchomosci-online.pl.

Dla każdego znalezionego ogłoszenia ustal: cenę ofertową (PLN), powierzchnię (m²) i cenę za m², portal (domena), oraz kto wystawił ofertę (biuro nieruchomości = "agency", osoba prywatna = "private", nieustalone = "unknown"). Podaj też pełny URL ogłoszenia, jeśli dostępny.

Policz łączną liczbę aktywnych ofert w okolicy, ile z nich pochodzi od biur nieruchomości, a ile od osób prywatnych, oraz medianę ceny ofertowej za m².

ODPOWIEDŹ — wyłącznie poprawny JSON, bez markdown, bez backticków:
{
  "totalActiveListings": <liczba całkowita aktywnych ofert w okolicy>,
  "agencyListings": <liczba ofert biur>,
  "privateListings": <liczba ofert prywatnych>,
  "medianPricePerM2": <mediana ceny ofertowej zł/m² lub null>,
  "offers": [
    { "title": "<tytuł>", "url": "<url lub \"\">", "source": "<domena portalu>", "postedBy": "agency|private|unknown", "pricePln": <liczba lub null>, "areaM2": <liczba lub null>, "pricePerM2": <liczba lub null> }
  ]
}
Zwróć do 12 najbardziej reprezentatywnych ofert w polu "offers". Liczby (totalActiveListings/agencyListings/privateListings) mają odzwierciedlać realną podaż w okolicy, nawet jeśli w "offers" podasz tylko próbkę.`;
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

function emptyResult(status: "no_data" | "error", message?: string): PerplexityOffersResult {
  return {
    status,
    totalActiveListings: 0,
    agencyListings: 0,
    privateListings: 0,
    medianPricePerM2: null,
    offers: [],
    citations: [],
    errorMessage: message,
  };
}

export async function perplexityLocalOffers(
  p: PerplexityOffersParams,
): Promise<PerplexityOffersResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return emptyResult("error", "Brak PERPLEXITY_API_KEY.");
  if (!p.city && !p.district)
    return emptyResult("no_data", "Brak lokalizacji — nie wyszukano ofert.");

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content:
              "Jesteś analitykiem rynku nieruchomości w Polsce. Odpowiadasz wyłącznie poprawnym JSON-em, bez komentarzy ani backticków.",
          },
          { role: "user", content: buildPrompt(p) },
        ],
        temperature: 0.2,
        search_recency_filter: "month",
        search_domain_filter: [
          "otodom.pl",
          "olx.pl",
          "domiporta.pl",
          "gratka.pl",
          "morizon.pl",
          "nieruchomosci-online.pl",
        ],
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return emptyResult("error", `Perplexity HTTP ${res.status}: ${txt.slice(0, 160)}`);
    }

    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const citations: string[] = Array.isArray(json?.citations) ? json.citations : [];
    const parsed = tryParseJson(content);
    if (!parsed)
      return {
        ...emptyResult("no_data", "Nie udało się sparsować odpowiedzi Perplexity."),
        citations,
      };

    const rawOffers: any[] = Array.isArray(parsed.offers) ? parsed.offers : [];
    const offers: PerplexityOffer[] = rawOffers.slice(0, 12).map((o) => {
      const url = typeof o?.url === "string" ? o.url : "";
      const pricePln = numOrNull(o?.pricePln);
      const areaM2 = numOrNull(o?.areaM2);
      const pricePerM2 =
        numOrNull(o?.pricePerM2) ?? (pricePln && areaM2 ? Math.round(pricePln / areaM2) : null);
      return {
        title: typeof o?.title === "string" ? o.title.slice(0, 200) : "",
        url,
        source:
          typeof o?.source === "string" && o.source
            ? o.source.replace(/^www\./, "")
            : domainOf(url),
        postedBy: classifyPostedBy(o?.postedBy),
        pricePln,
        pricePerM2: pricePerM2 && pricePerM2 > 500 && pricePerM2 < 200_000 ? pricePerM2 : null,
      };
    });

    // Liczniki: preferuj podane przez model; gdy brak — policz z próbki.
    const total = numOrNull(parsed.totalActiveListings) ?? offers.length;
    const agency =
      numOrNull(parsed.agencyListings) ?? offers.filter((o) => o.postedBy === "agency").length;
    const priv =
      numOrNull(parsed.privateListings) ?? offers.filter((o) => o.postedBy === "private").length;

    const ppm2FromOffers = offers.map((o) => o.pricePerM2).filter((v): v is number => v != null);
    const medianPricePerM2 = numOrNull(parsed.medianPricePerM2) ?? median(ppm2FromOffers);

    const hasData = total > 0 || offers.length > 0 || medianPricePerM2 != null;
    return {
      status: hasData ? "success" : "no_data",
      totalActiveListings: total,
      agencyListings: Math.min(agency, total),
      privateListings: Math.min(priv, total),
      medianPricePerM2,
      offers,
      citations,
    };
  } catch (e: any) {
    return emptyResult("error", e?.message ?? "Nieznany błąd Perplexity.");
  }
}
