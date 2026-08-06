// Scenariusz shorta składany 1:1 z gotowej, sprawdzonej treści paczki
// „Pożyczki prywatne — 250 pytań do shortów" (docs/shorts) — BEZ przepisywania
// przez AI. Schemat rolki z pliku źródłowego: znacznik kategorii → pytanie
// (hook) → teza odpowiedzi → stałe CTA. Tekst pozostaje edytowalny w panelu
// przed startem generacji.

import { SHORTS_OPENERS, type ShortsQuestion } from "./shorts-question-bank";

export const SHORTS_CTA = "Masz konkretną sytuację? Najpierw sprawdź umowę, KW i aktualne saldo.";

const HASHTAGS: Record<ShortsQuestion["category"], string[]> = {
  klient: ["#pożyczka", "#nieruchomości", "#finansowanie"],
  inwestor: ["#inwestowanie", "#nieruchomości", "#pożyczki"],
};

export function buildShortsScript(q: ShortsQuestion): {
  script: string;
  title: string;
  description: string;
  hashtags: string[];
} {
  return {
    script: `${SHORTS_OPENERS[q.category]} ${q.question} ${q.thesis} ${SHORTS_CTA}`,
    title: q.question.slice(0, 92),
    description: `${q.thesis}\n\nMateriał edukacyjny — to nie jest indywidualna porada prawna.`,
    hashtags: HASHTAGS[q.category],
  };
}
