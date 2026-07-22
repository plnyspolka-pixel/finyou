// Czysta (testowalna) analiza ryzyka projektu — generowana z danych projektu.
// Wynik zbiorczy (0-100 + poziom) + czynniki składowe + czerwone flagi +
// sekcja „Czego jeszcze nie wiemy". Progi LTV są konfigurowalne przez
// administratora (project_module_settings.ltv_bands).
//
// Wynik ma charakter POMOCNICZY i nie zastępuje samodzielnej decyzji inwestora.
import {
  RISK_DISCLAIMER,
  type RiskAnalysis,
  type RiskFactor,
  type RiskFlag,
  type RiskLevel,
} from "./module-types";

export interface RiskProjectInput {
  amount: number;
  property_type: string;
  city: string;
  voivodeship: string | null;
  property_value: number | null;
  valuation_source: string | null;
  valuation_date: string | null;
  ltv_percent: number | null;
  period_months: number | null;
  interest_rate_percent: number | null;
  security_type: string | null;
  mortgage_position: string | null;
  other_encumbrances: string | null;
  legal_status_note: string | null;
  borrower_business_form: string | null;
  borrower_business_since: string | null;
  repayment_source: string | null;
  repayment_type: string | null;
  borrower_history: string | null;
  docs_complete: boolean;
  docs_completeness_note: string | null;
  missing_information: unknown;
  additional_conditions: string | null;
}

export interface LtvBands {
  conservative: number;
  acceptable: number;
  elevated: number;
}

/** LTV = kwota finansowania ÷ wartość nieruchomości × 100%. */
export function computeLtv(
  amount: number,
  propertyValue: number | null | undefined,
): number | null {
  if (!propertyValue || propertyValue <= 0 || !amount || amount <= 0) return null;
  return Math.round((amount / propertyValue) * 1000) / 10;
}

export function ltvBandLabel(ltv: number, bands: LtvBands): string {
  if (ltv <= bands.conservative) return "bardzo konserwatywne";
  if (ltv <= bands.acceptable) return "akceptowalne";
  if (ltv <= bands.elevated) return "podwyższone";
  return "wysokie";
}

