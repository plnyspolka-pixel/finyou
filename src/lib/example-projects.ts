// Przykładowe projekty (ILUSTRACJA) na landing inwestora i w embedzie.
//
// Decyzja nadrzędna nr 7: bez logowania NIE pokazujemy żadnych prawdziwych
// wniosków. Landing pokazuje wyłącznie dane syntetyczne, generowane
// deterministycznie z dziennego seeda (ten sam dzień = te same karty), ze
// świeżymi datami (dziś − 0…6 dni) i wyraźną etykietą „ilustracja, nie oferta".
// Czysta funkcja — testowalna jednostkowo, bez I/O.

import type { PublicLead, RiskGrade } from "@/lib/public-leads.functions";
import { LTV_MAX } from "@/lib/contract-engine/fees";

export const EXAMPLE_PROJECTS_LABEL = "Przykładowe projekty — ilustracja, nie oferta";
export const EXAMPLE_PROJECTS_NOTE =
  "Karty poniżej są wygenerowanymi przykładami ilustrującymi format Projektu. Nie są prawdziwymi wnioskami, nie stanowią oferty ani rekomendacji inwestycyjnej. Prawdziwe Projekty widzi wyłącznie inwestor z przyjętym Zleceniem.";

const CITIES = [
  "Warszawa",
  "Kraków",
  "Wrocław",
  "Poznań",
  "Gdańsk",
  "Łódź",
  "Katowice",
  "Lublin",
  "Szczecin",
  "Bydgoszcz",
  "Rzeszów",
  "Toruń",
] as const;

const TYPES = ["mieszkanie", "dom", "lokal_uslugowy", "dzialka_budowlana"] as const;

/** Prosty, deterministyczny PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed dzienny: YYYYMMDD jako liczba (czas lokalny przeglądarki/serwera). */
export function dailySeed(now: Date = new Date()): number {
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

function gradeFromScore(score: number): RiskGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "E";
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

export interface ExampleProject extends PublicLead {
  /** Zawsze true — karta jest ilustracją, nie prawdziwym wnioskiem. */
  is_example: true;
}

/**
 * Generuje `count` przykładowych projektów dla danego dnia. Daty utworzenia:
 * dziś − 0…6 dni (malejąco). LTV zawsze ≤ LTV_MAX (60 %).
 */
export function generateExampleProjects(now: Date = new Date(), count = 6): ExampleProject[] {
  const rnd = mulberry32(dailySeed(now));
  const rows: ExampleProject[] = [];
  for (let i = 0; i < count; i += 1) {
    const type = TYPES[Math.floor(rnd() * TYPES.length)];
    const city = CITIES[Math.floor(rnd() * CITIES.length)];
    const value = roundTo(250_000 + rnd() * 1_750_000, 10_000);
    const ltv = Math.round(30 + rnd() * (LTV_MAX - 30));
    const amount = roundTo((value * ltv) / 100, 5_000);
    const period = [12, 18, 24, 36, 48][Math.floor(rnd() * 5)];
    const score = Math.round(55 + rnd() * 40);
    const locScore = Math.round(45 + rnd() * 50);
    const ageDays = Math.min(6, Math.floor((i / count) * 7 + rnd() * 1.5));
    const created = new Date(now.getTime() - ageDays * 86_400_000);
    rows.push({
      id: `przyklad-${dailySeed(now)}-${i + 1}`,
      created_at: created.toISOString(),
      property_type: type,
      city,
      loan_amount: amount,
      period_months: period,
      ltv,
      is_new: ageDays <= 1,
      first_name: null,
      kw_masked: null,
      score,
      grade: gradeFromScore(score),
      location_score: locScore,
      location_confidence: 60,
      location_scope: "prefix",
      is_example: true,
    });
  }
  return rows;
}
