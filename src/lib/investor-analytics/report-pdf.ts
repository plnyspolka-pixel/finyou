// Raport analityczny inwestora jako PDF („Analityk AI”).
//
// Trzy widoki raportu w panelu inwestora mają już w pamięci komplet danych —
// dokładnie te, które widać na ekranie: Analityka (AnalyticsDetail), analiza
// własnego wniosku spoza Finance You (KwCheckDetail) i raport Projektu
// w „Moich zleceniach” (OrderProjectReportDetail; przed rezerwacją serwer
// oczyszcza go z danych identyfikujących). PDF składamy w przeglądarce z tych
// danych — bez nowych zapytań do serwera. Moduł ładowany dynamicznie dopiero
// po kliknięciu „Pobierz PDF” (pdf-lib i fonty nie trafiają do głównej paczki).
//
// Najpierw czyste mapowanie na model bloków (testowalny), potem renderer na
// ReportWriter. Zasady treści:
//  • nigdy komunikaty operacyjne do pośrednika i klienta — tylko „co to
//    oznacza dla inwestora”,
//  • PESEL maskowany w każdym tekście modelu; bez dat urodzenia — dożycie
//    właścicieli tylko jako wiek w przedziale 5-letnim i e(x) (bez nazwisk),
//  • ocena inwestycyjna A–E (klasa ryzyka) i kategoria zbywalności A–E to dwie
//    różne skale — każda ma własny tytuł,
//  • zastrzeżenia raz, na końcu (zastrzeżenie analizy KW = REPORT_DISCLAIMER —
//    tylko gdy raport zawiera analizę KW),
//  • kroki bez wyniku mają w PDF-ie notkę, jak puste karty kroków na ekranie.
import { proceedingRows } from "@/lib/coowners/court-proceeding-format";
import type { OrderProjectReportDetail } from "@/lib/investor-agreements/order-projects.functions";
import type {
  FindingCategory,
  ImpactLevel,
  KwAnalysisResult,
  KwFinding,
  KwSection,
  SourceEvidence,
} from "@/lib/kw-analysis/types";
import { STATUS_LABELS, STATUS_SEVERITY } from "@/lib/kw-analysis/types";
import { REPORT_DISCLAIMER } from "@/lib/kw-analysis/policy";
import { maskPeselInText } from "@/lib/kw-analysis/pesel-mask";
import type { DataSourceUsage, PropertyAnalysisResult } from "@/lib/property-analysis/types";
import { categoryLabel as collateralCategoryLabel } from "@/lib/property-analysis/scoring";
import { NUISANCE_ALERT_M, NUISANCE_LABEL } from "@/lib/property-analysis/surroundings";
import { locationTiles } from "@/lib/property-analysis/location-summary";
import {
  buildInvestorValuationSummary,
  type InvestorValuationSummary,
} from "@/lib/risk-assessment/risk-assessment.functions";
import type {
  InvestmentRiskAssessment,
  RiskComponentScores,
  RiskGrade,
} from "@/lib/risk-assessment/types";
import { gradeFromScore } from "@/lib/risk-assessment/types";
import { gradeBand, gradeRangeLabel } from "@/lib/risk-assessment/grade-bands";
import { auctionOutcomeLabel, saleabilityBandLabel } from "@/lib/risk-assessment/forced-sale";
import {
  categoryLabel as sellabilityCategoryLabel,
  type SellabilityCategory,
} from "@/lib/risk-assessment/exit-liquidity";
import {
  buyerPoolLabel,
  plotCategoryLabel,
  valuationBasisLabel,
} from "@/lib/risk-assessment/plot-buildability";
import { formatKwNumber } from "@/lib/kw";
import { formatPLN, propertyTypeLabels } from "@/lib/labels";
import {
  ReportWriter,
  formatWarsawDateTime,
  warsawDateStamp,
  type ReportFonts,
  type TableColumn,
} from "@/lib/pdf/report-writer";
import {
  ANALYTICS_SOURCE_LABELS,
  ANALYTICS_STEPS,
  ANALYTICS_STEP_STATUS_LABELS,
  analyticsDoneCount,
  analyticsStepStatus,
  kwCheckStepStatus,
  orderReportStepSource,
  type AnalyticsCoOwners,
  type AnalyticsDetail,
  type AnalyticsListItem,
  type AnalyticsKwDocument,
  type AnalyticsStepKey,
  type AnalyticsStepStatus,
  type KwCheckDetail,
} from "./types";

// ── model ──────────────────────────────────────────────────────────────────

export type ReportKind = "analityka" | "kw_check" | "zlecenie";

export type ReportBlock =
  | { t: "heading"; text: string }
  | { t: "subheading"; text: string }
  | { t: "paragraph"; text: string; muted?: boolean }
  | { t: "keyValues"; rows: Array<[string, string]> }
  | { t: "bullets"; items: string[] }
  | { t: "table"; columns: TableColumn[]; rows: string[][] }
  | { t: "score"; label: string; value: number; color?: string; caption?: string | null }
  | { t: "gradeScale"; grade: RiskGrade }
  | { t: "note"; text: string; tone?: "info" | "warning" }
  | { t: "tiles"; items: Array<{ label: string; value: string; accent?: boolean }> }
  | {
      t: "compare";
      barName: string;
      refName?: string;
      rows: Array<{
        label: string;
        value: number;
        ref?: number | null;
        max: number;
        valueLabel: string;
      }>;
    }
  | {
      t: "diverging";
      positiveName: string;
      negativeName: string;
      maxAbs?: number;
      rows: Array<{ label: string; value: number; valueLabel: string; maxAbs?: number }>;
    }
  | {
      t: "distances";
      maxM: number;
      rows: Array<{ label: string; distanceM: number; thresholdM: number; alert: boolean }>;
    }
  | { t: "bars"; max?: number; rows: Array<{ label: string; value: number; valueLabel: string }> }
  | {
      t: "map";
      lat: number;
      lng: number;
      zoom: number;
      /** Pinezka w dokładnym punkcie (false = mapa poglądowa). */
      marker: boolean;
      polygon?: Array<[number, number]> | null;
      /** Podkład: kafelki OSM (domyślnie) albo ortofotomapa Geoportalu. */
      base?: "osm" | "orto";
      /** Nakładka WMS: strefy zagrożenia powodziowego ISOK albo MPZP (KIMPZP). */
      overlay?: "flood" | "mpzp" | "protected" | null;
      caption: string;
    };

export interface InvestorReportModel {
  kind: ReportKind;
  title: string;
  subtitle: string | null;
  /** Numer KW tak, jak podaje źródło — przed rezerwacją zamaskowany. */
  kwNumber: string | null;
  /** Numer Projektu z cyklu Zlecenia (np. FY-Z-4-P1) — nie identyfikuje właściciela. */
  projectRef: string | null;
  /** Wersja przed rezerwacją (Zlecenia) — bez danych identyfikujących. */
  teaser: boolean;
  /** Ile z czterech kroków analizy jest gotowych. */
  stepsDone: number;
  blocks: ReportBlock[];
}

/** Dane widoku, z którego inwestor pobiera raport. */
export type InvestorReportSource =
  | { kind: "analityka"; detail: AnalyticsDetail }
  | { kind: "kw_check"; detail: KwCheckDetail }
  | {
      kind: "zlecenie";
      detail: OrderProjectReportDetail;
      /** Z karty Projektu — raport sam nie niesie numeru Projektu ani kwoty. */
      project?: { ref: string | null; loanAmount: number | null };
    };

export const GRADE_SECTION_TITLE = "Ocena inwestycyjna A–E";
export const SELLABILITY_SECTION_TITLE = "Kategoria zbywalności (A–E)";

export const REPORT_TEASER_NOTE =
  "Wersja przed rezerwacją — dane identyfikujące ukryte. Numer KW jest zamaskowany, a treść " +
  "księgi, cytaty z niej, nazwiska i adres odsłaniamy po Ujawnieniu (rezerwacji) — razem " +
  "z danymi kontaktowymi klienta.";

/** Treść zastrzeżenia RiskDisclaimer (panel inwestora) — w PDF-ie raz, na końcu. */
export const RISK_DISCLAIMER_TEXT =
  "Materiał informacyjny — nie stanowi rekomendacji ani porady. Prezentowane wyceny, oceny, " +
  "klasyfikacje ryzyka i wyliczenia są automatyczne i mają charakter wyłącznie poglądowy. " +
  "Nie jesteśmy doradcą inwestycyjnym ani prawnym i nie świadczymy doradztwa inwestycyjnego, " +
  "prawnego ani podatkowego; materiał nie stanowi rekomendacji, porady inwestycyjnej/prawnej, " +
  "oferty ani zaproszenia do zawarcia transakcji w rozumieniu przepisów prawa. Decyzje " +
  "podejmujesz samodzielnie i na własne ryzyko — zalecana weryfikacja u rzeczoznawcy " +
  "majątkowego oraz radcy prawnego/adwokata.";

export const VALUATION_NOT_APPRAISAL = "Wycena nie jest operatem szacunkowym.";

// ── etykiety ───────────────────────────────────────────────────────────────

/** Neutralny odcień pasków wyników spoza skali A–E (zbywalność, zabezpieczenie). */
const NEUTRAL_BAR = "#6366f1";

const TREND_LABEL: Record<string, string> = {
  rosnacy: "rosnący",
  stabilny: "stabilny",
  spadkowy: "spadkowy",
  nieznany: "nieznany (brak porównywalnych transakcji)",
};

const POPULATION_TREND_LABEL: Record<string, string> = {
  rosnaca: "rosnąca",
  stabilna: "stabilna",
  malejaca: "malejąca",
  nieznana: "nieznana",
};

const FLOOD_LABEL: Record<string, string> = {
  low: "Niskie (scenariusz 0,2%)",
  medium: "Średnie (scenariusz 1%)",
  high: "Wysokie (scenariusz 10%)",
  very_high: "Bardzo wysokie — obszar szczególnego zagrożenia",
};

const IMPACT_LABEL: Record<ImpactLevel, string> = {
  NONE: "brak",
  POSSIBLE: "możliwy",
  DIRECT: "bezpośredni",
  UNKNOWN: "nieustalony",
};

