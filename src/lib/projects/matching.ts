// Czysty (testowalny) ranking dopasowania projektów do profilu inwestora.
//
// Twarde filtry (projekt w ogóle nie jest pokazywany, dopóki inwestor nie
// zmieni preferencji): rodzaj nieruchomości, widełki kwoty, maksymalne LTV.
// Reszta kryteriów działa miękko — obniża pozycję w rankingu.
//
// Wynik i wagi są WEWNĘTRZNE — nie pokazujemy użytkownikowi algorytmu ani
// punktacji (assignment_reason trafia tylko do panelu administratora).

export interface MatchPreferences {
  availableCapital?: number;
  minInvestment?: number;
  maxInvestment?: number;
  maxLtvPercent?: number;
  propertyTypes?: string[];
  locations?: string[];
  periodMonthsMin?: number;
  periodMonthsMax?: number;
  expectedReturnPercent?: number;
  preferredSecurities?: string[];
}

export interface MatchableProject {
  id: string;
  amount: number;
  property_type: string;
  city: string;
  voivodeship: string | null;
  ltv_percent: number | null;
  period_months: number | null;
  interest_rate_percent: number | null;
  security_type: string | null;
  last_assigned_at: string | null;
  rejection_count: number;
}

export interface MatchContext {
  /** Liczba innych aktywnych przypisań inwestora. */
  activeAssignments: number;
  /** Odsetek terminowo podjętych decyzji (0-1); brak historii = 1. */
  onTimeDecisionRate?: number;
  /** Czas "teraz" — wstrzykiwany dla testowalności. */
  now: Date;
}

export interface MatchResult {
  projectId: string;
  eligible: boolean;
  score: number;
  reasons: string[];
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").trim();

function locationMatches(project: MatchableProject, locations: string[]): boolean {
  if (!locations.length) return true;
  const city = norm(project.city);
  const voiv = norm(project.voivodeship ?? "");
  return locations.some((loc) => {
    const l = norm(loc);
    if (!l) return false;
    if (l === "cala polska" || l === "polska") return true;
    return (
      city.includes(l) ||
      l.includes(city) ||
      (voiv !== "" && (voiv.includes(l) || l.includes(voiv)))
    );
  });
}

/** Punktacja pojedynczego projektu względem preferencji. */
export function scoreProject(
  project: MatchableProject,
  prefs: MatchPreferences,
  ctx: MatchContext,
): MatchResult {
  const reasons: string[] = [];

  // === Twarde filtry ===
  if (prefs.propertyTypes?.length && !prefs.propertyTypes.includes(project.property_type)) {
    return {
      projectId: project.id,
      eligible: false,
      score: 0,
      reasons: ["typ nieruchomości poza preferencjami"],
    };
  }
  if (prefs.minInvestment != null && project.amount < prefs.minInvestment) {
    return {
      projectId: project.id,
      eligible: false,
      score: 0,
      reasons: ["kwota poniżej minimum inwestora"],
    };
  }
  if (
    prefs.maxInvestment != null &&
    prefs.maxInvestment > 0 &&
    project.amount > prefs.maxInvestment
  ) {
    return {
      projectId: project.id,
      eligible: false,
      score: 0,
      reasons: ["kwota powyżej maksimum inwestora"],
    };
  }
  if (
    prefs.maxLtvPercent != null &&
    project.ltv_percent != null &&
    project.ltv_percent > prefs.maxLtvPercent
  ) {
    return {
      projectId: project.id,
      eligible: false,
      score: 0,
      reasons: ["LTV powyżej limitu inwestora"],
    };
  }

  let score = 0;

  // Zgodność kwoty z dostępnym kapitałem (25 pkt).
  const capital = prefs.availableCapital ?? 0;
  if (capital <= 0 || project.amount <= capital) {
    score += 25;
    reasons.push("kwota w zasięgu deklarowanego kapitału");
  } else {
    const ratio = capital / project.amount;
    score += Math.max(0, Math.round(25 * ratio));
    reasons.push("kwota przekracza deklarowany kapitał");
  }

  // Lokalizacja (15 pkt).
  if (locationMatches(project, prefs.locations ?? [])) {
    score += 15;
    reasons.push("zgodna lokalizacja");
  }

  // Typ nieruchomości przeszedł twardy filtr (10 pkt bazowo).
  score += 10;

  // LTV — im niższe względem limitu, tym lepiej (15 pkt).
  if (project.ltv_percent != null) {
    const limit = prefs.maxLtvPercent ?? 80;
    const headroom = Math.max(0, Math.min(1, (limit - project.ltv_percent) / limit));
    score += Math.round(15 * (0.4 + 0.6 * headroom));
    reasons.push(`LTV ${project.ltv_percent}%`);
  } else {
    score += 5;
    reasons.push("brak danych LTV");
  }

  // Okres finansowania (10 pkt).
  if (project.period_months != null) {
    const min = prefs.periodMonthsMin ?? 1;
    const max = prefs.periodMonthsMax ?? 360;
    if (project.period_months >= min && project.period_months <= max) {
      score += 10;
      reasons.push("okres w preferowanym zakresie");
    } else {
      const dist = Math.min(
        Math.abs(project.period_months - min),
        Math.abs(project.period_months - max),
      );
      score += Math.max(0, 10 - Math.min(10, Math.round(dist / 3)));
    }
  } else {
    score += 4;
  }

  // Oczekiwana rentowność vs oprocentowanie projektu (10 pkt).
  if (project.interest_rate_percent != null && prefs.expectedReturnPercent != null) {
    if (project.interest_rate_percent >= prefs.expectedReturnPercent) {
      score += 10;
      reasons.push("rentowność zgodna z oczekiwaniem");
    } else {
      const gap = prefs.expectedReturnPercent - project.interest_rate_percent;
      score += Math.max(0, 10 - Math.round(gap * 2));
    }
  } else {
    score += 5;
  }

  // Zabezpieczenia (10 pkt).
  if (
    !prefs.preferredSecurities?.length ||
    !project.security_type ||
    prefs.preferredSecurities.some((s) => (project.security_type ?? "").includes(s))
  ) {
    score += 10;
  } else {
    score += 3;
  }

  // Liczba innych aktywnych projektów inwestora (5 pkt — mniej = wyżej).
  score += Math.max(0, 5 - ctx.activeAssignments);

  // Historia terminowego podejmowania decyzji (5 pkt).
  score += Math.round(5 * Math.max(0, Math.min(1, ctx.onTimeDecisionRate ?? 1)));

  // Czas od ostatniego przypisania projektu (5 pkt — dłużej czekające wyżej).
  if (project.last_assigned_at) {
    const days = (ctx.now.getTime() - new Date(project.last_assigned_at).getTime()) / 86400000;
    score += Math.max(0, Math.min(5, Math.round(days)));
  } else {
    score += 5;
  }

  // Maksymalna możliwa suma punktów to 110 — normalizujemy do skali 0-100,
  // żeby obcięcie nie maskowało różnic między bardzo dobrymi dopasowaniami.
  return {
    projectId: project.id,
    eligible: true,
    score: Math.round((Math.max(0, score) / 110) * 100),
    reasons,
  };
}

/**
 * Ranking puli: filtruje projekty niekwalifikujące się i sortuje malejąco po
 * punktacji (remis rozstrzyga dłuższy czas oczekiwania w puli).
 */
export function rankProjects(
  projects: MatchableProject[],
  prefs: MatchPreferences,
  ctx: MatchContext,
): MatchResult[] {
  return projects
    .map((p) => scoreProject(p, prefs, ctx))
    .filter((r) => r.eligible)
    .sort((a, b) => b.score - a.score);
}
