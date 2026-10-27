// Zanonimizowane raporty spraw (lead magnet „raporty-spraw”, decyzja
// właściciela 27.10.2026). Czysta logika: wąski, typowany wycinek oceny
// (investment_risk_assessments) → model raportu do PDF.
//
// Twarde zasady anonimizacji (egzekwowane tu, sprawdzane testami):
//  • brak imion, nazwisk, PESEL, wieku, płci, numeru KW, ulicy, numeru
//    budynku/lokalu/działki, współrzędnych, dat, linków, nazw wierzycieli,
//    treści korespondencji i wyników OCR — wejście ich nie zawiera, a surowe
//    teksty ryzyk zamieniamy na gotowe zdania (nigdy nie przepisujemy),
//  • miasto tylko powyżej 100 tys. mieszkańców (inaczej powiat ziemski albo
//    samo województwo),
//  • kwoty zaokrąglone do 5 000 zł, powierzchnia zaokrąglona.
import type { Icon3DName } from "@/components/marketing/icon-3d";

export type RiskGradeLetter = "A" | "B" | "C" | "D" | "E";

/** Wycinek oceny przekazywany do generatora — tylko pola dozwolone. */
export type CaseInput = {
  ref: string;
  grade: RiskGradeLetter;
  score: number;
  recommendation: "rekomendowana" | "warunkowa" | "do_weryfikacji" | "odrzucona";
  propertyType: "mieszkanie" | "dom" | "lokal_uslugowy" | "dzialka" | "grunt_rolny" | "inna";
  voivodeship: string | null;
  city: string | null;
  cityPopulation: number | null;
  powiat: string | null;
  usableAreaM2: number | null;
  landAreaM2: number | null;
  valueLowPln: number | null;
  valueHighPln: number | null;
  loanAmountPln: number;
  ltvPercent: number | null;
  auction1Pln: number | null;
  auction2Pln: number | null;
  likelyAuction: "pierwsza_licytacja" | "druga_licytacja" | "przejecie" | null;
  residentialAuctionBlock: boolean;
  saleability: {
    score: number | null;
    band: "bardzo_latwa" | "latwa" | "umiarkowana" | "trudna" | "bardzo_trudna" | "nieznana";
    days: number | null;
  };
  flood: "none" | "low" | "medium" | "high" | "unknown";
  infrastructure: "bardzo_dobra" | "dobra" | "przecietna" | "slaba" | null;
  mortgages: Array<{ amountPln: number | null; creditorText: string | null; forced: boolean }>;
  servitude: boolean;
  coOwners: number | null;
  /** Surowe opisy ryzyk — służą WYŁĄCZNIE do rozpoznania flag, nie trafiają do raportu. */
  riskTexts: string[];
  components: Partial<
    Record<
      "legal" | "collateral" | "exitLiquidity" | "valuationConfidence" | "documentCompleteness",
      number
    >
  >;
};

export type CaseReport = {
  ref: string;
  grade: RiskGradeLetter;
  score: number;
  verdict: string;
  verdictTone: "positive" | "warning" | "negative";
  title: string;
  icon: Icon3DName;
  facts: Array<[string, string]>;
  strengths: string[];
  risks: string[];
  why: string;
  bars: Array<{ label: string; value: number }>;
};

// ── zaokrąglenia ───────────────────────────────────────────────────────────

const pl = (n: number) =>
  new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(n).replace(/\s/g, " ");
export const zl = (n: number) => `${pl(n)}\u00a0zł`;

export function round5k(n: number, mode: "down" | "up" | "near" = "near"): number {
  const f = mode === "down" ? Math.floor : mode === "up" ? Math.ceil : Math.round;
  return f(n / 5000) * 5000;
}

export function roundArea(m2: number): number {
  if (m2 < 100) return Math.round(m2 / 5) * 5;
  if (m2 < 1000) return Math.round(m2 / 10) * 10;
  return Math.round(m2 / 100) * 100;
}

// ── lokalizacja ────────────────────────────────────────────────────────────

const CITY_MIN_POPULATION = 100_000;