const CATEGORY_LABEL: Record<FindingCategory, string> = {
  MENTION: "Wzmianki",
  OWNERSHIP: "Własność",
  IDENTITY: "Tożsamość",
  RANK: "Miejsce hipoteki",
  MORTGAGE: "Hipoteki (IV)",
  ENFORCEMENT: "Egzekucja",
  RIGHT_OR_CLAIM: "Prawa i roszczenia (III)",
  PROPERTY_SCOPE: "Zakres nieruchomości",
  VALUATION: "Wycena",
  DATA_QUALITY: "Dane / jakość",
};

const KW_SECTION_LABEL: Record<KwSection, string> = {
  COVER: "Okładka",
  I_O: "Dział I-O",
  I_SP: "Dział I-Sp",
  II: "Dział II",
  III: "Dział III",
  IV: "Dział IV",
};

const COMPONENT_LABELS: Record<keyof RiskComponentScores, string> = {
  collateral: "Zabezpieczenie",
  valuationConfidence: "Pewność wyceny",
  legal: "Stan prawny (KW)",
  borrowerLongevity: "Ryzyko dożycia",
  courtRegistry: "KRZ / MSiG",
  documentCompleteness: "Dokumenty (OCR)",
  exitLiquidity: "Łatwość sprzedaży",
};

const SELLABILITY_CATEGORIES = ["A", "B", "C", "D", "E"];

const fmtNum = (n: number) => n.toLocaleString("pl-PL");

function propertyLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return propertyTypeLabels[type] ?? type;
}

function itemTitle(item: AnalyticsListItem): string {
  return [propertyLabel(item.propertyType) ?? "Nieruchomość", item.city]
    .filter(Boolean)
    .join(" · ");
}

/** Usuwa wiersze bez treści (puste komunikaty nie zajmują miejsca w PDF-ie). */
function rowsWithText(rows: Array<[string, string | null | undefined]>): Array<[string, string]> {
  return rows.filter((r): r is [string, string] => typeof r[1] === "string" && r[1].trim() !== "");
}

// ── sekcje ─────────────────────────────────────────────────────────────────

function stepsTable(status: (k: AnalyticsStepKey) => AnalyticsStepStatus): ReportBlock {
  return {
    t: "table",
    columns: [
      { label: "Krok", width: 3 },
      { label: "Zakres", width: 6 },
      { label: "Status", width: 1.4 },
    ],
    rows: ANALYTICS_STEPS.map((s) => [
      `${s.index}. ${s.title}`,
      s.subtitle,
      ANALYTICS_STEP_STATUS_LABELS[status(s.key)],
    ]),
  };
}

// Profil ryzyka (recommendationLabel) celowo pomijamy: ma inne progi i korektę
// po wycenie rynkowej, więc obok klasy A–E dawałby drugi, sprzeczny werdykt.
interface GradeInfo {
  grade: RiskGrade;
  score: number | null;
}

function gradeFromValuation(v: InvestorValuationSummary | null): GradeInfo | null {
  if (!v) return null;
  const score = v.investmentScore ?? null;
  const grade = v.riskGrade ?? (score != null ? gradeFromScore(score) : null);
  if (!grade) return null;
  return { grade, score };
}

function gradeBlocks(g: GradeInfo): ReportBlock[] {
  const band = gradeBand(g.grade);
  const blocks: ReportBlock[] = [{ t: "heading", text: GRADE_SECTION_TITLE }];
  if (g.score != null) {
    blocks.push({
      t: "score",
      label: "Wynik oceny inwestycyjnej",
      value: g.score,
      color: band.color,
      caption: `klasa ${g.grade} — ${band.label.toLowerCase()}`,
    });
  }
  blocks.push({ t: "gradeScale", grade: g.grade });
  blocks.push({
    t: "paragraph",
    text: `Klasa ${g.grade} (${gradeRangeLabel(band)} pkt) — ${band.label}. ${band.description}`,
  });
  blocks.push({
    t: "paragraph",
    muted: true,
    text:
      "Skala A–E to neutralna klasyfikacja ryzyka (0–100 pkt, wyżej = bezpieczniej), liczona " +
      "automatycznie z ocen cząstkowych — m.in. zabezpieczenia, stanu prawnego KW, pewności " +
      "wyceny, łatwości sprzedaży i weryfikacji właściciela. Nie jest rekomendacją inwestycyjną.",
  });
  return blocks;
}

function componentScoreBlocks(risk: InvestmentRiskAssessment): ReportBlock[] {
  const scores = risk.componentScores;
  if (!scores) return [];
  const blocks: ReportBlock[] = [{ t: "subheading", text: "Oceny cząstkowe" }];
  for (const key of Object.keys(COMPONENT_LABELS) as Array<keyof RiskComponentScores>) {
    const v = Math.round(scores[key] ?? 0);
    blocks.push({
      t: "score",
      label: COMPONENT_LABELS[key],
      value: v,
      color: gradeBand(gradeFromScore(v)).color,
    });
  }
  return blocks;
}

/**
 * Mocne strony i główne ryzyka oceny — osobna sekcja, nie pod klasą A–E:
 * silnik dopisuje do nich „Kategoria zbywalności …” (ta ma własną sekcję)
 * i punkty karty zabezpieczenia (te są w „Analizie zabezpieczenia”).
 */
function highlightBlocks(risk: InvestmentRiskAssessment): ReportBlock[] {
  const cs = risk.collateralAnalysis?.collateralScore;
  const elsewhere = new Set([...(cs?.mainStrengths ?? []), ...(cs?.mainRisks ?? [])]);
  const keep = (items: string[] | undefined) =>
    (items ?? []).filter((x) => !x.startsWith("Kategoria zbywalności") && !elsewhere.has(x));
  const strengths = keep(risk.keyStrengths);
  const risks = keep(risk.keyRisks);
  if (!strengths.length && !risks.length) return [];
  const blocks: ReportBlock[] = [{ t: "heading", text: "Mocne strony i główne ryzyka" }];
  if (strengths.length) {
    blocks.push({ t: "subheading", text: "Mocne strony" }, { t: "bullets", items: strengths });
  }
  if (risks.length) {
    blocks.push({ t: "subheading", text: "Główne ryzyka" }, { t: "bullets", items: risks });
  }
  return blocks;
}

/** Drabina wartości: rynek i licytacje względem kwoty pożyczki (jedna skala PLN). */
function valueLadder(v: InvestorValuationSummary, loanPln: number | null): ReportBlock | null {
  const pv = v.predictedValue;
  const qs = v.quickSale;
  const steps: Array<[string, number | null]> = [
    ["Wartość rynkowa — górna", pv.highPln],
    ["Wartość rynkowa — środkowa", pv.midPln],
    ["Wartość rynkowa — dolna", pv.lowPln],
    ["I licytacja (3/4)", qs.firstAuctionOpeningPln],
    ["II licytacja (2/3)", qs.secondAuctionOpeningPln],
    ["Realny odzysk — dolny", qs.expectedLowPln],
  ];
  const valid = steps.filter((x): x is [string, number] => x[1] != null && x[1] > 0);
  if (valid.length < 2) return null;
  const max = Math.max(...valid.map((x) => x[1]), loanPln ?? 0) * 1.05;
  return {
    t: "compare",
    barName: "wartość / cena",
    refName: loanPln ? `kwota pożyczki ${formatPLN(loanPln)}` : undefined,
    rows: valid.map(([label, val]) => ({
      label,
      value: val,
      ref: loanPln,
      max,
      valueLabel: formatPLN(val),
    })),
  };
}

function valuationBlocks(
  v: InvestorValuationSummary,
  loanPln: number | null = null,
): ReportBlock[] {
  const pv = v.predictedValue;
  const qs = v.quickSale;
  // Wartość dolna/środkowa/górna jest na drabinie wartości — tu tylko gdy drabiny brak.
  const ladderShown = valueLadder(v, loanPln) != null;
  const rows: Array<[string, string]> = [
    ...(ladderShown
      ? []
      : ([
          ["Wartość — dolna", formatPLN(pv.lowPln)],
          ["Wartość — środkowa", formatPLN(pv.midPln)],
          ["Wartość — górna", formatPLN(pv.highPln)],
        ] as Array<[string, string]>)),
    ["Trend rynku", TREND_LABEL[pv.marketTrend] ?? pv.marketTrend],
  ];
  if (pv.suggestedLtvCapPercent != null) {
    rows.push(["Pułap LTV (analiza)", `${pv.suggestedLtvCapPercent}%`]);
  }
  if (pv.suggestedMaxLoanAmountPln != null) {
    rows.push([
      `Kwota przy LTV do ${pv.suggestedLtvCapPercent ?? "—"}%`,
      formatPLN(pv.suggestedMaxLoanAmountPln),
    ]);
  }
  const gb = v.govBenchmark;
  if (gb?.available) {
    const prices = [
      gb.pricePerHa != null ? `${fmtNum(gb.pricePerHa)} zł/ha` : null,
      gb.pricePerM2Median != null ? `${fmtNum(gb.pricePerM2Median)} zł/m²` : null,
    ].filter(Boolean);
    const src =
      gb.primarySource === "RCN"
        ? `RCN — ${gb.rcnTransactions} transakcji`
        : `GUS, ${gb.unitName ?? "—"}`;
    rows.push(["Dane rządowe", `${src}${prices.length ? `: ${prices.join(", ")}` : ""}`]);
  }

  const ladder = valueLadder(v, loanPln);
  const blocks: ReportBlock[] = [
    { t: "heading", text: "Wycena i szybka sprzedaż" },
    ...(ladder ? [ladder] : []),
    { t: "keyValues", rows },
    { t: "subheading", text: "Wartość szybkiej (wymuszonej) sprzedaży — licytacja" },
    {
      t: "table",
      columns: [
        { label: "Poziom", width: 5 },
        { label: "Kwota", width: 2.4, align: "right" },
      ],
      rows: [
        ["Wartość rynkowa (środek prognozy)", formatPLN(pv.midPln)],
        ["I licytacja — 3/4 sumy oszacowania", formatPLN(qs.firstAuctionOpeningPln)],
        ["II licytacja — 2/3 sumy oszacowania", formatPLN(qs.secondAuctionOpeningPln)],
        ["Realny odzysk", `${formatPLN(qs.expectedLowPln)} – ${formatPLN(qs.expectedHighPln)}`],
      ],
    },
    {
      t: "keyValues",
      rows: [["Prawdopodobny wynik", auctionOutcomeLabel(qs.likelyAuctionOutcome as never)]],
    },
  ];
  if (qs.residentialAuctionBlocked) {
    blocks.push({
      t: "note",
      tone: "warning",
      text: `Możliwa blokada licytacji (art. 952¹ § 2 KPC). ${qs.residentialBlockMessage}`,
    });
  }
  return blocks;
}

