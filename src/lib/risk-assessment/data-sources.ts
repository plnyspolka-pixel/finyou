// Katalog wszystkich źródeł danych wykorzystywanych w wycenie i ocenie ryzyka.
// „Pod spodem wszystkie źródła danych, z jakich korzysta system."
// Czysty moduł danych — bez zależności serwerowych.

export type SourceCategory =
  | "dokumenty_klienta"
  | "rejestr_publiczny"
  | "instytucja_rzadowa"
  | "dane_geoprzestrzenne"
  | "rynek_nieruchomosci"
  | "korespondencja"
  | "ai_analiza";

export interface DataSourceSpec {
  key: string;
  name: string;
  category: SourceCategory;
  /** true = urzędowe/rządowe źródło danych (API instytucji publicznej). */
  governmental: boolean;
  purpose: string;
  /** Co dokładnie zaciągamy. */
  provides: string;
  /** Endpoint / dostawca (bez sekretów). */
  provider: string;
  /** Zmienna środowiskowa wymagana do działania (jeśli dotyczy). */
  envKey?: string;
}

export const CATEGORY_LABELS: Record<SourceCategory, string> = {
  dokumenty_klienta: "Dokumenty klienta (OCR)",
  rejestr_publiczny: "Rejestry publiczne",
  instytucja_rzadowa: "Instytucje rządowe (API)",
  dane_geoprzestrzenne: "Dane geoprzestrzenne",
  rynek_nieruchomosci: "Rynek nieruchomości",
  korespondencja: "Korespondencja z klientem",
  ai_analiza: "Warstwa analityczna AI",
};