export function locationLabel(
  c: Pick<CaseInput, "city" | "cityPopulation" | "powiat" | "voivodeship">,
): string {
  const voiv = c.voivodeship ? `woj. ${c.voivodeship.toLocaleLowerCase("pl")}` : null;
  if (c.city && (c.cityPopulation ?? 0) > CITY_MIN_POPULATION) {
    return [c.city, voiv].filter(Boolean).join(", ");
  }
  // Powiat grodzki („M. X”) to w praktyce nazwa miasta — nie ujawniamy.
  if (c.powiat && !/^m\.\s/i.test(c.powiat.trim())) {
    return [`powiat ${c.powiat.trim().toLocaleLowerCase("pl")}`, voiv].filter(Boolean).join(", ");
  }
  return voiv ?? "lokalizacja nieujawniona";
}

// ── wierzyciele (opisowo) ──────────────────────────────────────────────────

export function creditorKind(text: string | null): string {
  const t = (text ?? "").toLocaleUpperCase("pl");
  if (!t.trim()) return "wierzyciel nieodczytany automatycznie";
  if (/\bBANK\b|BANKU\b/.test(t)) return "bank";
  if (/SKARB PAŃSTWA|ZUS|URZĄD|GMINA|MIASTO|POWIAT|SĄD|SKARBOW|NACZELNIK|WOJEWOD/.test(t)) {
    return "podmiot publiczny";
  }
  if (/SPÓŁKA|S\.A\.|SP\. Z O\.O\.|SPÓŁDZIELNIA|FUNDUSZ/.test(t))
    return "podmiot prywatny (spółka)";
  return "inny wierzyciel prywatny";
}

// ── ryzyka z opisów → gotowe zdania ────────────────────────────────────────

const RISK_RULES: Array<[RegExp, string]> = [
  [
    /niezgodn\p{L}* osoby wnioskując|zgodno\p{L}* kredytobiorcy z właściciel/iu,
    "Nie potwierdzono, że osoba wnioskująca jest właścicielem z księgi wieczystej.",
  ],
  [
    /sprzeczn\p{L}* ze stanem KW|podważa wiarygodność/iu,
    "Informacje podane przez klienta są sprzeczne z księgą wieczystą.",
  ],
  [/niespójno|rozbieżn/iu, "Rozbieżności w danych podanych przez klienta (kwota lub obciążenia)."],
  [
    /wielu właścicieli|współwłaściciel/iu,
    "Kilku współwłaścicieli — do obciążenia potrzebna zgoda wszystkich.",
  ],
  [
    /zawieszon\p{L}* działalno|BIK|udokumentowaniu dochod/iu,
    "Trudności z udokumentowaniem dochodów i historii kredytowej.",
  ],
  [/Korespondencja \(fakt\)/iu, "Sygnały z rozmów wskazujące na pilną potrzebę finansową."],
  [
    /brak wiarygodnej wyceny|nie wyznaczono wyceny|brak danych RCN|brak rynku porównawczego/iu,
    "Brak wiarygodnej wyceny rynkowej — potrzebny operat szacunkowy.",
  ],
  [
    /brak przetworzonych dokument|słaba jakość\/pokrycie danych|brak pełnych danych o powierzchni/iu,
    "Niepełna dokumentacja — wynik wymaga ręcznej weryfikacji.",
  ],
  [
    /płytki rynek|brak aktywnych ofert/iu,
    "Płytki rynek lokalny — mało ofert pośredników w okolicy.",
  ],
  [/poniżej 20 tys/iu, "Mała miejscowość (poniżej 20 tys. mieszkańców) — trudniejsza sprzedaż."],
  [
    /malejąca liczba mieszkańców/iu,
    "Spadająca liczba mieszkańców w okolicy — presja na płynność i ceny.",
  ],
  [/słaba lokalizacja/iu, "Słaba dostępność infrastruktury w okolicy."],
  [
    /ryzyko dożycia\/sukcesji właściciela: podw/iu,
    "Podwyższone ryzyko sukcesji po stronie właściciela.",
  ],
];

export function riskSentences(texts: string[]): string[] {
  const out: string[] = [];
  for (const [re, sentence] of RISK_RULES) {
    if (texts.some((t) => re.test(t)) && !out.includes(sentence)) out.push(sentence);
  }
  return out;
}