function saleabilityBlocks(v: InvestorValuationSummary): ReportBlock[] {
  const sa = v.saleability;
  const blocks: ReportBlock[] = [{ t: "heading", text: "Zbywalność i otoczenie rynkowe" }];
  if (sa.available) {
    blocks.push({
      t: "score",
      label: "Łatwość sprzedaży",
      value: sa.score,
      color: NEUTRAL_BAR,
      caption: saleabilityBandLabel(sa.band),
    });
  } else {
    blocks.push({ t: "paragraph", muted: true, text: "Łatwość sprzedaży: brak danych." });
  }
  const rows: Array<[string, string | null]> = [
    [
      "Szacowany czas sprzedaży",
      sa.estimatedDaysOnMarket != null ? `ok. ${sa.estimatedDaysOnMarket} dni` : null,
    ],
    ["Rynek", sa.reasonableMarket ? "rozsądny" : "poniżej 20 tys. mieszkańców"],
    [
      "Kondygnacja",
      sa.floor?.available
        ? `${sa.floor.floorPietro === 0 ? "parter" : `${sa.floor.floorPietro}. piętro`} — ${sa.floor.label}`
        : null,
    ],
    [
      "Ludność miejscowości",
      sa.localityPopulation != null
        ? `${fmtNum(sa.localityPopulation)} (trend: ${POPULATION_TREND_LABEL[sa.populationTrend] ?? sa.populationTrend})`
        : null,
    ],
    [
      "Najbliższe duże miasto",
      sa.nearestLargeCity.name
        ? `${sa.nearestLargeCity.name}${sa.nearestLargeCity.distanceKm != null ? ` (${sa.nearestLargeCity.distanceKm} km)` : ""}`
        : null,
    ],
    [
      "Oferty w okolicy",
      sa.offersTotal > 0 ? `${sa.offersTotal} (biura nieruchomości: ${sa.offersAgency})` : null,
    ],
    [
      "Mediana cen ofertowych",
      sa.medianPricePerM2 != null ? `${formatPLN(sa.medianPricePerM2)}/m²` : null,
    ],
  ];
  blocks.push({ t: "keyValues", rows: rowsWithText(rows) });

  const d = sa.demandDrivers;
  const drivers = [
    d.largeCityWithin50km ? "duże miasto do 50 km" : null,
    d.waterBodyWithin20km ? "zbiornik wodny do 20 km" : null,
    d.spaResortWithin20km ? "kurort / uzdrowisko do 20 km" : null,
    d.sanatoriumWithin20km ? "sanatorium do 20 km" : null,
    d.touristAttractionWithin20km ? "atrakcja turystyczna do 20 km" : null,
    d.majorRoadWithin10km ? "droga S/A/DK do 10 km" : null,
  ].filter((x): x is string => Boolean(x));
  if (drivers.length) {
    blocks.push({ t: "subheading", text: "Czynniki popytu w otoczeniu" });
    blocks.push({ t: "bullets", items: drivers });
  }

  const cat = sa.sellabilityCategory;
  if (cat) {
    blocks.push({ t: "subheading", text: SELLABILITY_SECTION_TITLE });
    blocks.push({
      t: "keyValues",
      rows: rowsWithText([
        [
          "Kategoria",
          SELLABILITY_CATEGORIES.includes(cat.category)
            ? sellabilityCategoryLabel(cat.category as SellabilityCategory)
            : cat.category,
        ],
        ["Profil lokalizacji", cat.label],
        ["Uzasadnienie", cat.rationale],
      ]),
    });
    blocks.push({
      t: "paragraph",
      muted: true,
      text:
        "Kategoria zbywalności opisuje wyłącznie łatwość sprzedaży nieruchomości — to inna " +
        "skala niż ocena inwestycyjna A–E (klasa ryzyka).",
    });
  }

  const b = v.buildability;
  if (b?.applicable) {
    blocks.push({ t: "subheading", text: "Działka i możliwość zabudowy" });
    blocks.push({
      t: "keyValues",
      rows: [
        ["Status działki", plotCategoryLabel(b.category as never)],
        ["Krąg nabywców", buyerPoolLabel(b.buyerPool as never)],
        ["Podstawa wyceny", valuationBasisLabel(b.valuationBasis as never)],
      ],
    });
  }
  return blocks;
}

const POI_LABEL: Record<string, string> = {
  schools: "Szkoły",
  kindergartens: "Przedszkola",
  groceryStores: "Sklepy spożywcze",
  pharmacies: "Apteki",
  clinics: "Przychodnie i szpitale",
  publicTransport: "Przystanki komunikacji",
  parks: "Parki",
  restaurants: "Gastronomia",
  banks: "Banki i bankomaty",
  shopping: "Centra handlowe",
};

const fmtDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`;

const fmtCoord = (v: number) => v.toFixed(6);

/** Lokalizacja i parametry nieruchomości: mapy, działka (ULDK), infrastruktura OSM. */
export function locationBlocks(c: PropertyAnalysisResult | null): ReportBlock[] {
  const blocks: ReportBlock[] = [{ t: "heading", text: "Lokalizacja i nieruchomość" }];
  if (!c) {
    blocks.push({
      t: "paragraph",
      muted: true,
      text: "Mapa i dane lokalizacyjne pojawią się po zakończeniu analizy zabezpieczenia.",
    });
    return blocks;
  }
  const p = c.property;
  const lat = p.latitude;
  const lng = p.longitude;
  const parcel = p.parcel ?? null;
  const area = (v: number | null | undefined, unit = "m²") =>
    v != null && v > 0 ? `${fmtNum(v)} ${unit}` : null;

  blocks.push({
    t: "keyValues",
    rows: rowsWithText([
      ["Rodzaj", propertyLabel(p.type)],
      ["Adres", p.address],
      ["Powiat / województwo", [p.county, p.voivodeship].filter(Boolean).join(", ") || null],
      [
        "Współrzędne",
        lat != null && lng != null
          ? `${fmtCoord(lat)}, ${fmtCoord(lng)}${p.locationApproximate ? " (przybliżone — centrum miejscowości)" : ""}`
          : null,
      ],
      [
        "Powierzchnia użytkowa",
        area(p.usableAreaM2) ?? (p.type === "dom" ? "nieznana (brak w KW i we wniosku)" : null),
      ],
      ["Powierzchnia działki (KW)", area(p.landAreaM2)],
      ["Obszar (KW)", p.landAreaHa ? `${String(p.landAreaHa).replace(".", ",")} ha` : null],
      ["Numer działki (wniosek/KW)", p.parcelNumber],
    ]),
  });

  blocks.push({ t: "tiles", items: locationTiles(c) });

  if (lat != null && lng != null) {
    const exact = !p.locationApproximate;
    blocks.push({
      t: "map",
      lat,
      lng,
      zoom: 12,
      marker: exact,
      caption: exact
        ? "Położenie nieruchomości na tle okolicy (OpenStreetMap)."
        : "Okolica miejscowości — dokładnego adresu nie ustalono (OpenStreetMap).",
    });
    if (exact) {
      blocks.push({
        t: "map",
        lat,
        lng,
        zoom: 17,
        marker: true,
        polygon: parcel?.polygon ?? null,
        caption: parcel
          ? `Zbliżenie: punkt adresu i obrys działki ewidencyjnej ${parcel.number} (ULDK GUGiK, OpenStreetMap).`
          : "Zbliżenie na punkt adresu (OpenStreetMap).",
      });
    }
  } else {
    blocks.push({
      t: "note",
      tone: "info",
      text: "Mapa niedostępna: brak ustalonego położenia (w wersji przed rezerwacją dokładna lokalizacja jest ukryta).",
    });
  }

  if (lat != null && lng != null && !p.locationApproximate) {
    blocks.push({
      t: "map",
      lat,
      lng,
      zoom: 17,
      marker: true,
      polygon: parcel?.polygon ?? null,
      base: "orto",
      caption:
        "Ortofotomapa (zdjęcie lotnicze, Geoportal GUGiK) z punktem adresu i obrysem działki.",
    });
  }

  if (parcel) {
    blocks.push({ t: "subheading", text: "Działka ewidencyjna (ULDK GUGiK)" });
    blocks.push({
      t: "keyValues",
      rows: rowsWithText([
        ["Identyfikator działki", parcel.id],
        ["Numer działki", parcel.number],
        ["Obręb", parcel.region],
        ["Gmina", parcel.commune],
        ["Powiat", parcel.county],
        ["Województwo", parcel.voivodeship],
        ["Powierzchnia z geometrii", area(parcel.areaM2)],
        [
          "Zgodność z KW",
          p.landAreaM2 && parcel.areaM2
            ? Math.abs(parcel.areaM2 - p.landAreaM2) / p.landAreaM2 <= 0.05
              ? `zgodna z obszarem w KW (${fmtNum(p.landAreaM2)} m²)`
              : `różna od obszaru w KW (${fmtNum(p.landAreaM2)} m²) — punkt adresu może wskazywać inną działkę lub KW obejmuje kilka działek`
            : null,
        ],
      ]),
    });
    blocks.push({ t: "paragraph", muted: true, text: parcel.note });
  }
  const bld = c.surroundings?.building ?? null;
  if (bld) {
    blocks.push({
      t: "keyValues",
      rows: rowsWithText([
        ["Budynek ewidencyjny (EGiB)", bld.id],
        [
          "Powierzchnia zabudowy",
          bld.footprintM2 != null
            ? `ok. ${fmtNum(bld.footprintM2)} m² (obrys budynku — nie powierzchnia użytkowa)`
            : null,
        ],
      ]),
    });
  }

  blocks.push(...planningBlocks(c), ...surroundingsBlocks(c));

  const loc = c.locationScore;
  blocks.push({ t: "subheading", text: "Infrastruktura w okolicy (OpenStreetMap)" });
  if (loc?.available === false) {
    blocks.push({ t: "paragraph", muted: true, text: loc.summary });
  } else if (loc) {
    blocks.push({
      t: "score",
      label: "Dostępność infrastruktury",
      value: loc.score,
      color: NEUTRAL_BAR,
      caption: loc.liquidityComment,
    });
    const counts = loc.poiCountsAll ?? loc.poiCounts ?? {};
    const keys = Object.keys(POI_LABEL).filter((k) => counts[k] != null || loc.nearest?.[k]);
    if (keys.length) {
      // Liczba punktów w promieniu (słupki, skala do 20+) z odległością do najbliższego.
      blocks.push({
        t: "bars",
        max: 20,
        rows: keys.map((k) => {
          const n = loc.nearest?.[k];
          const cnt = counts[k] ?? 0;
          return {
            label: POI_LABEL[k],
            value: Math.min(20, cnt),
            valueLabel: `${cnt >= 20 ? "20+" : cnt}${n ? ` · najbliżej ${fmtDistance(n.distanceM)}` : ""}`,
          };
        }),
      });
      const named = keys.filter((k) => loc.nearest?.[k]?.name);
      if (named.length) {
        blocks.push({
          t: "paragraph",
          muted: true,
          text:
            "Najbliższe: " +
            named.map((k) => `${POI_LABEL[k].toLowerCase()} — ${loc.nearest![k].name}`).join("; ") +
            ". Odległości w linii prostej od punktu adresu; dane OpenStreetMap mogą być niekompletne.",
        });
      }
    } else {
      blocks.push({ t: "paragraph", text: loc.summary });
    }
  }
  return blocks;
}

/** Planowanie przestrzenne (MPZP) i mapa zagrożenia powodziowego. */
function planningBlocks(c: PropertyAnalysisResult): ReportBlock[] {
  const p = c.property;
  const lat = p.latitude;
  const lng = p.longitude;
  const blocks: ReportBlock[] = [{ t: "subheading", text: "Plan miejscowy (MPZP) i studium" }];
  const m = c.mpzp ?? null;
  if (m?.status === "found") {
    blocks.push({
      t: "table",
      columns: [
        { label: "Plan", width: 3 },
        { label: "Teren", width: 1.3 },
        { label: "Przeznaczenie", width: 3.4 },
        { label: "Uchwała / obowiązuje", width: 2.4 },
      ],
      rows: m.plans.map((pl) => [
        pl.planName ?? "—",
        pl.symbol ?? "—",
        pl.purpose ?? "—",
        [pl.resolution, pl.validFrom ?? pl.adoptedAt].filter(Boolean).join(" · ") || "—",
      ]),
    });
    const links = [...new Set(m.plans.map((pl) => pl.url).filter((u): u is string => Boolean(u)))];
    if (links.length) blocks.push({ t: "bullets", items: links.map((u) => `Uchwała (BIP): ${u}`) });
  }
  blocks.push({
    t: "paragraph",
    muted: !m || m.status !== "found",
    text: m
      ? m.note
      : p.locationApproximate || lat == null
        ? "MPZP nie sprawdzono — brak dokładnego adresu nieruchomości."
        : "MPZP nie sprawdzono w tej analizie — uruchom analizę ponownie.",
  });
  blocks.push({
    t: "paragraph",
    muted: true,
    text: "Studium uwarunkowań / plan ogólny gminy nie są udostępniane w otwartej usłudze krajowej — sprawdź w urzędzie gminy lub na jej geoportalu.",
  });
  if (lat != null && lng != null && !p.locationApproximate) {
    blocks.push({
      t: "map",
      lat,
      lng,
      zoom: 16,
      marker: true,
      polygon: p.parcel?.polygon ?? null,
      overlay: "mpzp",
      caption:
        "Granice i rysunek planów miejscowych (Krajowa Integracja MPZP, GUGiK) — rysunek widoczny tam, gdzie gmina udostępnia go w usłudze krajowej.",
    });
  }
  if (lat != null && lng != null) {
    blocks.push({ t: "subheading", text: "Mapa zagrożenia powodziowego (ISOK / Wody Polskie)" });
    blocks.push({
      t: "map",
      lat,
      lng,
      zoom: p.locationApproximate ? 13 : 14,
      marker: !p.locationApproximate,
      overlay: "flood",
      caption:
        "Obszary zagrożenia powodzią rzeczną i morską z map zagrożenia powodziowego (ISOK, Wody Polskie) — brak zabarwienia oznacza brak obszaru zagrożenia w zasięgu mapy.",
    });
  }
  return blocks;
}

/** Otoczenie: obszary chronione, uciążliwości (OSM) i powiat (GUS BDL). */
function surroundingsBlocks(c: PropertyAnalysisResult): ReportBlock[] {
  const sr = c.surroundings;
  const p = c.property;
  if (!sr) return [];
  const blocks: ReportBlock[] = [{ t: "subheading", text: "Obszary chronione przyrody" }];
  const pa = sr.protectedAreas;
  if (pa?.areas.length) {
    blocks.push({
      t: "table",
      columns: [
        { label: "Obszar", width: 4 },
        { label: "Rodzaj", width: 4 },
        { label: "Kod", width: 1.6 },
      ],
      rows: pa.areas.map((a) => [a.name, a.type, a.code ?? "—"]),
    });
    blocks.push({ t: "note", tone: "warning", text: pa.note });
  } else {
    blocks.push({
      t: "paragraph",
      muted: true,
      text: pa?.note ?? "Obszarów chronionych nie sprawdzono.",
    });
  }
  if (p.latitude != null && p.longitude != null) {
    blocks.push({
      t: "map",
      lat: p.latitude,
      lng: p.longitude,
      zoom: 12,
      marker: !p.locationApproximate,
      overlay: "protected",
      caption:
        "Obszary Natura 2000 i krajowe formy ochrony przyrody (EEA, dane zgłoszone przez Polskę) w okolicy nieruchomości.",
    });
  }

  const nu = sr.nuisances;
  if (nu) {
    blocks.push({
      t: "subheading",
      text: `Uciążliwości w promieniu ${fmtDistance(nu.radiusM)} (OpenStreetMap)`,
    });
    if (nu.hits.length) {
      blocks.push({
        t: "distances",
        maxM: nu.radiusM,
        rows: nu.hits.map((h) => ({
          label: `${NUISANCE_LABEL[h.key]}${h.name ? ` (${h.name})` : ""}`,
          distanceM: h.distanceM,
          thresholdM: NUISANCE_ALERT_M[h.key],
          alert: h.alert,
        })),
      });
    }
    blocks.push({ t: "paragraph", muted: !nu.hits.some((h) => h.alert), text: nu.note });
  }

  const pw = sr.powiat;
  if (pw?.status === "checked") {
    const num = (x: number) => String(x).replace(".", ",");
    const pct = (x: number | null, sign = false) =>
      x == null ? null : `${sign && x > 0 ? "+" : ""}${num(x)}%`;
    blocks.push({
      t: "subheading",
      text: `${pw.unitName ?? "Powiat"} — dane GUS (${pw.year ?? "—"})`,
    });
    blocks.push({
      t: "tiles",
      items: [
        { label: "Ludność powiatu", value: pw.population != null ? fmtNum(pw.population) : "—" },
        {
          label: "Bezrobocie",
          value: pw.unemploymentPct != null ? `${num(pw.unemploymentPct)}%` : "—",
        },
        {
          label: "Wynagrodzenia (PL=100)",
          value: pw.wageIndexPl100 != null ? num(pw.wageIndexPl100) : "—",
        },
      ],
    });
    const cmp: Array<{
      label: string;
      value: number;
      ref?: number | null;
      max: number;
      valueLabel: string;
    }> = [];
    if (pw.unemploymentPct != null) {
      const max = Math.max(pw.unemploymentPct, pw.unemploymentPolandPct ?? 0) * 1.4 || 10;
      cmp.push({
        label: "Stopa bezrobocia",
        value: pw.unemploymentPct,
        ref: pw.unemploymentPolandPct,
        max,
        valueLabel: `${num(pw.unemploymentPct)}% (PL ${pw.unemploymentPolandPct != null ? num(pw.unemploymentPolandPct) : "—"}%)`,
      });
    }
    if (pw.wageIndexPl100 != null) {
      cmp.push({
        label: "Wynagrodzenia",
        value: pw.wageIndexPl100,
        ref: 100,
        max: Math.max(150, pw.wageIndexPl100 * 1.1),
        valueLabel: `${num(pw.wageIndexPl100)}% średniej PL`,
      });
    }
    if (cmp.length) blocks.push({ t: "compare", barName: "powiat", refName: "Polska", rows: cmp });
    // Różne jednostki (% i ‰) — jeden wykres, ale każdy wiersz z własną skalą i jednostką.
    const div: Array<{ label: string; value: number; valueLabel: string; maxAbs?: number }> = [];
    if (pw.populationChange5yPct != null)
      div.push({
        label: "Zmiana ludności (5 lat)",
        value: pw.populationChange5yPct,
        valueLabel: pct(pw.populationChange5yPct, true) ?? "—",
        maxAbs: Math.max(10, Math.abs(pw.populationChange5yPct)),
      });
    if (pw.migrationPer1000 != null)
      div.push({
        label: "Saldo migracji (na 1000 mieszk.)",
        value: pw.migrationPer1000,
        valueLabel: `${pw.migrationPer1000 > 0 ? "+" : ""}${num(pw.migrationPer1000)} ‰`,
        maxAbs: Math.max(10, Math.abs(pw.migrationPer1000)),
      });
    if (div.length)
      blocks.push({
        t: "diverging",
        positiveName: "przyrost / napływ",
        negativeName: "spadek / odpływ",
        rows: div,
      });
  }
  return blocks;
}

function collateralBlocks(c: PropertyAnalysisResult): ReportBlock[] {
  const cs = c.collateralScore;
  const blocks: ReportBlock[] = [
    { t: "heading", text: "Analiza zabezpieczenia" },
    {
      t: "score",
      label: "Ocena zabezpieczenia",
      value: cs.total,
      color: NEUTRAL_BAR,
      caption: collateralCategoryLabel(cs.category),
    },
  ];
  if (c.investmentOfferText?.investorShortSummary) {
    blocks.push({ t: "paragraph", text: c.investmentOfferText.investorShortSummary });
  }
  const flood =
    c.floodRisk && c.floodRisk.riskLevel !== "none" && c.floodRisk.riskLevel !== "unknown"
      ? (FLOOD_LABEL[c.floodRisk.riskLevel] ?? c.floodRisk.riskLevel)
      : null;
  blocks.push({
    t: "keyValues",
    rows: rowsWithText([
      [
        "Zakres wartości (konserwatywnie)",
        `${formatPLN(c.valuationBenchmark.conservativeLowPln)} – ${formatPLN(c.valuationBenchmark.conservativeHighPln)}`,
      ],
      ["LTV", c.ltv.ltvPercent != null ? `${c.ltv.ltvPercent}%` : "—"],
      ["Ryzyko powodziowe", flood],
      ["Opis ryzyka powodziowego", flood ? c.investmentOfferText?.floodRiskSummary : null],
    ]),
  });
  const comp = cs.components;
  if (comp) {
    blocks.push({ t: "subheading", text: "Składowe oceny zabezpieczenia" });
    const parts: Array<[string, number | null | undefined]> = [
      ["Stan prawny i dokumenty", comp.legalAndDocuments],
      ["Wartość i LTV", comp.valueAndLtv],
      ["Płynność rynku", comp.marketLiquidity],
      ["Ryzyka techniczne i użytkowe", comp.technicalAndUseRisks],
      ["Jakość danych", comp.dataQuality],
    ];
    for (const [label, v] of parts) {
      if (v != null && Number.isFinite(v))
        blocks.push({ t: "score", label, value: Math.round(v), color: NEUTRAL_BAR });
    }
  }

  const pv = c.portalValuation ?? c.perplexityValuation ?? null;
  if (pv && pv.status === "success") {
    blocks.push({ t: "subheading", text: "Porównania rynkowe (portale nieruchomości)" });
    blocks.push({
      t: "keyValues",
      rows: rowsWithText([
        [
          "Porównania",
          `${pv.comparablesFound}${pv.transactionsFound ? ` (w tym transakcje: ${pv.transactionsFound})` : ""}`,
        ],
        [
          "Mediana zł/m²",
          pv.pricePerM2Median != null ? `${formatPLN(pv.pricePerM2Median)}/m²` : null,
        ],
        [
          "Średnia zł/m²",
          pv.pricePerM2Average != null ? `${formatPLN(pv.pricePerM2Average)}/m²` : null,
        ],
        [
          "Rozpiętość zł/m²",
          pv.pricePerM2Min != null && pv.pricePerM2Max != null
            ? `${formatPLN(pv.pricePerM2Min)} – ${formatPLN(pv.pricePerM2Max)}`
            : null,
        ],
        ["Cena za ha", pv.pricePerHa != null ? `${formatPLN(pv.pricePerHa)}/ha` : null],
        [
          "Zakres wartości z porównań",
          pv.estimatedValueLowPln != null || pv.estimatedValueHighPln != null
            ? `${formatPLN(pv.estimatedValueLowPln)} – ${formatPLN(pv.estimatedValueHighPln)}`
            : null,
        ],
        ["Trend rynku", pv.marketTrend ? (TREND_LABEL[pv.marketTrend] ?? pv.marketTrend) : null],
        ["Płynność", pv.liquidityComment],
        ["Źródła", pv.sourcesSummary],
      ]),
    });
    if (pv.rationale) blocks.push({ t: "paragraph", muted: true, text: pv.rationale });
  }
  if (c.marketLiquidity?.summary) {
    blocks.push({
      t: "keyValues",
      rows: [["Rynek lokalny", c.marketLiquidity.summary]],
    });
  }

  const fr = c.floodRisk;
  if (fr?.available) {
    const yes = (b: boolean) => (b ? "tak" : "nie");
    blocks.push({ t: "subheading", text: "Ryzyko powodziowe (ISOK / Wody Polskie)" });
    blocks.push({
      t: "keyValues",
      rows: rowsWithText([
        [
          "Poziom",
          FLOOD_LABEL[fr.riskLevel] ??
            (fr.riskLevel === "none" ? "brak w mapach zagrożenia" : fr.riskLevel),
        ],
        ["Scenariusz 10% (raz na 10 lat)", yes(fr.scenario10Percent)],
        ["Scenariusz 1% (raz na 100 lat)", yes(fr.scenario1Percent)],
        ["Scenariusz 0,2% (raz na 500 lat)", yes(fr.scenario02Percent)],
        ["Obszar szczególnego zagrożenia", yes(fr.specialFloodHazardArea)],
        [
          "Głębokość wody",
          fr.waterDepth != null ? `${String(fr.waterDepth).replace(".", ",")} m` : null,
        ],
        [
          "Prędkość przepływu",
          fr.flowVelocity != null ? `${String(fr.flowVelocity).replace(".", ",")} m/s` : null,
        ],
        [
          "Podstawa",
          fr.geometryUsed === "parcel_geometry"
            ? "geometria działki"
            : fr.geometryUsed === "address_geocoding"
              ? "punkt adresu"
              : fr.geometryUsed === "point"
                ? "punkt"
                : null,
        ],
      ]),
    });
  }

  if (cs.mainStrengths.length) {
    blocks.push({ t: "subheading", text: "Mocne strony zabezpieczenia" });
    blocks.push({ t: "bullets", items: cs.mainStrengths });
  }
  if (cs.mainRisks.length) {
    blocks.push({ t: "subheading", text: "Ryzyka zabezpieczenia" });
    blocks.push({ t: "bullets", items: cs.mainRisks });
  }
  if (c.warnings?.length) {
    blocks.push({ t: "subheading", text: "Uwagi z analizy danych" });
    blocks.push({ t: "bullets", items: [...new Set(c.warnings)].slice(0, 15) });
  }
  return blocks;
}

/** Najdłuższy cytat z KW w PDF-ie (znaki). */
const QUOTE_MAX = 600;

function sourceLine(e: SourceEvidence): string | null {
  if (!e.rawValue?.trim()) return null;
  const where = [
    KW_SECTION_LABEL[e.section] ?? e.section,
    e.fieldCode ?? null,
    e.entryNumber ? `wpis ${e.entryNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // Najpierw maska, potem skrót: cięcie w środku numeru zostawiłoby 7–10 cyfr
  // PESEL, których maska (pełne 11 cyfr) już nie rozpozna. Urwany cięciem
  // ciąg cyfr (albo zamaskowanego numeru) odcinamy w całości.
  const masked = maskPeselInText(e.rawValue);
  let quote = masked;
  if (masked.length > QUOTE_MAX) {
    const cut = masked.slice(0, QUOTE_MAX);
    const midNumber = /[\d*]/.test(masked[QUOTE_MAX]);
    quote = `${(midNumber ? cut.replace(/[\d*]+$/, "") : cut).trimEnd()}…`;
  }
  return `${where}${e.fieldLabel ? ` — ${e.fieldLabel}` : ""}: „${quote}”`;
}

