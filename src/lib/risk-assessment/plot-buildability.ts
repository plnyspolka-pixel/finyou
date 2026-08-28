// Prawo zabudowy działki — wpływ statusu gruntu na krąg nabywców, płynność i wycenę.
// Dotyczy działek/gruntów. Kluczowa zasada: zabudowa zagrodowa/siedliskowa (RM)
// oraz grunt rolny mają ograniczony krąg nabywców (budować może zasadniczo tylko
// rolnik indywidualny; obrót podlega ustawie o kształtowaniu ustroju rolnego / KOWR).
// To obniża sprzedawalność i sugeruje wycenę jak dla gruntu rolnego, nie budowlanego.
// Czysta, testowalna logika.

export type PlotBuildCategory =
  | "budowlana" // działka budowlana / MPZP MN — szeroki krąg nabywców
  | "zagrodowa_siedliskowa" // RM / siedlisko — budowa zasadniczo tylko dla rolnika
  | "rolna_bez_zabudowy" // grunt rolny bez prawa zabudowy (wymaga odrolnienia/WZ)
  | "zabudowana" // działka już zabudowana
  | "nieokreslona";

export type BuyerPool = "szeroki" | "rolniczy" | "ograniczony_rolnicy" | "waski";
export type ValuationBasis = "budowlana" | "rolna_gus" | "mieszana" | "nieokreslona";

export interface PlotBuildabilityInput {
  propertyType: string;
  mpzpInfo?: string | null;
  landRegistryExtract?: string | null;
  hasWzDecision?: boolean | null; // decyzja o warunkach zabudowy
  isOdrolniona?: boolean | null; // odrolniona / wyłączona z produkcji rolnej
  ownerIsFarmer?: boolean | null; // status rolnika indywidualnego (jeśli znany)
  ocrText?: string | null; // złączony tekst z OCR/dokumentów
  /**
   * Sposób korzystania z gruntu z działu I-O KW (np. „R - GRUNTY ORNE") —
   * dane URZĘDOWE, mają pierwszeństwo przed typem zadeklarowanym we wniosku.
   */
  kwLandUse?: string | null;
  /** Obszar gruntu w ha (dział I-O KW) — próg UKUR dla obrotu gruntem rolnym. */
  landAreaHa?: number | null;
}

export interface PlotBuildabilityResult {
  applicable: boolean; // czy dotyczy (typy działkowe/rolne)
  category: PlotBuildCategory;
  buyerPool: BuyerPool;
  onlyFarmerCanBuild: boolean;
  buildableForNonFarmer: boolean | null;
  requiresOdrolnienieOrWz: boolean;
  valuationBasis: ValuationBasis;
  /** Wpływ na wynik łatwości sprzedaży (ujemny przy restrykcjach). */
  saleabilityDelta: number;
  warnings: string[];
  summary: string;
}

const PLOT_TYPES = new Set(["grunt_rolny", "dzialka_budowlana", "dzialka_zabudowana"]);

function neutral(propertyType: string): PlotBuildabilityResult {
  return {
    applicable: false,
    category: "nieokreslona",
    buyerPool: "szeroki",
    onlyFarmerCanBuild: false,
    buildableForNonFarmer: null,
    requiresOdrolnienieOrWz: false,
    valuationBasis: "nieokreslona",
    saleabilityDelta: 0,
    warnings: [],
    summary: `Typ „${propertyType}" — analiza prawa zabudowy działki nie dotyczy.`,
  };
}

const AGRI_LAND_USE_RE =
  /grunt\w*\s+orn|grunt\w*\s+roln|u[żz]ytk\w*\s+roln|[łl][ąa]k\w*\s+trwa|pastwisk|\brola\b|sad\b|nieu[żz]ytk/;
const BUILT_LAND_USE_RE = /\bb\b|teren\w*\s+mieszkaniow|zabudowan|budowlan/;

