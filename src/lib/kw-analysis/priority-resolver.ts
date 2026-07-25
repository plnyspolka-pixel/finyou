// MortgagePriorityResolver — wyznacza docelowe miejsce hipoteki inwestora.
//
// NIE ustala miejsca wyłącznie po numerze wpisu ani kolejności wyświetlania
// (spec §2). Uwzględnia: aktualne hipoteki, roszczenia o ustanowienie hipoteki,
// aktywne wzmianki (i ich kolejność), pierwszeństwo z 4.4.1.10–11, opróżnione
// miejsce (4.8), hipoteki o równym pierwszeństwie, hipoteki łączne, komentarze
// migracyjne. Gdy pierwszego/dopuszczalnego drugiego miejsca nie da się wykazać
// jednoznacznie → determinable=false (silnik reguł ustawia WSTRZYMANE).
//
// Moduł czysty — testowalny.

import type {
  EffectivePriorEncumbrance,
  MortgagePriorityResult,
  NormalizedLandRegister,
  SourceEvidence,
} from "./types";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0142/g, "l");
}

export function resolveMortgagePriority(nlr: NormalizedLandRegister): MortgagePriorityResult {
  const evidence: SourceEvidence[] = [];
  const requiredConditions: string[] = [];
  const priors: EffectivePriorEncumbrance[] = [];

  // 1) Aktualne hipoteki poprzedzające.
  const activeMortgages = nlr.mortgages.filter((m) => m.isActive);
  for (const m of activeMortgages) {
    priors.push({
      kind: "MORTGAGE",
      label: `${m.kind ?? "Hipoteka"}${m.creditor ? " — " + m.creditor : ""}`,
      sum: m.sum,
      currency: m.currency,
      creditor: m.creditor,
      evidence: m.evidence,
    });
    evidence.push(m.evidence);
  }

  // 2) Roszczenia o ustanowienie hipoteki (Dział III lub IV).
  const mortgageClaims = nlr.sectionThreeEntries.filter(
    (e) => e.isActive && e.kind === "MORTGAGE_CLAIM",
  );
  for (const c of mortgageClaims) {
    priors.push({
      kind: "MORTGAGE_CLAIM",
      label: "Roszczenie o ustanowienie hipoteki",
      sum: null,
      currency: null,
      creditor: c.beneficiary,
      evidence: c.evidence,
    });
    evidence.push(c.evidence);
  }

  // 3) Aktywne wzmianki w Dziale IV (i wcześniejsze mogące wyprzedzić inwestora).
  const activeCompetingMentions = nlr.mentions.filter(
    (m) => m.isActive && (m.section === "IV" || m.section === "II"),
  );
  for (const m of activeCompetingMentions) evidence.push(m.evidence);

  // 4) Opróżnione miejsce hipoteczne (4.8) — potencjalnie korzystne.
  const hasVacantRank = nlr.vacantRankRights.length > 0;
  for (const v of nlr.vacantRankRights) evidence.push(v.evidence);

  // 5) Równe pierwszeństwo / złożone zależności — wymagają ręcznej analizy.
  const equalPriority = activeMortgages.some((m) => m.priority && /r[óo]wn/.test(norm(m.priority)));
  const jointMortgage = activeMortgages.some(
    (m) => m.jointBooks.length > 0 || (m.kind ?? "").includes("ŁĄCZNA"),
  );

  // Nierozpoznane komentarze migracyjne w dziale IV — nie wolno pomijać.
  const ambiguousMigration = nlr.migrationComments.some((c) => c.section === "IV");
  if (ambiguousMigration) {
    requiredConditions.push(
      "Wyjaśnić komentarz migracyjny w Dziale IV (możliwy wpływ na pierwszeństwo).",
    );
  }

  // ── Rozstrzygnięcie ────────────────────────────────────────────────────────
  const priorCount = activeMortgages.length + mortgageClaims.length;

  // Aktywna wzmianka w IV o nieustalonej treści → nie da się wykazać miejsca.
  if (activeCompetingMentions.length > 0) {
    requiredConditions.push(
      "Zweryfikować treść aktywnych wzmianek (wniosek, Dz.Kw, załączniki) — mogą wyprzedzić hipotekę inwestora.",
    );
    return {
      determinable: false,
      effectivePriorEncumbrances: priors,
      activeCompetingMentions,
      usesVacantRank: hasVacantRank,
      explanation:
        `Wykryto ${activeCompetingMentions.length} aktywną(-e) wzmiankę(-i) w Dziale II/IV. ` +
        "Do czasu weryfikacji dokumentów rzeczywistego miejsca hipoteki nie można ustalić jednoznacznie.",
      evidence,
      requiredConditions,
    };
  }

  if (equalPriority || (jointMortgage && priorCount > 1)) {
    requiredConditions.push(
      "Ręczna analiza pierwszeństwa (równe pierwszeństwo / hipoteka łączna / złożone zależności).",
    );
    return {
      determinable: false,
      effectivePriorEncumbrances: priors,
      activeCompetingMentions,
      usesVacantRank: hasVacantRank,
      explanation:
        "Występuje równe pierwszeństwo lub hipoteka łączna — miejsce inwestora wymaga ręcznej analizy dokumentów.",
      evidence,
      requiredConditions,
    };
  }

  if (priorCount === 0) {
    // Brak obciążeń: pierwsze miejsce. Opróżnione miejsce jest korzystne warunkowo.
    if (hasVacantRank) {
      requiredConditions.push(
        "Uzyskać oświadczenie właściciela o rozporządzeniu opróżnionym miejscem na rzecz hipoteki inwestora i prawidłowy wniosek.",
      );
    }
    return {
      determinable: true,
      expectedInvestorRank: 1,
      effectivePriorEncumbrances: [],
      activeCompetingMentions,
      usesVacantRank: hasVacantRank,
      explanation: hasVacantRank
        ? "Brak aktywnych hipotek. Dostępne opróżnione miejsce hipoteczne — inwestor może uzyskać pierwsze miejsce po prawidłowym rozporządzeniu."
        : "Brak aktywnych hipotek ani roszczeń — inwestor może uzyskać pierwsze miejsce.",
      evidence,
      requiredConditions,
    };
  }

  // Są obciążenia poprzedzające → inwestor uzyska miejsce priorCount + 1.
  const expectedInvestorRank = priorCount + 1;
  if (expectedInvestorRank === 2) {
    requiredConditions.push(
      "Uzyskać aktualne zaświadczenie wierzyciela z pierwszego miejsca (saldo i maksymalna ekspozycja) — warunek drugiego miejsca.",
    );
  }
  return {
    determinable: true,
    expectedInvestorRank,
    effectivePriorEncumbrances: priors,
    activeCompetingMentions,
    usesVacantRank: hasVacantRank,
    explanation:
      `Wykryto ${priorCount} obciążenie(-a) poprzedzające (hipoteki/roszczenia). ` +
      `Hipoteka inwestora uzyskałaby ${expectedInvestorRank}. miejsce.`,
    evidence,
    requiredConditions,
  };
}