// ── model raportu ──────────────────────────────────────────────────────────

const TYPE_LABEL: Record<CaseInput["propertyType"], string> = {
  mieszkanie: "Mieszkanie",
  dom: "Dom",
  lokal_uslugowy: "Lokal użytkowy",
  dzialka: "Działka budowlana",
  grunt_rolny: "Grunt rolny",
  inna: "Nieruchomość gruntowa",
};
const TYPE_ICON: Record<CaseInput["propertyType"], Icon3DName> = {
  mieszkanie: "propApartment",
  dom: "propHouse",
  lokal_uslugowy: "propStore",
  dzialka: "propPlot",
  grunt_rolny: "propField",
  inna: "propPlot",
};
const BAND_LABEL: Record<CaseInput["saleability"]["band"], string> = {
  bardzo_latwa: "bardzo łatwa",
  latwa: "łatwa",
  umiarkowana: "umiarkowana",
  trudna: "trudna",
  bardzo_trudna: "bardzo trudna",
  nieznana: "nieustalona",
};
const FLOOD_LABEL: Record<CaseInput["flood"], string> = {
  none: "poza obszarem zagrożenia",
  low: "niskie",
  medium: "średnie",
  high: "wysokie",
  unknown: "do ręcznej weryfikacji (Hydroportal)",
};
const INFRA_LABEL: Record<NonNullable<CaseInput["infrastructure"]>, string> = {
  bardzo_dobra: "bardzo dobra",
  dobra: "dobra",
  przecietna: "przeciętna",
  slaba: "słaba",
};