const LIQUIDITY_BY_TYPE: Record<string, number> = {
  mieszkanie: 90,
  dom: 75,
  lokal_uslugowy: 60,
  dzialka_budowlana: 55,
  grunt_rolny: 45,
  udzial_w_nieruchomosci: 30,
  inna: 40,
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function levelForScore(score: number): RiskLevel {
  if (score >= 80) return "niski";
  if (score >= 60) return "umiarkowany";
  if (score >= 40) return "podwyzszony";
  return "wysoki";
}

const mentions = (text: string | null | undefined, words: string[]): boolean => {
  const t = (text ?? "").toLowerCase();
  return words.some((w) => t.includes(w));
};

/** Pełna analiza ryzyka. `investorMaxLtv` — limit LTV z profilu inwestora (opcjonalny). */
export function analyzeProjectRisk(
  project: RiskProjectInput,
  bands: LtvBands,
  investorMaxLtv?: number | null,
): RiskAnalysis {
  const factors: RiskFactor[] = [];
  const redFlags: RiskFlag[] = [];
  const missing: string[] = [];

  const ltv = project.ltv_percent ?? computeLtv(project.amount, project.property_value);

  // === Nieruchomość ===
  const liquidity = LIQUIDITY_BY_TYPE[project.property_type] ?? 40;
  let propertyScore = liquidity;
  const valuationAgeDays = project.valuation_date
    ? (Date.now() - new Date(project.valuation_date).getTime()) / 86400000
    : null;
  if (!project.property_value) {
    propertyScore -= 30;
    redFlags.push({
      code: "no_valuation",
      label: "Brak wartości nieruchomości",
      explanation:
        "Nie znamy wartości nieruchomości, więc nie da się wiarygodnie ocenić LTV ani bezpieczeństwa zabezpieczenia.",
    });
    missing.push("Brak aktualnej wyceny / operatu szacunkowego");
  } else if (!project.valuation_source) {
    propertyScore -= 12;
    missing.push("Brak informacji o źródle wyceny");
  } else if (valuationAgeDays != null && valuationAgeDays > 365) {
    propertyScore -= 10;
    redFlags.push({
      code: "stale_valuation",
      label: "Nieaktualna wycena",
      explanation: "Wycena ma ponad 12 miesięcy — wartość nieruchomości mogła się zmienić.",
    });
  }
  if (mentions(project.legal_status_note, ["spór", "roszczen", "nieuregulowan", "niezgodn"])) {
    propertyScore -= 15;
    redFlags.push({
      code: "legal_status",
      label: "Wątpliwości co do stanu prawnego",
      explanation: "Opis stanu prawnego zawiera sygnały wymagające wyjaśnienia przed decyzją.",
    });
  }
  factors.push({
    area: "nieruchomosc",
    label: "Nieruchomość",
    score: clamp(propertyScore),
    comment: `Płynność potencjalnej sprzedaży dla tego typu nieruchomości oraz jakość i aktualność wyceny.`,
  });

  // === Księga wieczysta i obciążenia ===
  let kwScore = 85;
  if (mentions(project.other_encumbrances, ["hipotek"])) {
    kwScore -= 25;
    redFlags.push({
      code: "existing_mortgage",
      label: "Istniejące obciążenie hipoteczne",
      explanation:
        "Nieruchomość ma już wpisaną hipotekę — zabezpieczenie może wypaść na dalszym miejscu.",
    });
  }
  if (mentions(project.other_encumbrances, ["egzekucj", "komorni"])) {
    kwScore -= 35;
    redFlags.push({
      code: "enforcement",
      label: "Egzekucja / wpisy komornicze",
      explanation: "Wpisy egzekucyjne istotnie zwiększają ryzyko odzyskania kapitału.",
    });
  }
  if (
    mentions(project.other_encumbrances, ["służebno", "sluzebno", "roszczen", "ostrzeż", "ostrzez"])
  ) {
    kwScore -= 15;
  }
  if (!project.other_encumbrances && !project.legal_status_note) {
    kwScore -= 10;
    missing.push("Brak informacji o obciążeniach księgi wieczystej");
  }
  factors.push({
    area: "kw",
    label: "Księga wieczysta i obciążenia",
    score: clamp(kwScore),
    comment: "Zgodność właściciela, hipoteki, roszczenia, służebności, ostrzeżenia i egzekucje.",
  });

  // === LTV ===
  let ltvScore: number;
  if (ltv == null) {
    ltvScore = 30;
    missing.push("Brak danych do wyliczenia LTV");
  } else if (ltv <= bands.conservative) {
    ltvScore = 95;
  } else if (ltv <= bands.acceptable) {
    ltvScore = 75;
  } else if (ltv <= bands.elevated) {
    ltvScore = 50;
  } else {
    ltvScore = 25;
    redFlags.push({
      code: "high_ltv",
      label: "Wysokie LTV",
      explanation: `LTV ${ltv}% przekracza próg ${bands.elevated}% — niższy bufor bezpieczeństwa przy spadku wartości nieruchomości.`,
    });
  }
  if (ltv != null && investorMaxLtv != null && ltv > investorMaxLtv) {
    redFlags.push({
      code: "ltv_over_investor_limit",
      label: "LTV przekracza Twój limit",
      explanation: `LTV ${ltv}% jest wyższe niż maksymalne LTV zadeklarowane w Twoim profilu (${investorMaxLtv}%).`,
    });
  }
  factors.push({
    area: "ltv",
    label: "LTV",
    score: clamp(ltvScore),
    comment:
      ltv == null
        ? "Brak kompletu danych do wyliczenia LTV."
        : `LTV ${ltv}% — poziom ${ltvBandLabel(ltv, bands)}.`,
  });

  // === Pożyczkobiorca ===
  let borrowerScore = 70;
  if (!project.borrower_business_form) {
    borrowerScore -= 10;
    missing.push("Brak informacji o formie prowadzenia działalności pożyczkobiorcy");
  }
  if (project.borrower_business_since) {
    const years =
      (Date.now() - new Date(project.borrower_business_since).getTime()) / (365.25 * 86400000);
    if (years >= 3) borrowerScore += 10;
    else if (years < 1) borrowerScore -= 10;
  }
  if (!project.repayment_source) {
    borrowerScore -= 20;
    redFlags.push({
      code: "unclear_repayment",
      label: "Niejasne źródło spłaty",
      explanation: "Brak zadeklarowanego źródła spłaty pożyczki.",
    });
    missing.push("Brak potwierdzenia źródła spłaty / dochodu");
  }
  if (mentions(project.borrower_history, ["opóźni", "opozni", "windykac", "problem"])) {
    borrowerScore -= 15;
  } else if (mentions(project.borrower_history, ["terminow", "spłacon", "splacon", "pozytywn"])) {
    borrowerScore += 10;
  }
  factors.push({
    area: "pozyczkobiorca",
    label: "Pożyczkobiorca",
    score: clamp(borrowerScore),
    comment:
      "Forma i staż działalności, źródło spłaty, historia współpracy z Finance You i kompletność informacji finansowych.",
  });

  // === Konstrukcja transakcji ===
  let dealScore = 65;
  const sec = `${project.security_type ?? ""} ${project.additional_conditions ?? ""}`.toLowerCase();
  if (sec.includes("hipotek")) dealScore += 10;
  if (sec.includes("777")) dealScore += 8;
  if (sec.includes("porecz") || sec.includes("poręcz")) dealScore += 5;
  if (sec.includes("ubezpiecz")) dealScore += 4;
  if (!project.security_type) {
    dealScore -= 25;
    redFlags.push({
      code: "no_security",
      label: "Brak określonego zabezpieczenia",
      explanation: "Projekt nie wskazuje rodzaju zabezpieczenia wierzytelności.",
    });
  }
  if (
    project.mortgage_position &&
    mentions(project.mortgage_position, ["dalsze", "2", "drugie", "3", "trzecie"])
  ) {
    dealScore -= 12;
    redFlags.push({
      code: "junior_mortgage",
      label: "Hipoteka na dalszym miejscu",
      explanation:
        "Proponowane miejsce hipoteczne nie jest pierwsze — w razie egzekucji pierwszeństwo mają wcześniejsze wpisy.",
    });
  }
  if (project.period_months != null && project.period_months > 60) dealScore -= 8;
  factors.push({
    area: "transakcja",
    label: "Konstrukcja transakcji",
    score: clamp(dealScore),
    comment:
      "Okres finansowania, harmonogram (ratalny/balonowy), zabezpieczenia (hipoteka, art. 777 k.p.c., poręczenie, ubezpieczenie) i warunki uruchomienia.",
  });

  // === Kompletność dokumentów ===
  if (!project.docs_complete) {
    redFlags.push({
      code: "incomplete_docs",
      label: "Niekompletna dokumentacja",
      explanation:
        project.docs_completeness_note?.trim() ||
        "Dokumentacja projektu nie jest kompletna — część danych wymaga potwierdzenia.",
    });
  }

  const declaredMissing = Array.isArray(project.missing_information)
    ? (project.missing_information as unknown[]).map(String).filter(Boolean)
    : [];
  for (const m of declaredMissing) if (!missing.includes(m)) missing.push(m);

  // === Wynik zbiorczy (średnia ważona czynników − kary za czerwone flagi) ===
  const weights: Record<string, number> = {
    nieruchomosc: 0.2,
    kw: 0.2,
    ltv: 0.3,
    pozyczkobiorca: 0.15,
    transakcja: 0.15,
  };
  let score = factors.reduce((acc, f) => acc + f.score * (weights[f.area] ?? 0.1), 0);
  score -= Math.min(20, redFlags.length * 4);
  const finalScore = clamp(Math.round(score));
  const level = levelForScore(finalScore);

  const worst = [...factors].sort((a, b) => a.score - b.score)[0];
  const summary = redFlags.length
    ? `Poziom ryzyka: ${level}. Najsłabszy obszar: ${worst.label.toLowerCase()}. Czerwone flagi: ${redFlags
        .map((f) => f.label.toLowerCase())
        .join(", ")}.`
    : `Poziom ryzyka: ${level}. Najsłabszy obszar: ${worst.label.toLowerCase()}. Nie wykryto czerwonych flag.`;

  return {
    score: finalScore,
    level,
    summary,
    factors,
    redFlags,
    missingInformation: missing,
    ltvBands: bands,
    disclaimer: RISK_DISCLAIMER,
  };
}
