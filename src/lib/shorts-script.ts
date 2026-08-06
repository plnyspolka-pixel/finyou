// Scenariusz shorta składany 1:1 z gotowej, sprawdzonej treści paczki
// „Pożyczki prywatne — 250 pytań do shortów" (docs/shorts) — BEZ przepisywania
// przez AI. Schemat rolki z pliku źródłowego rozbity na sekcje:
//   hook (znacznik kategorii + pytanie) → treść (teza odpowiedzi) → CTA.
// Lektor czyta sklejkę hook+treść+CTA; elementy dynamiczne to instrukcje
// ekranowe do montażu (lektor ich NIE czyta). Wszystko edytowalne w panelu.

import { SHORTS_OPENERS, type ShortsQuestion } from "./shorts-question-bank";

export const SHORTS_CTA = "Masz konkretną sytuację? Najpierw sprawdź umowę, KW i aktualne saldo.";

const HASHTAGS: Record<ShortsQuestion["category"], string[]> = {
  klient: ["#pożyczka", "#nieruchomości", "#finansowanie"],
  inwestor: ["#inwestowanie", "#nieruchomości", "#pożyczki"],
};

// Obowiązkowe elementy ekranowe każdej rolki (specyfikacja z pliku paczki).
export const SHORTS_DYNAMIC_ELEMENTS: Record<ShortsQuestion["category"], string[]> = {
  klient: [
    "0,0–3,0 s — mała ikonka „AI” w prawym górnym rogu: czytelna, ale dyskretna, bez tła i animacji, bezpieczny odstęp od krawędzi; lektor jej NIE czyta; znika po 3 s",
    "0,0–1,2 s — znacznik kategorii na ekranie: „PRYWATNE POŻYCZKI / POD ZASTAW NIERUCHOMOŚCI”",
    "od ok. 0,8 s — znacznik zmniejsza się i zostaje u góry, na środku pojawia się DUŻE pytanie dokładnie zgodne z tym, co mówi lektor",
    "między znacznikiem a pytaniem tylko krótkie cięcie rytmiczne — bez powitania, numeru odcinka i logo",
  ],
  inwestor: [
    "0,0–3,0 s — mała ikonka „AI” w prawym górnym rogu: czytelna, ale dyskretna, bez tła i animacji, bezpieczny odstęp od krawędzi; lektor jej NIE czyta; znika po 3 s",
    "0,0–1,5 s — znacznik kategorii na ekranie: „INWESTOWANIE W PRYWATNE POŻYCZKI / POD ZASTAW NIERUCHOMOŚCI”",
    "od ok. 1,0 s — znacznik zmniejsza się i zostaje u góry, na środku pojawia się DUŻE pytanie dokładnie zgodne z tym, co mówi lektor",
    "między znacznikiem a pytaniem tylko krótkie cięcie rytmiczne — bez powitania, numeru odcinka i logo",
  ],
};

export type ShortsScriptParts = {
  /** Znacznik kategorii + pytanie — mówione otwarcie rolki. */
  hook: string;
  /** Teza odpowiedzi z paczki — merytoryczna treść rolki. */
  content: string;
  /** Stałe zamknięcie rolki. */
  cta: string;
  /** Pełny tekst mówiony (hook + treść + CTA) — trafia do TTS. */
  script: string;
  title: string;
  description: string;
  hashtags: string[];
};

// Sklejka sekcji w pełny tekst dla lektora (puste sekcje pomijane).
export function joinShortsScript(parts: { hook: string; content: string; cta: string }): string {
  return [parts.hook, parts.content, parts.cta]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

export function buildShortsScript(q: ShortsQuestion): ShortsScriptParts {
  const hook = `${SHORTS_OPENERS[q.category]} ${q.question}`;
  const content = q.thesis;
  return {
    hook,
    content,
    cta: SHORTS_CTA,
    script: joinShortsScript({ hook, content, cta: SHORTS_CTA }),
    title: q.question.slice(0, 92),
    description: `${q.thesis}\n\nMateriał edukacyjny — to nie jest indywidualna porada prawna.`,
    hashtags: HASHTAGS[q.category],
  };
}