export function buildCaseReport(c: CaseInput): CaseReport {
  const loan = round5k(c.loanAmountPln);
  const facts: Array<[string, string]> = [
    ["Rodzaj nieruchomości", TYPE_LABEL[c.propertyType]],
    ["Lokalizacja", locationLabel(c)],
  ];
  const area = c.usableAreaM2 ?? c.landAreaM2;
  if (area) {
    facts.push([
      c.usableAreaM2 ? "Powierzchnia (ok.)" : "Powierzchnia działki (ok.)",
      `${pl(roundArea(area))}\u00a0m²`,
    ]);
  }
  facts.push(["Wnioskowana kwota (ok.)", zl(loan)]);
  if (c.valueLowPln && c.valueHighPln) {
    facts.push([
      "Wartość nieruchomości (widełki)",
      `${zl(round5k(c.valueLowPln, "down"))} – ${zl(round5k(c.valueHighPln, "up"))}`,
    ]);
  } else {
    facts.push(["Wartość nieruchomości", "brak wiarygodnej wyceny automatycznej"]);
  }
  if (c.ltvPercent != null) facts.push(["LTV", `${Math.round(c.ltvPercent)}%`]);
  if (c.auction1Pln) facts.push(["Cena wywołania — I licytacja (3/4)", zl(round5k(c.auction1Pln))]);
  if (c.auction2Pln)
    facts.push(["Cena wywołania — II licytacja (2/3)", zl(round5k(c.auction2Pln))]);
  facts.push([
    "Zbywalność",
    `${BAND_LABEL[c.saleability.band]}${c.saleability.score != null ? ` (${c.saleability.score}/100)` : ""}${
      c.saleability.days ? `, szac. ok. ${c.saleability.days} dni sprzedaży` : ""
    }`,
  ]);
  facts.push(["Ryzyko powodziowe", FLOOD_LABEL[c.flood]]);
  if (c.infrastructure) facts.push(["Infrastruktura w okolicy", INFRA_LABEL[c.infrastructure]]);

  const kinds = c.mortgages.map((m) => creditorKind(m.creditorText));
  const encumbrances: string[] = [];
  if (c.mortgages.length) {
    const forced = c.mortgages.filter((m) => m.forced).length;
    const sum = c.mortgages.reduce((s, m) => s + (m.amountPln ?? 0), 0);
    const who = [...new Set(kinds)].join(", ");
    encumbrances.push(
      `${c.mortgages.length} ${c.mortgages.length === 1 ? "hipoteka" : "hipoteki"}${
        forced ? ` (w tym przymusowe: ${forced})` : ""
      } — ${who}${sum > 0 ? `, łącznie ok. ${zl(Math.max(5000, round5k(sum)))}` : ""}`,
    );
  }
  if (c.servitude) encumbrances.push("służebność (prawo przechodu i przejazdu)");
  facts.push([
    "Obciążenia w księdze wieczystej",
    encumbrances.length ? encumbrances.join("; ") : "brak",
  ]);
  if (c.coOwners && c.coOwners > 1) facts.push(["Liczba współwłaścicieli", String(c.coOwners)]);

  const strengths: string[] = [];
  if (c.ltvPercent != null && c.ltvPercent <= 30)
    strengths.push(`Bardzo niskie LTV (${Math.round(c.ltvPercent)}%) — duży bufor bezpieczeństwa.`);
  else if (c.ltvPercent != null && c.ltvPercent <= 60)
    strengths.push(`LTV w limicie 60% (${Math.round(c.ltvPercent)}%).`);
  if (c.saleability.band === "bardzo_latwa" || c.saleability.band === "latwa")
    strengths.push("Nieruchomość łatwo zbywalna — szeroki krąg nabywców.");
  if (c.likelyAuction === "pierwsza_licytacja")
    strengths.push("W razie egzekucji sprzedaż prawdopodobna już na pierwszej licytacji.");
  if (c.infrastructure === "bardzo_dobra" || c.infrastructure === "dobra")
    strengths.push("Dobra infrastruktura w okolicy.");
  if (c.flood === "none") strengths.push("Poza obszarem zagrożenia powodziowego.");
  if (!c.mortgages.length) strengths.push("Brak hipotek w księdze wieczystej.");
  if (c.auction2Pln && c.loanAmountPln > 0 && c.auction2Pln > c.loanAmountPln * 3)
    strengths.push("Nawet cena wywołania II licytacji wielokrotnie pokrywa kwotę pożyczki.");

  const risks: string[] = [];
  if (c.mortgages.length) {
    risks.push(
      kinds.includes("podmiot publiczny")
        ? "Hipoteka podmiotu publicznego przed nami — obniża wartość zabezpieczenia netto."
        : "Istniejąca hipoteka obniża wartość zabezpieczenia netto.",
    );
  }
  if (c.residentialAuctionBlock)
    risks.push(
      "Kwota pożyczki poniżej 5% wartości mieszkania — licytację mogłaby zablokować reguła art. 952¹ § 2 KPC; rozwiązaniem jest wyższa kwota albo dodatkowe zabezpieczenie.",
    );
  if (c.flood === "unknown")
    risks.push("Ryzyko powodziowe nie zostało zweryfikowane automatycznie.");
  const fromTexts = riskSentences(c.riskTexts);
  for (const s of fromTexts) if (!risks.includes(s)) risks.push(s);
  // „Dlaczego nie” zaczyna od powodów rozpoznanych w opisie sprawy (tytuł
  // prawny, dane klienta), a ogólne ryzyka zabezpieczenia są na końcu.
  const whyRisks = [...fromTexts, ...risks.filter((r) => !fromTexts.includes(r))];

  const verdict =
    c.recommendation === "rekomendowana"
      ? "Sprawa rekomendowana"
      : c.recommendation === "warunkowa"
        ? "Rekomendowana warunkowo"
        : c.recommendation === "odrzucona"
          ? "Odrzucona"
          : "Na tym etapie nie finansujemy";
  const verdictTone: CaseReport["verdictTone"] =
    c.recommendation === "rekomendowana"
      ? "positive"
      : c.recommendation === "warunkowa"
        ? "warning"
        : "negative";
  const why =
    verdictTone === "positive"
      ? `Ocena ${c.grade} (${c.score}/100). Zabezpieczenie z zapasem pokrywa kwotę pożyczki, a ryzyka da się opisać i ograniczyć w umowie.`
      : verdictTone === "warning"
        ? `Ocena ${c.grade} (${c.score}/100). Sprawa do rozważenia po spełnieniu warunków — najpierw trzeba usunąć ryzyka z listy.`
        : `Ocena ${c.grade} (${c.score}/100). Dlaczego nie: ${
            risks
              .slice(0, 3)
              .map((r) => r.replace(/\.$/, "").toLocaleLowerCase("pl"))
              .join("; ") || "zbyt wiele niewiadomych"
          }. Wartość nieruchomości to nie wszystko — liczy się też pewność tytułu prawnego i danych.`;

  const barLabels: Array<[keyof CaseInput["components"], string]> = [
    ["collateral", "Zabezpieczenie"],
    ["legal", "Stan prawny"],
    ["exitLiquidity", "Płynność wyjścia"],
    ["valuationConfidence", "Pewność wyceny"],
    ["documentCompleteness", "Kompletność dokumentów"],
  ];
  const bars = barLabels.flatMap(([k, label]) =>
    c.components[k] != null ? [{ label, value: c.components[k]! }] : [],
  );

  return {
    ref: c.ref,
    grade: c.grade,
    score: c.score,
    verdict,
    verdictTone,
    title: `${TYPE_LABEL[c.propertyType]} — ${locationLabel(c)}`,
    icon: TYPE_ICON[c.propertyType],
    facts,
    strengths,
    risks,
    why,
    bars,
  };
}