function findingBlocks(f: KwFinding, index: number): ReportBlock[] {
  const sources = f.source.map(sourceLine).filter((s): s is string => Boolean(s));
  const docs = f.requestedDocuments.map(
    (d) =>
      `• ${d.label}${d.requiredFields?.length ? ` — pola: ${d.requiredFields.join(", ")}` : ""}`,
  );
  // Wyłącznie treść dla inwestora — komunikaty do pośrednika i klienta nie trafiają do PDF-u.
  return [
    { t: "subheading", text: `${index}. ${STATUS_LABELS[f.status]} — ${f.title}` },
    { t: "paragraph", text: f.plainLanguageSummary },
    {
      t: "keyValues",
      rows: rowsWithText([
        ["Wpływ na miejsce hipoteki", IMPACT_LABEL[f.rankImpact] ?? f.rankImpact],
        ["Wpływ na egzekucję", IMPACT_LABEL[f.enforcementImpact] ?? f.enforcementImpact],
        ["Źródło w KW", sources.length ? sources.join("\n") : null],
        ["Dlaczego to ważne", f.whyItMatters],
        ["Oczekiwane od klienta", f.expectedFromClient],
        ["Wymagane dokumenty", docs.length ? docs.join("\n") : null],
        ["Proponowane rozwiązanie", f.proposedResolution],
        ["Warunek umowy", f.agreementCondition],
        ["Warunek wypłaty", f.payoutCondition],
        ["Co to oznacza dla inwestora", f.investorMessage],
      ]),
    },
  ];
}

function kwAnalysisBlocks(kw: { result: KwAnalysisResult; createdAt: string }): ReportBlock[] {
  const r = kw.result;
  const cltv =
    r.ltv.determinable && r.ltv.cltv != null
      ? `${(r.ltv.cltv * 100).toFixed(1).replace(".", ",")}%`
      : "brak danych";
  const blocks: ReportBlock[] = [
    { t: "heading", text: "Analiza księgi wieczystej" },
    {
      t: "keyValues",
      rows: [
        ["Numer KW", formatKwNumber(r.kwNumber) ?? r.kwNumber],
        ["Status zbiorczy", STATUS_LABELS[r.overallStatus]],
        [
          "Przewidywane miejsce hipoteki",
          r.priority.determinable ? `${r.priority.expectedInvestorRank}.` : "niejednoznaczne",
        ],
        ["CLTV", cltv],
        ["Aktywne wzmianki", String(r.activeMentionCount)],
        ["Nierozwiązane alerty", String(r.unresolvedFindingCount)],
        ["Treść KW pobrana", formatWarsawDateTime(r.fetchedAt)],
        ["Analiza z", formatWarsawDateTime(kw.createdAt)],
        ["Wersja reguł", r.rulesetVersion],
      ],
    },
    { t: "subheading", text: "Docelowe miejsce hipoteki" },
  ];
  if (r.priority.explanation) blocks.push({ t: "paragraph", text: r.priority.explanation });
  if (r.ltv.note) blocks.push({ t: "paragraph", muted: true, text: r.ltv.note });
  const conditions = r.priority.requiredConditions ?? [];
  if (conditions.length) {
    blocks.push({ t: "subheading", text: "Warunki" });
    blocks.push({ t: "bullets", items: conditions });
  }
  const prior = r.priority.effectivePriorEncumbrances ?? [];
  if (prior.length) {
    blocks.push({ t: "subheading", text: "Obciążenia poprzedzające" });
    blocks.push({
      t: "bullets",
      items: prior.map(
        (e) =>
          `${e.label}${e.sum != null ? ` — suma ${fmtNum(e.sum)} ${e.currency ?? "PLN"}` : ""}`,
      ),
    });
  }

  const findings = [...r.findings].sort(
    (a, b) => STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status],
  );
  blocks.push({ t: "subheading", text: "Zestawienie znalezisk" });
  if (findings.length === 0) {
    blocks.push({ t: "paragraph", muted: true, text: "Brak znalezisk." });
    return blocks;
  }
  blocks.push({
    t: "table",
    columns: [
      { label: "Nr", width: 0.5 },
      { label: "Status", width: 1.7 },
      { label: "Obszar", width: 1.9 },
      { label: "Znalezisko", width: 5 },
    ],
    rows: findings.map((f, i) => [
      String(i + 1),
      STATUS_LABELS[f.status],
      CATEGORY_LABEL[f.category] ?? f.category,
      f.title,
    ]),
  });
  findings.forEach((f, i) => blocks.push(...findingBlocks(f, i + 1)));
  return blocks;
}

