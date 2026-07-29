// Budowa uzasadnienia wyniku (spec §14, §18). Tekst po polsku, dla operatora.

import type { CourtDepartmentInfo, LocationScoringExplanation, ScoringPropertyType } from "./types";
import type { DistributionResult } from "./distribution";

const PROPERTY_LABEL: Record<ScoringPropertyType, string> = {
  apartment: "mieszkań",
  house: "domów",
  plot: "działek",
  any: "nieruchomości (rodzaj nieokreślony)",
};

export function buildExplanation(args: {
  court: CourtDepartmentInfo | null;
  propertyType: ScoringPropertyType;
  distribution: DistributionResult;
  expectedAttractiveness: number;
  probabilityGoodLocation: number;
  confidenceScore: number;
  bayesianApplied: boolean;
  sampleCount: number;
  serialApplied: boolean;
  limitationsExtra: string[];
}): LocationScoringExplanation {
  const {
    court,
    propertyType,
    distribution,
    expectedAttractiveness,
    probabilityGoodLocation,
    confidenceScore,
    bayesianApplied,
    sampleCount,
    serialApplied,
    limitationsExtra,
  } = args;

  const courtName = court?.name ?? "nieznany wydział KW";
  const top = [...distribution.locations].sort((a, b) => b.probability - a.probability).slice(0, 3);
  const goodPct = Math.round(probabilityGoodLocation * 100);
  const suburbPct = Math.round(distribution.probabilityUrbanOrSuburban * 100);

  const title = `Potencjał lokalizacyjny: ${Math.round(expectedAttractiveness)}/100`;

  const summary =
    `Wydział KW „${courtName}" obejmuje ${describeReach(distribution)}. ` +
    `Dla ${PROPERTY_LABEL[propertyType]} ${
      suburbPct >= 50
        ? `większość prawdopodobnych lokalizacji (${suburbPct}%) znajduje się w obszarze o wysokiej koncentracji ludności lub w strefie podmiejskiej.`
        : `część prawdopodobnych lokalizacji leży poza obszarami o wysokiej koncentracji ludności.`
    }`;

  const reasons: string[] = [];
  reasons.push(
    `Szansa okolicy większego skupiska ludzkiego (min. ~20–30 tys. mieszkańców): ${goodPct}%.`,
  );
  if (top.length) {
    reasons.push(
      `Najbardziej prawdopodobne lokalizacje: ` +
        top
          .map(
            (l) =>
              `${l.area.name} (${Math.round(l.probability * 100)}%, ${l.baseAttractiveness}/100)`,
          )
          .join(", ") +
        ".",
    );
  }
  if (distribution.probabilityUrbanCore > 0.15) {
    reasons.push(
      `Istotny udział rdzenia miejskiego (${Math.round(distribution.probabilityUrbanCore * 100)}%).`,
    );
  }
  if (distribution.probabilityFua > 0.2) {
    reasons.push(
      `Znaczący udział funkcjonalnego obszaru miejskiego (FUA): ${Math.round(
        distribution.probabilityFua * 100,
      )}%.`,
    );
  }
  if (bayesianApplied) {
    reasons.push(
      `Estymację skorygowano o ${sampleCount} historycznych obserwacji (wygładzanie bayesowskie).`,
    );
  }

  const limitations: string[] = [...limitationsExtra];
  if (propertyType === "any") {
    limitations.push(
      "Rodzaj nieruchomości nieokreślony — rozkład lokalizacji uśredniony po wszystkich rodzajach (rodzaj jest sygnałem pomocniczym; wskazanie go doprecyzuje wynik).",
    );
  }
  if (confidenceScore < 50) {
    limitations.push(
      "Niska pewność oszacowania — rozkład możliwych lokalizacji jest szeroki (od centrum miasta po odległą gminę). Wynik ma charakter wyłącznie preselekcyjny.",
    );
  }
  if (!court) {
    limitations.push("Brak mapowania prefiksu wydziału KW — lokalizacja oparta o dane rezerwowe.");
  }
  if (court && court.mappingConfidence < 0.6) {
    limitations.push(
      "Niepewne mapowanie właściwości wydziału (możliwe zmiany organizacyjne sądów) — wynik obarczony błędem.",
    );
  }
  if (!serialApplied) {
    limitations.push("Sygnał z numeru repertoryjnego pominięty (zbyt mała lub niestabilna próba).");
  }
  limitations.push(
    "Numer repertoryjny nie koduje oficjalnie lokalizacji — wynik jest szacunkiem statystycznym, nie wskazaniem konkretnego adresu.",
  );

  return { title, summary, reasons, limitations };
}

function describeReach(distribution: DistributionResult): string {
  const core = distribution.probabilityUrbanCore;
  const fua = distribution.probabilityFua;
  if (core > 0.4) return "duży ośrodek miejski oraz jego strefę podmiejską";
  if (fua > 0.3) return "ośrodek miejski wraz z funkcjonalnym obszarem miejskim";
  if (distribution.probabilityUrbanOrSuburban > 0.4) return "obszar miejski i gminy podmiejskie";
  return "obszar o rozproszonej zabudowie i niższej koncentracji ludności";
}