// ── zdjęcia: automatyczna selekcja ────────────────────────────────────────

export type PhotoCandidate = {
  fileName: string;
  /** Wynik OCR (null = plik nie był analizowany). */
  ocr: {
    docKind: string | null;
    rawTextSnippet: string | null;
    ownerNames: string[] | null;
    keyFindings: string[];
  } | null;
};

export type PhotoDecision = { accept: boolean; reason: string; interior: boolean | null };

const IMAGE_EXT = /\.(jpe?g|png|webp|heic)$/i;
const NO_TEXT = /^\s*(brak tekstu|nie wykryto tekstu)/i;
const INTERIOR = /wnętrz|kuchni|sypialn|łazienk|pokoj|pokój|salon|pomieszczen/i;
const EXTERIOR = /elewac|z zewnątrz|budyn|ogród|działk|dach|front/i;
const DOC_LIKE =
  /zrzut ekranu|komunikator|imię i nazwisko|podpis|dokument (to|zawiera)|skan|tabliczk|numer domu|tablic/i;

/**
 * Automat: tylko zdjęcia nieruchomości bez tekstu i bez danych osobowych.
 * Zdjęcia z zewnątrz wyłącznie w miastach powyżej 100 tys. mieszkańców.
 * Twarze/ludzie i inne szczegóły — ręczny przegląd na arkuszu kontrolnym.
 */
export function decidePhoto(p: PhotoCandidate, bigCity: boolean): PhotoDecision {
  const fileOk = IMAGE_EXT.test(p.fileName) || /^file-\d+$/.test(p.fileName);
  if (!fileOk)
    return { accept: false, reason: "nie jest zdjęciem (rozszerzenie pliku)", interior: null };
  if (!p.ocr)
    return { accept: false, reason: "brak analizy OCR — tylko ręczna decyzja", interior: null };
  const snippet = (p.ocr.rawTextSnippet ?? "").trim();
  if (snippet && !NO_TEXT.test(snippet))
    return { accept: false, reason: "rozpoznany tekst na obrazie", interior: null };
  if ((p.ocr.ownerNames ?? []).length)
    return { accept: false, reason: "na obrazie są dane osobowe", interior: null };
  const findings = p.ocr.keyFindings.join(" ");
  if (DOC_LIKE.test(findings))
    return { accept: false, reason: "dokument / zrzut ekranu", interior: null };
  const interior = INTERIOR.test(findings) ? true : EXTERIOR.test(findings) ? false : null;
  if (interior === null)
    return { accept: false, reason: "nie rozpoznano, co przedstawia zdjęcie", interior };
  if (!interior && !bigCity)
    return {
      accept: false,
      reason: "zdjęcie z zewnątrz w miejscowości poniżej 100 tys.",
      interior,
    };
  return {
    accept: true,
    reason: interior ? "wnętrze, bez tekstu" : "z zewnątrz (miasto > 100 tys.), bez tekstu",
    interior,
  };
}