function longevityBlocks(v: InvestorValuationSummary | null): ReportBlock[] {
  const rows = v?.ownerLongevity ?? [];
  const blocks: ReportBlock[] = [];
  if (v?.courtRegistry) {
    blocks.push({ t: "subheading", text: "KRZ / MSiG — wynik w ocenie ryzyka" });
    blocks.push({
      t: v.courtRegistry.confirmedHits > 0 ? "note" : "paragraph",
      ...(v.courtRegistry.confirmedHits > 0 ? { tone: "warning" as const } : {}),
      text: v.courtRegistry.summary,
    } as ReportBlock);
  }
  if (!rows.length) return blocks;
  const pct = (x: number | null) => (x != null ? `${Math.round(x * 100)}%` : "—");
  const yrs = (x: number | null) => (x != null ? `${String(x).replace(".", ",")} lat` : "—");
  blocks.push({ t: "subheading", text: "Dożycie właścicieli (GUS, z korektą regionalną)" });
  blocks.push({
    t: "table",
    columns: [
      { label: "Osoba", width: 2.2 },
      { label: "Wiek / płeć", width: 2 },
      { label: "e(x) Polska", width: 1.5, align: "right" },
      { label: "Wsp. regionu", width: 1.5, align: "right" },
      { label: "e(x) region", width: 1.5, align: "right" },
      { label: "Przeżycie okresu", width: 1.7, align: "right" },
    ],
    rows: rows.map((r) => [
      r.role,
      [r.ageRange, r.sex === "M" ? "M" : r.sex === "K" ? "K" : null].filter(Boolean).join(" · ") ||
        "—",
      yrs(r.nationalRemainingYears),
      r.regionalFactor != null ? String(r.regionalFactor).replace(".", ",") : "—",
      yrs(r.remainingYears),
      `${pct(r.survivalOverTerm)}${r.loanTermYears ? ` (${r.loanTermYears} l.)` : ""}`,
    ]),
  });
  const exRows = rows.filter((r) => r.remainingYears != null);
  if (exRows.length) {
    const maxEx =
      Math.max(...exRows.map((r) => Math.max(r.remainingYears!, r.nationalRemainingYears ?? 0))) *
      1.15;
    blocks.push({
      t: "compare",
      barName: "dalsze trwanie życia — region nieruchomości",
      refName: "średnia Polska",
      rows: exRows.map((r) => ({
        label: `${r.role}${r.ageRange ? ` (${r.ageRange})` : ""}`,
        value: r.remainingYears!,
        ref: r.nationalRemainingYears,
        max: maxEx,
        valueLabel: `${yrs(r.remainingYears)} (PL ${yrs(r.nationalRemainingYears)})`,
      })),
    });
  }
  const survRows = rows.filter((r) => r.survivalOverTerm != null);
  if (survRows.length) {
    blocks.push({
      t: "paragraph",
      muted: true,
      text: "Prawdopodobieństwo przeżycia całego okresu pożyczki:",
    });
    blocks.push({
      t: "bars",
      max: 100,
      rows: survRows.map((r) => ({
        label: r.role,
        value: Math.round(r.survivalOverTerm! * 100),
        valueLabel: `${pct(r.survivalOverTerm)}${r.loanTermYears ? ` w ${r.loanTermYears} l.` : ""}`,
      })),
    });
  }
  const notes = [
    ...new Set(rows.map((r) => r.regionalNote).filter((n): n is string => Boolean(n))),
  ];
  blocks.push({
    t: "bullets",
    items: [...rows.map((r) => `${r.role}: ${r.band}.`), ...notes],
  });
  blocks.push({
    t: "paragraph",
    muted: true,
    text: "Szacunek populacyjny (tablice trwania życia GUS × współczynnik e(x) podregionu nieruchomości do e(x) Polski, GUS BDL) — nie prognoza indywidualna ani ocena stanu zdrowia.",
  });
  return blocks;
}

function ownersBlocks(co: AnalyticsCoOwners): ReportBlock[] {
  const n = co.totalOwnersInKw;
  const blocks: ReportBlock[] = [
    { t: "heading", text: "Właściciele i rejestry" },
    {
      t: "paragraph",
      muted: true,
      text: `${n} ${n === 1 ? "właściciel" : "właścicieli"} w dziale II KW${
        co.generatedAt ? ` · sprawdzono ${formatWarsawDateTime(co.generatedAt)}` : ""
      }`,
    },
  ];
  if (co.summary) blocks.push({ t: "paragraph", text: co.summary });
  if (co.warnings.length) {
    blocks.push({ t: "subheading", text: "Na co zwrócić uwagę" });
    blocks.push({ t: "bullets", items: co.warnings });
  }
  if (co.owners.length) {
    // Tylko imię i nazwisko (albo rola przed rezerwacją) — bez PESEL i dat urodzenia.
    blocks.push({
      t: "table",
      columns: [
        { label: "Właściciel", width: 3 },
        { label: "Udział", width: 2 },
        { label: "CEIDG", width: 2.4 },
        { label: "KRS", width: 3 },
      ],
      rows: co.owners.map((o) => [
        `${o.fullName ?? "Właściciel"}${o.isPrimaryClient ? " (pożyczkobiorca)" : ""}`,
        [o.share ? `udział ${o.share}` : null, o.coOwnershipType].filter(Boolean).join(" · ") ||
          "—",
        o.businessStatus ?? "nie sprawdzono",
        o.krs
          .map(
            (k) =>
              `${k.companyName}${k.role ? ` (${k.role})` : ""}${k.flags.length ? ` — ${k.flags.join(", ")}` : ""}`,
          )
          .join("; ") || "—",
      ]),
    });
    const notes = co.owners.flatMap((o) =>
      o.notes.map((note) => `${o.fullName ?? "Właściciel"}: ${note}`),
    );
    if (notes.length) blocks.push({ t: "bullets", items: notes });
  }
  if (co.intelligence) {
    const intelligence = co.intelligence;
    const statusLabel = (status: "checked" | "unavailable" | "partial") =>
      status === "checked"
        ? "Sprawdzono dostępny zakres"
        : status === "partial"
          ? "Wynik częściowy"
          : "Nie sprawdzono / źródło niedostępne";
    blocks.push(
      { t: "heading", text: "Wywiad gospodarczy właścicieli — KRZ, MSiG i giełdy długów" },
      {
        t: "paragraph",
        muted: true,
        text: `Sprawdzono ${formatWarsawDateTime(intelligence.checkedAt)}. ${intelligence.note}`,
      },
    );
    for (const owner of intelligence.subjects) {
      blocks.push(
        {
          t: "subheading",
          text: `${owner.kind === "company" ? "Podmiot" : "Osoba"}: ${owner.name}`,
        },
        {
          t: "keyValues",
          rows: [
            ["KRZ / MSiG", `${statusLabel(owner.courtStatus)}. ${owner.courtNote}`],
            [
              "Giełdy wierzytelności",
              `${statusLabel(owner.exchangesStatus)}. ${owner.exchangesNote}`,
            ],
          ],
        },
      );
      if (owner.hits.length) {
        blocks.push({
          t: "table",
          columns: [
            { label: "Źródło", width: 2 },
            { label: "Ustalenie", width: 3 },
            { label: "Data / sygnatura", width: 2 },
            { label: "Zgodność", width: 2 },
          ],
          rows: owner.hits.map((hit) => [
            hit.source,
            `${hit.title}${hit.detail ? ` — ${hit.detail}` : ""}`,
            [hit.publicationDate, hit.caseSignature].filter(Boolean).join(" / ") || "brak",
            hit.match === "identifier" ? "Identyfikator zgodny" : "Tylko nazwa — do weryfikacji",
          ]),
        });
        blocks.push({
          t: "bullets",
          items: owner.hits.map((hit) => `Źródło (${hit.source}): ${hit.url}`),
        });
        for (const hit of owner.hits) {
          if (!hit.proceeding) continue;
          const p = hit.proceeding;
          blocks.push(
            {
              t: "subheading",
              text: `Pogłębiony raport postępowania — ${p.signatures[0] ?? p.kind}`,
            },
            { t: "keyValues", rows: proceedingRows(p) },
            {
              t: "table",
              columns: [
                { label: "Data", width: 1 },
                { label: "MSiG / poz.", width: 1 },
                { label: "Ogłoszenie", width: 4 },
              ],
              rows: p.timeline.map((n) => [
                n.publicationDate,
                `${n.monitorNumber}${n.position ? ` / ${n.position}` : ""}`,
                `${n.chapter ?? "ogłoszenie"}${n.summary ? ` — ${n.summary.slice(0, 160)}…` : ""}`,
              ]),
            },
          );
        }
      } else {
        blocks.push({
          t: "paragraph",
          muted: true,
          text: "Nie znaleziono dopasowanych publikacji w sprawdzonym zakresie. To nie oznacza braku zadłużenia.",
        });
      }
    }
  }
  return blocks;
}