export function assessPlotBuildability(input: PlotBuildabilityInput): PlotBuildabilityResult {
  if (!PLOT_TYPES.has(input.propertyType)) return neutral(input.propertyType);

  const text = [input.mpzpInfo, input.landRegistryExtract, input.ocrText]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();

  const hasWz =
    input.hasWzDecision ?? /warunk\w*\s+zabudow|decyzj\w*\s+o\s+warunkach|\bwz\b/.test(text);
  const odrolniona =
    input.isOdrolniona ?? /odroln|wy[łl][ąa]czen\w*\s+z\s+produkcji\s+roln/.test(text);

  const rmZagrodowa = /\brm\b|zabudow\w*\s+zagrodow|siedlisk|zagrodow/.test(text);
  const budowlana = /budowlan|\bmn\b|mieszkaniow|zabudow\w*\s+mieszkaniow/.test(text);
  const rolnyText =
    /grunt\w*\s+roln|u[żz]ytk\w*\s+roln|\brola\b|grunt\w*\s+orn|klasa\s+bonitacyjn/.test(text);

  // Sposób korzystania z działu I-O KW — dane urzędowe. „R - GRUNTY ORNE" itp.
  // przesądza o statusie rolnym, gdy dokumenty (MPZP/WZ/wypis z OCR) milczą lub
  // są niejednoznaczne. Jednoznaczne przeznaczenie budowlane w DOKUMENTACH
  // wygrywa z użytkiem z KW — ewidencja gruntów bywa nieaktualna względem MPZP.
  const kwUse = (input.kwLandUse ?? "").toLowerCase();
  const kwSaysAgri = AGRI_LAND_USE_RE.test(kwUse) && !BUILT_LAND_USE_RE.test(kwUse);

  let category: PlotBuildCategory;
  if (rmZagrodowa) category = "zagrodowa_siedliskowa";
  else if (odrolniona || (budowlana && !rolnyText)) category = "budowlana";
  else if (kwSaysAgri) category = "rolna_bez_zabudowy";
  else if (input.propertyType === "dzialka_budowlana")
    category = budowlana || !rolnyText ? "budowlana" : "nieokreslona";
  else if (input.propertyType === "dzialka_zabudowana") category = "zabudowana";
  else if (input.propertyType === "grunt_rolny")
    category = budowlana ? "budowlana" : "rolna_bez_zabudowy";
  else category = "nieokreslona";

  let buyerPool: BuyerPool;
  let onlyFarmerCanBuild = false;
  let buildableForNonFarmer: boolean | null;
  let requiresOdrolnienieOrWz = false;
  let valuationBasis: ValuationBasis;
  let saleabilityDelta = 0;
  const warnings: string[] = [];

  switch (category) {
    case "zagrodowa_siedliskowa":
      buyerPool = "ograniczony_rolnicy";
      onlyFarmerCanBuild = true;
      buildableForNonFarmer = hasWz ? true : false;
      requiresOdrolnienieOrWz = true;
      valuationBasis = "mieszana";
      saleabilityDelta = -14;
      warnings.push(
        "Zabudowa zagrodowa/siedliskowa (RM) — prawo zabudowy zasadniczo wyłącznie dla rolnika indywidualnego (min. 1 ha, kwalifikacje/doświadczenie rolnicze, zameldowanie w gminie ≥5 lat). Wąski krąg nabywców obniża płynność i wartość.",
      );
      warnings.push(
        "Dla nabywcy niebędącego rolnikiem budowa wymaga odrolnienia/zmiany MPZP lub decyzji WZ oraz — przy zakupie — zgody KOWR.",
      );
      break;
    case "rolna_bez_zabudowy":
      // Grunt rolny traktujemy jako rolny i wyceniamy wg cen gruntów GUS.
      // Rynek rolny jest relatywnie płynny — NIE stosujemy kary za sprzedawalność.
      buyerPool = "rolniczy";
      onlyFarmerCanBuild = true; // dot. wyłącznie prawa zabudowy, nie zbywalności
      buildableForNonFarmer = hasWz ? true : false;
      requiresOdrolnienieOrWz = true;
      valuationBasis = "rolna_gus";
      saleabilityDelta = 0;
      warnings.push(
        "Grunt rolny — wyceniany wg cen gruntów rolnych GUS (za ha wg klasy bonitacyjnej/regionu). Rynek rolny relatywnie płynny; obrót podlega ustawie o kształtowaniu ustroju rolnego (prawo pierwokupu KOWR). Budowa wymagałaby odrolnienia lub decyzji WZ dla rolnika.",
      );
      break;
    case "budowlana":
      buyerPool = "szeroki";
      buildableForNonFarmer = true;
      valuationBasis = "budowlana";
      saleabilityDelta = 2;
      break;
    case "zabudowana":
      buyerPool = "szeroki";
      buildableForNonFarmer = true;
      valuationBasis = "mieszana";
      saleabilityDelta = 0;
      break;
    default:
      buyerPool = "szeroki";
      buildableForNonFarmer = null;
      valuationBasis = "nieokreslona";
      saleabilityDelta = 0;
      warnings.push(
        "Status zabudowy działki nieokreślony — zweryfikuj MPZP (symbol RM/MN/R) lub decyzję WZ.",
      );
  }

  // Dane urzędowe z KW kontra deklaracja wniosku i dokumenty + próg UKUR.
  if (kwSaysAgri && category === "rolna_bez_zabudowy") {
    if (input.propertyType === "dzialka_budowlana") {
      warnings.push(
        `Rozbieżność: wniosek deklaruje działkę budowlaną, ale dział I-O KW podaje sposób korzystania „${input.kwLandUse}" (grunt rolny), a dokumenty nie potwierdzają statusu budowlanego. Do analizy przyjęto status rolny — status budowlany wymaga potwierdzenia wypisem z MPZP lub decyzją WZ.`,
      );
    }
    if (budowlana) {
      warnings.push(
        "W dokumentach pojawia się przeznaczenie budowlane obok wzmianek o gruncie rolnym (treść niejednoznaczna), a KW wskazuje grunt rolny — przyjęto ostrożnościowo status rolny; zweryfikuj MPZP/WZ.",
      );
    }
  }
  if (kwSaysAgri && category === "budowlana" && !odrolniona) {
    warnings.push(
      `Dokumenty (MPZP/WZ/OCR) wskazują przeznaczenie budowlane, choć dział I-O KW podaje „${input.kwLandUse}" — przyjęto status budowlany wg dokumentów; upewnij się, że dotyczą tej działki (ewidencja w KW bywa nieaktualna względem MPZP).`,
    );
  }
  if (
    (category === "rolna_bez_zabudowy" || category === "zagrodowa_siedliskowa") &&
    input.landAreaHa != null &&
    input.landAreaHa >= 1
  ) {
    warnings.push(
      `Grunt rolny o powierzchni ${input.landAreaHa} ha (≥1 ha) — obrót podlega UKUR: nabywcą może być zasadniczo rolnik indywidualny, a sprzedaż innym podmiotom wymaga zgody KOWR (plus prawo pierwokupu KOWR). Istotnie zawężony krąg nabywców przy wymuszonej sprzedaży.`,
    );
  }

  // Modyfikatory łagodzące.
  if (odrolniona && category !== "budowlana") {
    valuationBasis = "budowlana";
    requiresOdrolnienieOrWz = false;
    saleabilityDelta = Math.min(2, saleabilityDelta + 12);
    buyerPool = "szeroki";
    warnings.push(
      "Działka odrolniona/wyłączona z produkcji rolnej — krąg nabywców i prawo zabudowy zbliżone do działki budowlanej.",
    );
  } else if (hasWz && (category === "zagrodowa_siedliskowa" || category === "rolna_bez_zabudowy")) {
    saleabilityDelta += 6; // decyzja WZ poprawia zbywalność
    warnings.push(
      "Działka posiada decyzję o warunkach zabudowy (WZ) — poprawia zbywalność i możliwość zabudowy.",
    );
  }
  if (input.ownerIsFarmer && category === "zagrodowa_siedliskowa") {
    warnings.push(
      "Obecny właściciel ma status rolnika — dotychczasowa zabudowa zagrodowa zgodna z prawem (nie zmienia to jednak wąskiego kręgu nabywców przy sprzedaży).",
    );
  }

  const catLabel = plotCategoryLabel(category);
  const poolLabel = buyerPoolLabel(buyerPool);
  const summary = `${catLabel}; krąg nabywców: ${poolLabel}; podstawa wyceny: ${valuationBasisLabel(valuationBasis)}${onlyFarmerCanBuild ? "; budowa zasadniczo tylko dla rolnika" : ""}.`;

  return {
    applicable: true,
    category,
    buyerPool,
    onlyFarmerCanBuild,
    buildableForNonFarmer,
    requiresOdrolnienieOrWz,
    valuationBasis,
    saleabilityDelta,
    warnings,
    summary,
  };
}

export function plotCategoryLabel(c: PlotBuildCategory): string {
  switch (c) {
    case "budowlana":
      return "działka budowlana";
    case "zagrodowa_siedliskowa":
      return "zabudowa zagrodowa/siedliskowa (RM)";
    case "rolna_bez_zabudowy":
      return "grunt rolny bez prawa zabudowy";
    case "zabudowana":
      return "działka zabudowana";
    case "nieokreslona":
      return "status zabudowy nieokreślony";
  }
}
export function buyerPoolLabel(p: BuyerPool): string {
  switch (p) {
    case "szeroki":
      return "szeroki";
    case "rolniczy":
      return "rynek rolny (rolnicy/KOWR)";
    case "ograniczony_rolnicy":
      return "ograniczony (głównie rolnicy)";
    case "waski":
      return "wąski";
  }
}
export function valuationBasisLabel(v: ValuationBasis): string {
  switch (v) {
    case "budowlana":
      return "jak działka budowlana";
    case "rolna_gus":
      return "jak grunt rolny (ceny GUS)";
    case "mieszana":
      return "mieszana (rolno-budowlana)";
    case "nieokreslona":
      return "nieokreślona";
  }
}
