// Sekwencje powitalne e-mail per tor (brief 5.4: mail powitalny z materiałem
// + automatyczna sekwencja). Dzień 0 to mail lead magnetu / narzędzia; tu
// kolejne kroki. Treści są stałe, sprawdzone regułami compliance w testach –
// agent może je rozbudować, ale każda zmiana idzie przez bramkę.
// Czysty moduł – bez I/O.
import { RISK_LINES, SENDER_LINE } from "./compliance-rules";
import type { Track } from "./types";

export interface SequenceStep {
  step: number;
  /** Dni od zapisu. */
  day: number;
  subject: string;
  body: string;
}

const START = "https://financeyou.pl/start";

export const WELCOME_SEQUENCES: Record<Track, SequenceStep[]> = {
  pozyczkobiorca: [
    {
      step: 1,
      day: 2,
      subject: "Ile naprawdę możesz uzyskać pod nieruchomość firmy?",
      body: `Dzień dobry,

najczęstsze pytanie przedsiębiorców brzmi: „ile dostanę?”. Odpowiedź zaczyna się od jednej liczby – LTV, czyli stosunku kwoty finansowania do wartości nieruchomości (razem z istniejącymi hipotekami).

Przykład: nieruchomość warta 1 mln zł, bez innych obciążeń. Przy limicie LTV stosowanym w naszym systemie orientacyjna kwota to do 600 tys. zł. Jeśli na nieruchomości jest już hipoteka, odejmujemy ją od tego limitu.

Policz to dla swojej nieruchomości: https://financeyou.pl/narzedzie/ile-pod-nieruchomosc

Kwota jest orientacyjna – ostateczną decyzję podejmują finansujący po analizie nieruchomości i firmy.`,
    },
    {
      step: 2,
      day: 5,
      subject: "Bank odmówił? 3 rzeczy, które warto sprawdzić",
      body: `Dzień dobry,

odmowa banku nie zawsze oznacza koniec rozmowy o finansowaniu firmy. Zanim złożysz kolejny wniosek, sprawdź trzy rzeczy:

1. Cel finansowania – musi być związany z działalnością gospodarczą i dobrze opisany.
2. Księgę wieczystą – wpisy w działach III i IV potrafią wydłużyć proces o tygodnie.
3. Realną wartość nieruchomości – od niej zależy, ile można uzyskać.

Jeśli chcesz, przeanalizujemy Twoją sytuację: https://app.financeyou.pl/embed/wniosek

Złożenie wniosku jest bezpłatne, a decyzja o finansowaniu należy do finansujących.`,
    },
    {
      step: 3,
      day: 9,
      subject: "Od wniosku do wypłaty – jak wygląda proces krok po kroku",
      body: `Dzień dobry,

proces finansowania pod zastaw nieruchomości wygląda zwykle tak:

1. Wniosek i podstawowe dane firmy oraz nieruchomości.
2. Analiza księgi wieczystej i wartości zabezpieczenia.
3. Propozycje od finansujących – wybierasz, czy i którą przyjmujesz.
4. Umowa u notariusza i wpis hipoteki.
5. Wypłata środków.

Wszystkie materiały dla przedsiębiorców znajdziesz tutaj: ${START}`,
    },
  ],
  inwestor: [
    {
      step: 1,
      day: 2,
      subject: "Jak bank zarabia na nieruchomościach, nie kupując ich?",
      body: `Dzień dobry,

banki od stuleci zarabiają na nieruchomościach w prosty sposób: pożyczają pod zabezpieczenie i pobierają odsetki według umowy. Nie kupują, nie remontują, nie szukają najemców.

Prywatny inwestor może działać w podobnym modelu – finansując przedsiębiorców pod hipotekę. Kluczowe jest jedno: umiejętność oceny zabezpieczenia.

Sprawdź, jaki zapas bezpieczeństwa daje konkretna transakcja: https://financeyou.pl/narzedzie/kalkulator-ltv`,
    },
    {
      step: 2,
      day: 5,
      subject: "3 błędy, które kosztują inwestorów najwięcej",
      body: `Dzień dobry,

trzy błędy, które najczęściej kosztują inwestorów w pożyczkach pod hipotekę:

1. Ślepa wiara w wycenę – wycena to szacunek, a nie cena sprzedaży.
2. Pominięcie księgi wieczystej – wcześniejsze hipoteki stoją w kolejce przed Tobą.
3. Zapominanie o kosztach i czasie egzekucji – z kwoty ze sprzedaży najpierw schodzą koszty postępowania.

Hipoteka zmniejsza ryzyko, ale go nie usuwa.`,
    },
    {
      step: 3,
      day: 9,
      subject: "Od czego zacząć jako inwestor?",
      body: `Dzień dobry,

pierwszy krok nie wymaga dużego kapitału na start – wymaga wiedzy: jak czytać księgę wieczystą, jak liczyć LTV i jak oceniać lokalizację.

Pokazujemy to w programie dla inwestorów: https://financeyou.pl/dla-inwestora

Decyzja o każdej inwestycji zawsze należy do Ciebie.`,
    },
  ],
};

/** Pełna treść kroku ze stopką (ryzyko, nadawca). */
export function renderStep(track: Track, s: SequenceStep, firstName: string | null): string {
  const hello = firstName ? s.body.replace(/^Dzień dobry,/, `Dzień dobry ${firstName},`) : s.body;
  return `${hello}\n\nPozdrawiamy,\nzespół Finance You\n\n${RISK_LINES[track]}\n${SENDER_LINE}`;
}

/** Tor subskrybenta z tagów (lead magnety: klient/inwestor, narzędzia: tor). */
export function trackFromTags(tags: string[] | null | undefined): Track | null {
  const t = new Set(tags ?? []);
  if (t.has("inwestor")) return "inwestor";
  if (t.has("klient") || t.has("pozyczkobiorca")) return "pozyczkobiorca";
  return null;
}

export interface SequenceCandidate {
  subscriberId: string;
  tags: string[];
  createdAt: string;
  sentSteps: number[];
  /** Maile marketingowe do tej osoby w ostatnich 7 dniach. */
  sentLast7d: number;
  /** Ostatni mail z sekwencji (odstęp min. 2 dni między krokami). */
  lastSentAt?: string | null;
}

export const MIN_STEP_GAP_DAYS = 2;
/** Sekwencja dotyczy nowych zapisów – starsza lista nie dostaje maili hurtem. */
export const SEQUENCE_WINDOW_DAYS = 30;

/** Następny krok do wysłania albo null (za wcześnie, limit, koniec sekwencji). */
export function nextSequenceStep(
  c: SequenceCandidate,
  now: Date,
  maxPerWeek: number,
): { track: Track; step: SequenceStep } | null {
  const track = trackFromTags(c.tags);
  if (!track) return null;
  if (c.sentLast7d >= maxPerWeek) return null;
  if (
    c.lastSentAt &&
    now.getTime() - new Date(c.lastSentAt).getTime() < MIN_STEP_GAP_DAYS * 86_400_000
  )
    return null;
  const ageDays = (now.getTime() - new Date(c.createdAt).getTime()) / 86_400_000;
  const due = WELCOME_SEQUENCES[track]
    .filter((s) => !c.sentSteps.includes(s.step) && s.day <= ageDays)
    .sort((a, b) => a.step - b.step);
  // Zaległe kroki nie idą hurtem: tylko jeden mail na przebieg.
  return due.length ? { track, step: due[0] } : null;
}