function sourcesBlocks(sources: DataSourceUsage[]): ReportBlock[] {
  const used = sources.filter((s) => s.used);
  if (!used.length) return [];
  return [
    { t: "heading", text: "Źródła danych" },
    {
      t: "table",
      columns: [
        { label: "Źródło", width: 4 },
        { label: "Zastosowanie", width: 5 },
      ],
      rows: used.map((s) => [s.source, s.purpose]),
    },
  ];
}

function disclaimerBlocks(withKwAnalysis: boolean): ReportBlock[] {
  const blocks: ReportBlock[] = [
    { t: "heading", text: "Zastrzeżenia" },
    { t: "paragraph", text: RISK_DISCLAIMER_TEXT },
  ];
  // Zastrzeżenie analizy KW — tylko gdy raport ją zawiera.
  if (withKwAnalysis) blocks.push({ t: "paragraph", text: REPORT_DISCLAIMER });
  blocks.push({ t: "paragraph", text: VALUATION_NOT_APPRAISAL });
  return blocks;
}

/** Sekcja kroku bez wyniku — jak puste karty kroków na ekranie. */
function pendingSection(title: string, text: string): ReportBlock[] {
  return [
    { t: "heading", text: title },
    { t: "paragraph", muted: true, text },
  ];
}

function kwDocumentRow(doc: AnalyticsKwDocument | null): [string, string | null] {
  return ["Treść KW pobrana", doc?.fetchedAt ? formatWarsawDateTime(doc.fetchedAt) : null];
}

/** Część wspólna trzech widoków: ocena A–E, wycena, zbywalność, zabezpieczenie, KW, właściciele. */
function resultBlocks(a: {
  grade: GradeInfo | null;
  gradeExtra?: ReportBlock[];
  /** Mocne strony i ryzyka oceny (po zabezpieczeniu). */
  highlights?: ReportBlock[];
  valuation: InvestorValuationSummary | null;
  collateral: PropertyAnalysisResult | null;
  kwAnalysis: { result: KwAnalysisResult; createdAt: string } | null;
  coowners: AnalyticsCoOwners | null;
  sources: DataSourceUsage[];
}): ReportBlock[] {
  const blocks: ReportBlock[] = [];
  if (a.grade) blocks.push(...gradeBlocks(a.grade), ...(a.gradeExtra ?? []));
  blocks.push(...locationBlocks(a.collateral));
  if (a.valuation)
    blocks.push(
      ...valuationBlocks(a.valuation, a.collateral?.ltv?.requestedLoanAmountPln ?? null),
      ...saleabilityBlocks(a.valuation),
    );
  if (a.collateral) blocks.push(...collateralBlocks(a.collateral));
  blocks.push(...(a.highlights ?? []));
  if (!a.valuation && !a.collateral) {
    blocks.push(
      ...pendingSection(
        "Wycena i zbywalność",
        "Prognoza wartości, szybkiej sprzedaży i zbywalności pojawi się po zakończeniu analizy ryzyka.",
      ),
    );
  }
  blocks.push(
    ...(a.kwAnalysis
      ? kwAnalysisBlocks(a.kwAnalysis)
      : pendingSection(
          "Analiza księgi wieczystej",
          "Raport analizy KW pojawi się po pobraniu księgi wieczystej i przejściu silnika reguł.",
        )),
    ...(a.coowners
      ? ownersBlocks(a.coowners)
      : pendingSection(
          "Właściciele i rejestry",
          "Zestawienie właścicieli z działu II KW z CEIDG i KRS pojawi się po zakończeniu kroku 2.",
        )),
    ...longevityBlocks(a.valuation),
  );
  blocks.push(...sourcesBlocks(a.sources), ...disclaimerBlocks(a.kwAnalysis != null));
  return blocks;
}

// ── trzy widoki ────────────────────────────────────────────────────────────

function fromAnalytics(d: AnalyticsDetail): InvestorReportModel {
  const item = d.item;
  const done = analyticsDoneCount(item);
  const run = item.run;
  const rows = rowsWithText([
    [
      "Źródło",
      `${ANALYTICS_SOURCE_LABELS[item.source]}${item.projectRef ? ` · ${item.projectRef}` : ""}`,
    ],
    ["Nieruchomość", itemTitle(item)],
    ["Województwo", item.voivodeship],
    ["Kwota pożyczki", formatPLN(item.loanAmount)],
    ["Okres", item.periodMonths != null ? `${item.periodMonths} mies.` : null],
    ["LTV wniosku", item.ltv != null ? `${item.ltv}%` : null],
    ["Wartość szacunkowa", item.estimatedValue != null ? formatPLN(item.estimatedValue) : null],
    ["Powierzchnia", item.areaSqm != null ? `${item.areaSqm} m²` : null],
    ["Numer KW", item.kwNumber ?? "—"],
    kwDocumentRow(d.kwDocument),
    [
      "Potencjał lokalizacji",
      item.locationScore != null ? `${Math.round(item.locationScore)}/100` : null,
    ],
    ["Postęp analizy", `${done} z ${ANALYTICS_STEPS.length} kroków`],
    [
      "Przebieg automatu",
      run
        ? `start ${formatWarsawDateTime(run.startedAt)}${run.finishedAt ? ` · koniec ${formatWarsawDateTime(run.finishedAt)}` : ""}`
        : null,
    ],
  ]);
  return {
    kind: "analityka",
    title: "Raport analityczny",
    subtitle: `${itemTitle(item)} · ${formatPLN(item.loanAmount)}`,
    kwNumber: item.kwNumber,
    projectRef: item.projectRef,
    teaser: false,
    stepsDone: done,
    blocks: [
      { t: "heading", text: "Podsumowanie" },
      { t: "keyValues", rows },
      stepsTable((k) => analyticsStepStatus(item, k)),
      ...resultBlocks({
        grade: gradeFromValuation(d.valuation),
        valuation: d.valuation,
        collateral: d.collateral,
        kwAnalysis: d.kwAnalysis,
        coowners: d.coowners,
        sources: d.collateral?.dataSourcesUsed ?? [],
      }),
    ],
  };
}

function fromKwCheck(d: KwCheckDetail): InvestorReportModel {
  const item = d.item;
  const status = (k: AnalyticsStepKey) => kwCheckStepStatus(item, k);
  const done = ANALYTICS_STEPS.filter((s) => status(s.key) === "done").length;
  const risk = d.risk;
  const score =
    risk && Number.isFinite(risk.investmentScore) ? Math.round(risk.investmentScore) : null;
  const grade: GradeInfo | null = risk
    ? { grade: risk.riskGrade ?? gradeFromScore(score ?? 0), score }
    : null;
  const rows = rowsWithText([
    ["Rodzaj", "Wniosek spoza Finance You"],
    ["Nazwa", item.label || "Wniosek zewnętrzny"],
    ["Numer KW", item.kwNumber],
    kwDocumentRow(d.kwDocument),
    ["Rodzaj nieruchomości", propertyLabel(item.propertyType)],
    ["Kwota pożyczki", item.loanAmount != null ? formatPLN(item.loanAmount) : null],
    ["Okres", item.periodMonths != null ? `${item.periodMonths} mies.` : null],
    ["Wartość nieruchomości", item.propertyValue != null ? formatPLN(item.propertyValue) : null],
    ["Zlecono", formatWarsawDateTime(item.createdAt)],
    ["Zakończono", item.finishedAt ? formatWarsawDateTime(item.finishedAt) : null],
    ["Postęp analizy", `${done} z ${ANALYTICS_STEPS.length} kroków`],
  ]);
  const gradeExtra: ReportBlock[] = risk
    ? [
        {
          t: "paragraph",
          muted: true,
          text: `Ocena z ${formatWarsawDateTime(risk.generatedAt)}. Dla tematu spoza Finance You bez dokumentów i korespondencji klienta — parametry nieruchomości pochodzą z działu I-O KW.`,
        },
        ...componentScoreBlocks(risk),
      ]
    : [];
  return {
    kind: "kw_check",
    title: "Raport analityczny",
    subtitle: `${item.label || "Wniosek spoza Finance You"} · KW ${item.kwNumber}`,
    kwNumber: item.kwNumber,
    projectRef: null,
    teaser: false,
    stepsDone: done,
    blocks: [
      { t: "heading", text: "Podsumowanie" },
      { t: "keyValues", rows },
      stepsTable(status),
      ...resultBlocks({
        grade,
        gradeExtra,
        highlights: risk ? highlightBlocks(risk) : [],
        valuation: risk ? buildInvestorValuationSummary(risk) : null,
        collateral: risk?.collateralAnalysis ?? null,
        kwAnalysis: d.kwAnalysis,
        coowners: d.coowners,
        sources: risk?.dataSources ?? [],
      }),
    ],
  };
}

function fromOrderReport(
  d: OrderProjectReportDetail,
  project: { ref: string | null; loanAmount: number | null } | undefined,
): InvestorReportModel {
  const r = d.report;
  const src = orderReportStepSource(r);
  const done = analyticsDoneCount(src);
  const teaser = !d.disclosed;
  const prop = d.collateral?.property ?? null;
  const projectRef = project?.ref?.trim() || null;
  const subtitle = [
    projectRef ? `Projekt ${projectRef}` : ANALYTICS_SOURCE_LABELS["okazja"],
    propertyLabel(prop?.type),
    prop?.voivodeship,
  ]
    .filter(Boolean)
    .join(" · ");
  const reportStatus: Record<typeof r.status, string> = {
    none: "nie zamówiono",
    running: "w toku",
    done: "zakończony",
    error: "zakończony z błędem",
  };
  const rows = rowsWithText([
    ["Źródło", ANALYTICS_SOURCE_LABELS["okazja"]],
    ["Projekt", projectRef],
    ["Wnioskowana kwota", project?.loanAmount != null ? formatPLN(project.loanAmount) : null],
    ["Numer KW", d.kwNumber ? `${d.kwNumber}${teaser ? " (zamaskowany do rezerwacji)" : ""}` : "—"],
    kwDocumentRow(d.kwDocument),
    ["Rodzaj nieruchomości", propertyLabel(prop?.type)],
    ["Województwo", prop?.voivodeship],
    [
      "Potencjał lokalizacji",
      r.locationScore != null ? `${Math.round(r.locationScore)}/100` : null,
    ],
    ["Stan raportu", reportStatus[r.status]],
    ["Przebieg zakończony", r.finishedAt ? formatWarsawDateTime(r.finishedAt) : null],
    ["Postęp analizy", `${done} z ${ANALYTICS_STEPS.length} kroków`],
  ]);
  const blocks: ReportBlock[] = [{ t: "heading", text: "Podsumowanie" }];
  if (teaser) blocks.push({ t: "note", tone: "warning", text: REPORT_TEASER_NOTE });
  blocks.push(
    { t: "keyValues", rows },
    stepsTable((k) => analyticsStepStatus(src, k)),
    ...resultBlocks({
      grade: gradeFromValuation(d.valuation),
      valuation: d.valuation,
      collateral: d.collateral,
      kwAnalysis: d.kwAnalysis,
      coowners: d.coowners,
      sources: d.collateral?.dataSourcesUsed ?? [],
    }),
  );
  return {
    kind: "zlecenie",
    title: "Raport analityczny Projektu",
    subtitle,
    kwNumber: d.kwNumber,
    projectRef,
    teaser,
    stepsDone: done,
    blocks,
  };
}