// Pełen rejestr źródeł. Kolejność ≈ przepływ pipeline'u oceny.
export const DATA_SOURCE_CATALOG: DataSourceSpec[] = [
  // 1. OCR dokumentów
  {
    key: "ocr_documents",
    name: "Skany dokumentów (OCR)",
    category: "dokumenty_klienta",
    governmental: false,
    purpose: "Odczyt operatów, wypisów, umów, zaświadczeń i innych skanów",
    provides: "Parametry nieruchomości, dane właściciela, obciążenia, wartości z operatu",
    provider: "Gemini 2.5 (Lovable AI Gateway)",
    envKey: "LOVABLE_API_KEY",
  },
  // 2. Księga wieczysta
  {
    key: "kw_ekw",
    name: "Księga wieczysta (EKW)",
    category: "rejestr_publiczny",
    governmental: true,
    purpose: "Stan prawny nieruchomości: własność, obciążenia, hipoteki",
    provides: "Działy I–IV KW (właściciele, prawa i roszczenia, hipoteki)",
    provider: "CMD KW Engine / EKW Ministerstwa Sprawiedliwości",
    envKey: "CMD_KW_USER",
  },
  // 3. Właściciel — PESEL, aktuarialne trwanie życia
  {
    key: "owner_pesel",
    name: "Analiza właściciela (PESEL)",
    category: "dokumenty_klienta",
    governmental: false,
    purpose: "Wiek i płeć właściciela do oceny ryzyka dożycia/sukcesji",
    provides: "Data urodzenia, płeć, wiek (wyprowadzone z PESEL)",
    provider: "Walidacja PESEL (algorytm krajowy)",
  },
  {
    key: "gus_bdl_prices",
    name: "GUS BDL — ceny gruntów rolnych i lokali",
    category: "instytucja_rzadowa",
    governmental: true,
    purpose: "priorytetowa wycena z danych urzędowych (grunt rolny zł/ha wg klasy, lokale zł/m²)",
    provides: "przeciętne ceny transakcyjne GUS (powiat → województwo → kraj)",
    provider: "GUS Bank Danych Lokalnych (API)",
    envKey: "GUS_BDL_API_KEY",
  },
  {
    key: "gus_life_tables",
    name: "Tablice trwania życia GUS",
    category: "instytucja_rzadowa",
    governmental: true,
    purpose: "Aktuarialne dalsze trwanie życia właściciela",
    provides: "e(x) — dalsze przeciętne trwanie życia wg wieku i płci",
    provider: "GUS — Trwanie życia 2022",
  },
  // 4. Korespondencja
  {
    key: "correspondence",
    name: "Korespondencja z klientem",
    category: "korespondencja",
    governmental: false,
    purpose: "Analiza behawioralna, wykrycie sygnałów ostrzegawczych i niespójności",
    provides: "E-maile, wiadomości DM/Messenger, transkrypcje rozmów (voicebot)",
    provider: "lead_communications (Gmail, Messenger, ElevenLabs)",
  },
  // 5. Instytucje rządowe / rejestry
  {
    key: "gus_regon_bir",
    name: "GUS REGON BIR",
    category: "instytucja_rzadowa",
    governmental: true,
    purpose: "Weryfikacja podmiotu gospodarczego właściciela/wnioskodawcy",
    provides: "Dane firmy: forma prawna, status, PKD, adres, KRS",
    provider: "GUS BIR 1.1 (SOAP)",
    envKey: "BIR_API_KEY",
  },
  {
    key: "flood_isok",
    name: "ISOK / Wody Polskie",
    category: "instytucja_rzadowa",
    governmental: true,
    purpose: "Ocena zagrożenia powodziowego lokalizacji",
    provides: "Mapy zagrożenia (MZP) i ryzyka (MRP) powodziowego",
    provider: "ISOK / Wody Polskie WMS/WFS",
  },
  {
    key: "rcn_geoportal",
    name: "RCN — Geoportal",
    category: "instytucja_rzadowa",
    governmental: true,
    purpose: "Rejestr Cen Nieruchomości — transakcje porównawcze",
    provides: "Ceny transakcyjne nieruchomości w okolicy",
    provider: "Geoportal / RCN (WFS)",
  },
  // 6. Dane geoprzestrzenne
  {
    key: "google_maps",
    name: "Google Maps Platform",
    category: "dane_geoprzestrzenne",
    governmental: false,
    purpose: "Geokodowanie i ocena infrastruktury/lokalizacji",
    provides: "Współrzędne, POI, dostępność usług i komunikacji",
    provider: "Google Maps (Lovable connector)",
    envKey: "GOOGLE_MAPS_API_KEY",
  },
  // 7. Prognoza łatwości sprzedaży (popyt z otoczenia)
  {
    key: "saleability_demand",
    name: "Prognoza łatwości sprzedaży (popyt z otoczenia)",
    category: "rynek_nieruchomosci",
    governmental: false,
    purpose: "ocena płynności wyjścia z inwestycji na podstawie otoczenia 20/50 km",
    provides: "zaludnienie, większe miasto, zbiornik wodny, kurort, sanatorium, atrakcje turystyczne, dostępność drogowa, popyt na najem",
    provider: "Perplexity (sonar-pro)",
    envKey: "PERPLEXITY_API_KEY",
  },
  {
    key: "local_market_offers",
    name: "Oferty sprzedaży w okolicy — biura nieruchomości",
    category: "rynek_nieruchomosci",
    governmental: false,
    purpose: "realna podaż i obsługa rynku przez biura — sygnał płynności zbycia",
    provides: "aktywne ogłoszenia sprzedaży w okolicy (~10 km), udział ofert biur vs prywatnych, mediana ceny/m²",
    provider: "Firecrawl (otodom, olx, morizon, gratka, domiporta, nieruchomości-online)",
    envKey: "FIRECRAWL_API_KEY",
  },
  // 8. Rynek nieruchomości + wycena nadrzędna
  {
    key: "perplexity",
    name: "Perplexity (sonar-pro)",
    category: "rynek_nieruchomosci",
    governmental: false,
    purpose: "Wycena porównawcza i nadrzędna analiza ryzyka inwestycji",
    provides: "Ceny z aktualnych ogłoszeń i raportów, wycena, klasyfikacja ryzyka",
    provider: "Perplexity API (sonar-pro)",
    envKey: "PERPLEXITY_API_KEY",
  },
];

export function governmentalSources(): DataSourceSpec[] {
  return DATA_SOURCE_CATALOG.filter((s) => s.governmental);
}

export function sourceByKey(key: string): DataSourceSpec | undefined {
  return DATA_SOURCE_CATALOG.find((s) => s.key === key);
}