/**
 * Model raportu z danych widoku. Każdy tekst modelu przechodzi przez maskę
 * PESEL — ostatnia linia obrony, gdyby numer trafił do opisu znaleziska.
 */
export function buildInvestorReportModel(src: InvestorReportSource): InvestorReportModel {
  const model =
    src.kind === "analityka"
      ? fromAnalytics(src.detail)
      : src.kind === "kw_check"
        ? fromKwCheck(src.detail)
        : fromOrderReport(src.detail, src.project);
  return JSON.parse(JSON.stringify(model), (_key, value) =>
    typeof value === "string" ? maskPeselInText(value) : value,
  ) as InvestorReportModel;
}

/** Wszystkie teksty modelu (do testów: znaki fontu, słownictwo, dane wrażliwe). */
export function reportModelText(model: InvestorReportModel): string {
  const out: string[] = [model.title, model.subtitle ?? ""];
  for (const b of model.blocks) {
    switch (b.t) {
      case "heading":
      case "subheading":
      case "paragraph":
      case "note":
        out.push(b.text);
        break;
      case "keyValues":
        for (const [k, v] of b.rows) out.push(k, v);
        break;
      case "bullets":
        out.push(...b.items);
        break;
      case "table":
        out.push(...b.columns.map((c) => c.label), ...b.rows.flat());
        break;
      case "score":
        out.push(b.label, b.caption ?? "");
        break;
      case "gradeScale":
        out.push(b.grade);
        break;
      case "map":
        out.push(b.caption);
        break;
      case "tiles":
        for (const it of b.items) out.push(it.label, it.value);
        break;
      case "compare":
        out.push(b.barName, b.refName ?? "", ...b.rows.flatMap((r) => [r.label, r.valueLabel]));
        break;
      case "diverging":
        out.push(b.positiveName, b.negativeName, ...b.rows.flatMap((r) => [r.label, r.valueLabel]));
        break;
      case "distances":
        out.push(...b.rows.map((r) => r.label));
        break;
      case "bars":
        out.push(...b.rows.flatMap((r) => [r.label, r.valueLabel]));
        break;
    }
  }
  return out.join("\n");
}

/**
 * Nazwa pliku: raport Projektu z numerem Projektu (raporty kilku Projektów
 * przed rezerwacją nie mają tej samej nazwy), numer KW tylko wtedy, gdy źródło
 * go nie maskuje.
 */
export function reportPdfFilename(model: InvestorReportModel, date: Date = new Date()): string {
  const prefix: Record<ReportKind, string> = {
    analityka: "raport-analityczny",
    kw_check: "raport-analityczny-kw",
    zlecenie: "raport-projektu",
  };
  const ref =
    model.kind === "zlecenie" && model.projectRef
      ? model.projectRef.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
      : "";
  const kw = !model.teaser && model.kwNumber ? formatKwNumber(model.kwNumber) : null;
  const parts = [ref, kw ? kw.replace(/\//g, "-") : ""].filter(Boolean).map((p) => `-${p}`);
  return `FY-${prefix[model.kind]}${parts.join("")}-${warsawDateStamp(date)}.pdf`;
}

/** Rysuje mapę do PNG — w przeglądarce kafelki OSM; w testach można podmienić. */
export type MapRenderer = (spec: {
  lat: number;
  lng: number;
  zoom: number;
  width: number;
  height: number;
  marker: boolean;
  polygon?: Array<[number, number]> | null;
  base?: "osm" | "orto";
  overlay?: "flood" | "mpzp" | "protected" | null;
}) => Promise<Uint8Array | null>;

async function defaultMapRenderer(spec: Parameters<MapRenderer>[0]): Promise<Uint8Array | null> {
  if (typeof document === "undefined") return null;
  const m = await import("@/lib/pdf/static-map");
  const zoom =
    spec.polygon && spec.polygon.length >= 3 && spec.zoom >= 15
      ? Math.min(spec.zoom, m.zoomToFit(spec.polygon, spec.width, spec.height))
      : spec.zoom;
  const view = { ...spec, zoom };
  let baseImage: { bytes: Uint8Array; mime: string } | null = null;
  if (spec.base === "orto") {
    const { getOrthophotoImage } = await import("@/lib/property-analysis/map-imagery.functions");
    const img = await getOrthophotoImage({
      data: { lat: view.lat, lng: view.lng, zoom, width: view.width, height: view.height },
    }).catch(() => null);
    if (!img) return null;
    baseImage = {
      bytes: Uint8Array.from(atob(img.base64), (c) => c.charCodeAt(0)),
      mime: img.mime,
    };
  }
  // Serwery WMS stylują warstwy zależnie od skali — nakładkę pobieramy w skali
  // mapy (bez ×2), inaczej ISOK rysuje same obrysy zamiast wypełnionych stref.
  const overlays =
    spec.overlay === "flood"
      ? [
          {
            url: m.wmsGetMapUrl(m.ISOK_FLOOD_WMS, m.ISOK_FLOOD_LAYERS, view, { scale: 1 }),
            opacity: 0.6,
          },
        ]
      : spec.overlay === "mpzp"
        ? [
            {
              url: m.wmsGetMapUrl(m.KIMPZP_WMS, m.KIMPZP_LAYERS, view, { scale: 1 }),
              opacity: 0.75,
            },
          ]
        : spec.overlay === "protected"
          ? [
              {
                url: m.wmsGetMapUrl(m.EEA_CDDA_WMS, m.EEA_CDDA_LAYERS, view, { scale: 1 }),
                opacity: 0.55,
              },
              {
                url: m.wmsGetMapUrl(m.EEA_NATURA2000_WMS, m.EEA_NATURA2000_LAYERS, view, {
                  scale: 1,
                }),
                opacity: 0.6,
              },
            ]
          : [];
  return m.renderStaticMapPng({
    ...view,
    baseImage,
    overlays,
    attribution:
      spec.base === "orto"
        ? "Ortofotomapa © GUGiK"
        : spec.overlay === "flood"
          ? "ISOK / Wody Polskie"
          : spec.overlay === "mpzp"
            ? "KIMPZP © GUGiK"
            : spec.overlay === "protected"
              ? "Natura 2000 / CDDA © EEA"
              : undefined,
  });
}

export interface RenderReportOptions {
  /** Imię i nazwisko / nazwa inwestora (albo e-mail) — stopka „Przygotowano dla”. */
  preparedFor: string;
  generatedAt?: Date;
  fonts?: ReportFonts;
  /** Renderer mapy (domyślnie kafelki OSM w przeglądarce). */
  mapRenderer?: MapRenderer;
}

/** PDF (bajty) z modelu raportu. */
export async function renderInvestorReportPdf(
  model: InvestorReportModel,
  opts: RenderReportOptions,
): Promise<Uint8Array> {
  const w = await ReportWriter.create({
    title: model.title,
    subject: [model.subtitle, model.kwNumber && !model.teaser ? `KW ${model.kwNumber}` : null]
      .filter(Boolean)
      .join(" · "),
    preparedFor: opts.preparedFor,
    generatedAt: opts.generatedAt,
    fonts: opts.fonts,
  });
  w.title(model.title, model.subtitle);
  for (const b of model.blocks) {
    switch (b.t) {
      case "heading":
        w.heading(b.text);
        break;
      case "subheading":
        w.subheading(b.text);
        break;
      case "paragraph":
        w.paragraph(b.text, { muted: b.muted, size: b.muted ? 8 : undefined });
        break;
      case "keyValues":
        w.keyValues(b.rows);
        break;
      case "bullets":
        w.bullets(b.items);
        break;
      case "table":
        w.table(b.columns, b.rows);
        break;
      case "score":
        w.scoreBar(b.label, b.value, { color: b.color, caption: b.caption });
        break;
      case "gradeScale":
        w.gradeScale(b.grade);
        break;
      case "note":
        w.note(b.text, { tone: b.tone });
        break;
      case "tiles":
        for (let i = 0; i < b.items.length; i += 3) w.highlights(b.items.slice(i, i + 3));
        break;
      case "compare":
        w.compareBars(b.rows, { barName: b.barName, refName: b.refName });
        break;
      case "diverging":
        w.divergingBars(b.rows, {
          maxAbs: b.maxAbs,
          positiveName: b.positiveName,
          negativeName: b.negativeName,
        });
        break;
      case "distances":
        w.distanceStrip(b.rows, { maxM: b.maxM });
        break;
      case "bars":
        w.barList(b.rows, { max: b.max });
        break;
      case "map": {
        const png = await (opts.mapRenderer ?? defaultMapRenderer)({
          lat: b.lat,
          lng: b.lng,
          zoom: b.zoom,
          width: 520,
          height: 300,
          marker: b.marker,
          polygon: b.polygon,
          base: b.base,
          overlay: b.overlay,
        }).catch(() => null);
        if (png) {
          await w.image(png, { format: "png", maxHeight: 300, align: "center", after: 4 });
          w.paragraph(b.caption, { muted: true, size: 8 });
        } else {
          w.paragraph(
            `${b.caption} Mapy nie udało się wczytać — położenie: ${b.lat.toFixed(6)}, ${b.lng.toFixed(6)}.`,
            { muted: true, size: 8 },
          );
        }
        break;
      }
    }
  }
  return w.save();
}
