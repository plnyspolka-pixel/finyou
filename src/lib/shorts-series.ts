// Seria inwestorska — 10 gotowych odcinków rolek (scenariusze autorskie,
// NIE z paczki 250 pytań). Struktura bogatsza niż w paczce: hook → treść →
// wyjątek → praktyka → własne CTA odcinka. Lektor czyta sklejkę 1:1 (bez
// AI); elementy ekranowe każdego odcinka są zdefiniowane TUTAJ, ręcznie,
// zgodnie ze wskazówkami montażowymi autora (porównanie, lista, rachunek,
// kolejność kroków) — a nie zgadywane przez AI. Teksty `syncText` to
// dosłowne fragmenty scenariusza: czas wejścia karty i jej wierszy liczy
// z nich overlaysWithCueTiming (caption-style.ts) po czasach ElevenLabs.
//
// Tekst mówiony jest lekko dostosowany do syntezy mowy: liczby słownie tam,
// gdzie TTS mógłby się potknąć („300 tysięcy złotych" zamiast „300 tys. zł"),
// znaki „=", „×", „÷" zastąpione słowami. Na ekranie zostają skróty i znaki.

import type { DynamicOverlays, OverlayCard } from "./caption-style";
import { SHORTS_OVERLAY_TAGS } from "./shorts-script";
import type { ShortsCategory } from "./shorts-question-bank";

export type ShortsEpisode = {
  id: number;
  /** Tytuł roboczy — także DUŻY tekst na ekranie w hooku. */
  title: string;
  category: ShortsCategory;
  /** Pytanie-hook — mówione otwarcie rolki (bez znacznika mówionego). */
  hook: string;
  content: string;
  /** „Wyjątek" — zastrzeżenie merytoryczne, mówione po treści. */
  exception: string;
  /** „Praktyka" — przykład, mówiony przed CTA. */
  practice: string;
  cta: string;
  /** Elementy ekranowe odcinka (karty wypalane w obrazie). */
  cards: Omit<OverlayCard, "startSeconds">[];
};

const INWESTOR_HASHTAGS = ["#inwestowanie", "#nieruchomości", "#pożyczki", "#hipoteka"];

export const SHORTS_SERIES: ShortsEpisode[] = [
  {
    id: 1,
    title: "Drukarka do pieniędzy",
    category: "inwestor",
    hook: "Wiesz, że banki od 500 lat zarabiają na jednej rzeczy — i możesz robić dokładnie to samo?",
    content:
      "Bank nie buduje, nie remontuje, nie szuka najemców. Bank pożycza pieniądze pod nieruchomość i co miesiąc odbiera odsetki. To jest cały model. Różnica? Ty możesz wejść w to samo bez licencji bankowej — jako prywatny inwestor.",
    exception:
      "Pożyczasz firmom na cel gospodarczy, a zabezpieczeniem jest hipoteka w księdze wieczystej.",
    practice:
      "Inwestor pożycza 300 tysięcy złotych pod mieszkanie warte 600 tysięcy. Pożyczkobiorca spłaca. Inwestor nie widział mieszkania na oczy.",
    cta: "Obserwuj Finance You — pokażę Ci, jak działa drukarka, o której banki nie mówią.",
    cards: [
      {
        title: "MODEL BANKU",
        syncText: "Bank nie buduje",
        endSyncText: "To jest cały model",
        rows: [
          { icon: "dot", text: "Nie buduje", syncText: "Bank nie buduje" },
          { icon: "dot", text: "Nie remontuje", syncText: "nie remontuje" },
          { icon: "dot", text: "Nie szuka najemców", syncText: "nie szuka najemców" },
          {
            icon: "check",
            text: "Pożycza pod nieruchomość",
            syncText: "Bank pożycza pieniądze pod nieruchomość",
          },
        ],
      },
      {
        title: "PRZYKŁAD",
        syncText: "Inwestor pożycza 300 tysięcy złotych",
        rows: [
          { icon: "dot", text: "Pożyczka", value: "300 tys. zł" },
          { icon: "dot", text: "Mieszkanie warte", value: "600 tys. zł" },
          { icon: "check", text: "LTV", value: "50%" },
        ],
      },
    ],
  },
  {
    id: 2,
    title: "Bez kupowania",
    category: "inwestor",
    hook: "Dlaczego najmądrzejsi inwestorzy w nieruchomości… nie kupują nieruchomości?",
    content:
      "Kupno to podatek, notariusz, remont, najemca, zarządca. Pożyczka pod zastaw to zero z tego. Zarabiasz na tej samej nieruchomości, ale to pożyczkobiorca ma problemy właściciela, a Ty masz wpis w księdze wieczystej.",
    exception: "Działa tylko przy rozsądnym LTV — my nie przekraczamy 60% wartości.",
    practice:
      "Flipper potrzebuje 200 tysięcy na 12 miesięcy. Ty dajesz, on remontuje, sprzedaje, oddaje z odsetkami. Ty nie dotknąłeś ani jednej ściany.",
    cta: "Obserwuj — w kolejnej rolce: jak sprawdzić, czy nieruchomość jest warta tyle, ile mówi pożyczkobiorca.",
    cards: [
      {
        title: "KUPNO NIERUCHOMOŚCI",
        syncText: "Kupno to podatek",
        rows: [
          { icon: "dot", text: "Podatek" },
          { icon: "dot", text: "Notariusz" },
          { icon: "dot", text: "Remont" },
          { icon: "dot", text: "Najemca" },
          { icon: "dot", text: "Zarządca" },
        ],
      },
      {
        title: "POŻYCZKA POD ZASTAW",
        syncText: "Pożyczka pod zastaw to zero z tego",
        rows: [
          { icon: "check", text: "Zero z tego" },
          { icon: "check", text: "Wpis w księdze wieczystej" },
          {
            icon: "check",
            text: "LTV",
            value: "do 60%",
            syncText: "nie przekraczamy 60% wartości",
          },
        ],
      },
    ],
  },
  {
    id: 3,
    title: "Lokata vs hipoteka",
    category: "inwestor",
    hook: "Trzymasz 500 tysięcy na lokacie? Policzmy, ile Cię to kosztuje.",
    content:
      "Lokata: kilka procent, bank bierze resztę. Pożyczka pod zastaw: oprocentowanie do limitu ustawowego odsetek maksymalnych — bank w tej transakcji w ogóle nie występuje. Jedno pytanie: kto zarabia na Twoich pieniądzach — Ty czy pośrednik?",
    exception:
      "To nie jest lokata — ryzyko jest, dlatego istnieje zabezpieczenie hipoteczne i limit LTV.",
    practice:
      "Przykład ilustracyjny: 500 tysięcy na lokacie i 500 tysięcy w pożyczce pod zastaw — porównaj, kto zarabia na Twoich pieniądzach.",
    cta: "Obserwuj, jeśli wolisz być bankiem niż klientem banku.",
    cards: [
      {
        title: "KTO ZARABIA?",
        syncText: "Lokata: kilka procent",
        rows: [
          { icon: "dot", text: "Lokata", value: "kilka %", syncText: "Lokata: kilka procent" },
          {
            icon: "check",
            text: "Pożyczka pod zastaw",
            value: "do odsetek maks.",
            syncText: "Pożyczka pod zastaw: oprocentowanie",
          },
          {
            icon: "dot",
            text: "Bank w transakcji",
            value: "brak",
            syncText: "bank w tej transakcji",
          },
        ],
      },
      {
        title: "500 000 ZŁ — PRZYKŁAD ILUSTRACYJNY",
        syncText: "Przykład ilustracyjny: 500 tysięcy",
        rows: [
          { icon: "dot", text: "Lokata", value: "kilka % rocznie" },
          { icon: "check", text: "Pożyczka pod zastaw", value: "limit ustawowy" },
          { icon: "dot", text: "Ryzyko", value: "hipoteka + LTV" },
        ],
      },
    ],
  },
  {
    id: 4,
    title: "Czy wiesz, że…",
    category: "inwestor",
    hook: "Czy wiesz, że pożyczkobiorca może Ci spłacić pożyczkę… i zostawić Ci jeszcze mieszkanie?",
    content:
      "Nie — to mit. I dobrze, że mit. Hipoteka to nie przejęcie nieruchomości, tylko gwarancja, że jak ktoś nie spłaci, komornik sprzeda ją i Ty dostajesz swoje pierwszy. Nie chcesz mieszkania. Chcesz odsetek. Mieszkanie to tylko polisa.",
    exception:
      "Egzekucja to ostatnia droga — w praktyce większość spraw kończy się spłatą albo ugodą.",
    practice:
      "Dlatego wpis na pierwszym miejscu w dziale czwartym księgi wieczystej to podstawa — to Twoja kolejka do kasy.",
    cta: "Obserwuj serię „Czy wiesz, że” — codziennie jeden fakt, który odróżnia inwestora od hazardzisty.",
    cards: [
      {
        title: "HIPOTEKA TO NIE PRZEJĘCIE",
        syncText: "Hipoteka to nie przejęcie nieruchomości",
        rows: [
          { icon: "dot", text: "Komornik sprzedaje", syncText: "komornik sprzeda ją" },
          {
            icon: "dot",
            text: "Ty dostajesz swoje pierwszy",
            syncText: "Ty dostajesz swoje pierwszy",
          },
          { icon: "check", text: "Chcesz odsetek, nie mieszkania", syncText: "Chcesz odsetek" },
        ],
      },
      {
        title: "KSIĘGA WIECZYSTA",
        syncText: "wpis na pierwszym miejscu",
        rows: [
          { icon: "check", text: "Dział IV — pierwsze miejsce" },
          { icon: "dot", text: "Twoja kolejka do kasy", syncText: "Twoja kolejka do kasy" },
        ],
      },
    ],
  },
  {
    id: 5,
    title: "Jedno zdanie z księgi wieczystej",
    category: "inwestor",
    hook: "Czy jedna linijka w księdze wieczystej może uratować Ci 400 tysięcy?",
    content:
      "Tak. Dział trzeci. Jeśli jest tam „wzmianka” albo „służebność osobista dożywotnia” — nie pożyczasz. Koniec rozmowy. Nieważne, jak ładne mieszkanie.",
    exception: "Niektóre wpisy są niegroźne — ale to musisz umieć odróżnić.",
    practice:
      "Każdą księgę wieczystą sprawdzasz online w 10 minut. Za darmo. Zanim w ogóle odbierzesz telefon od pożyczkobiorcy.",
    cta: "Obserwuj — w następnej rolce 5 wpisów w księdze wieczystej, które oznaczają STOP.",
    cards: [
      {
        title: "DZIAŁ III — STOP",
        syncText: "Dział trzeci",
        rows: [
          { icon: "dot", text: "Wzmianka", syncText: "Jeśli jest tam" },
          {
            icon: "dot",
            text: "Służebność osobista dożywotnia",
            syncText: "albo służebność osobista dożywotnia",
          },
          {
            icon: "check",
            text: "Nie pożyczasz. Koniec rozmowy",
            syncText: "nie pożyczasz. Koniec rozmowy",
          },
        ],
      },
      {
        title: "SPRAWDZENIE KW",
        syncText: "Każdą księgę wieczystą sprawdzasz online",
        rows: [
          { icon: "check", text: "Online" },
          { icon: "check", text: "10 minut", syncText: "w 10 minut" },
          { icon: "check", text: "Za darmo", syncText: "Za darmo" },
        ],
      },
    ],
  },
  {
    id: 6,
    title: "Wolność finansowa bez Excela",
    category: "inwestor",
    hook: "Ile pożyczek pod zastaw potrzebujesz, żeby nie musieć chodzić do pracy?",
    content:
      "Nie 50. Nie 20. Policz odwrotnie: Twoje miesięczne koszty razy 12, podzielone przez roczne odsetki — to kapitał, który musi pracować. Dla wielu osób to 3 do 5 pożyczek. Nie portfel, nie fundusz — kilka umów z hipoteką.",
    exception: "Nigdy jednej dużej. Dywersyfikacja to nie slogan, to warunek spania spokojnie.",
    practice:
      "Podstaw swoje liczby: koszty, odsetki, kapitał — i zobacz, ile pożyczek wychodzi Tobie.",
    cta: "Obserwuj, policz swoją liczbę i napisz w komentarzu — ile Ci wyszło?",
    cards: [
      {
        title: "TWOJA LICZBA",
        syncText: "Policz odwrotnie",
        rows: [
          {
            icon: "dot",
            text: "Koszty miesięczne × 12",
            syncText: "Twoje miesięczne koszty razy 12",
          },
          { icon: "dot", text: "÷ roczne odsetki", syncText: "podzielone przez roczne odsetki" },
          {
            icon: "check",
            text: "= kapitał, który pracuje",
            syncText: "to kapitał, który musi pracować",
          },
          {
            icon: "check",
            text: "Zwykle",
            value: "3–5 pożyczek",
            syncText: "Dla wielu osób to 3 do 5 pożyczek",
          },
        ],
      },
      {
        title: "ZASADA",
        syncText: "Nigdy jednej dużej",
        rows: [
          { icon: "dot", text: "Nigdy jednej dużej" },
          { icon: "check", text: "Dywersyfikacja", syncText: "Dywersyfikacja to nie slogan" },
        ],
      },
    ],
  },
  {
    id: 7,
    title: "Dlaczego płacą więcej niż w banku?",
    category: "inwestor",
    hook: "Skoro bank jest tańszy, to dlaczego ktoś pożycza drożej od prywatnego inwestora?",
    content:
      "Bo bank odpowiada „nie” tygodniami. A przedsiębiorca ma 10 dni, żeby zamknąć transakcję, która zarobi mu 200 tysięcy. Płaci Tobie za czas, nie za pieniądze. Ty sprzedajesz szybkość. To najdroższy towar w biznesie.",
    exception: "Pożyczasz tylko firmom na cel gospodarczy — konsumentów nie obsługujemy.",
    practice:
      "Deweloper kupuje działkę z przetargu — przelew w 7 dni albo traci wadium. Ty jesteś jedyną osobą, która zdąży.",
    cta: "Obserwuj, jeśli chcesz zarabiać na tym, czego banki nie potrafią — na tempie.",
    cards: [
      {
        title: "ZA CO PŁACI PRZEDSIĘBIORCA",
        syncText: "Bo bank odpowiada",
        rows: [
          { icon: "dot", text: "Bank: „nie” po tygodniach" },
          { icon: "check", text: "Ty: decyzja w dni", syncText: "A przedsiębiorca ma 10 dni" },
          {
            icon: "check",
            text: "Płaci za czas, nie za pieniądze",
            syncText: "Płaci Tobie za czas",
          },
        ],
      },
      {
        title: "PRZYKŁAD",
        syncText: "Deweloper kupuje działkę z przetargu",
        rows: [
          { icon: "dot", text: "Przelew", value: "7 dni", syncText: "przelew w 7 dni" },
          { icon: "dot", text: "Albo traci", value: "wadium", syncText: "albo traci wadium" },
        ],
      },
    ],
  },
  {
    id: 8,
    title: "3 pytania w 60 sekund",
    category: "inwestor",
    hook: "Jak odrzucić złą pożyczkę w minutę — bez czytania 40 stron dokumentów?",
    content:
      "Pytanie pierwsze: ile warta jest nieruchomość i skąd to wiesz? Pytanie drugie: ile chcesz pożyczyć? Jeśli ponad 60 procent wartości — do widzenia. Pytanie trzecie: z czego spłacisz? Jeśli odpowiedź brzmi „z tej pożyczki” — do widzenia.",
    exception: "To filtr wstępny, nie analiza — ale wycina 80% spraw, które zabrałyby Ci tydzień.",
    practice:
      "Trzecie pytanie jest najważniejsze. Źródło spłaty, nie wartość zabezpieczenia, decyduje, czy w ogóle zobaczysz odsetki.",
    cta: "Obserwuj — zapisz te 3 pytania, bo to one odróżniają inwestora od ofiary.",
    cards: [
      {
        title: "3 PYTANIA",
        syncText: "Pytanie pierwsze",
        rows: [
          { icon: "dot", text: "1. Ile warta? Skąd wiesz?", syncText: "Pytanie pierwsze" },
          { icon: "dot", text: "2. Ile pożyczyć? Ponad 60% — nie", syncText: "Pytanie drugie" },
          { icon: "dot", text: "3. Z czego spłacisz?", syncText: "Pytanie trzecie" },
        ],
      },
      {
        title: "NAJWAŻNIEJSZE",
        syncText: "Trzecie pytanie jest najważniejsze",
        rows: [
          { icon: "check", text: "Źródło spłaty", syncText: "Źródło spłaty, nie wartość" },
          { icon: "dot", text: "nie wartość zabezpieczenia" },
        ],
      },
    ],
  },
  {
    id: 9,
    title: "Nie musisz mieć miliona",
    category: "inwestor",
    hook: "Myślisz, że pożyczki pod zastaw są dla milionerów? Oto kwota, od której to naprawdę działa.",
    content:
      "Większość spraw na rynku to 100 do 300 tysięcy złotych. Nie 5 milionów. A wejść da się już od 50 tysięcy złotych. Zabezpieczeniem jest zwykłe mieszkanie albo dom — płynne, łatwe do wyceny, łatwe do sprzedania w razie czego.",
    exception:
      "Poniżej 50 tysięcy koszty notariusza i wpisu hipoteki zjadają zysk — to nie jest rynek na 20 tysięcy.",
    practice:
      "Inwestor z 250 tysięcy robi jedną dobrą pożyczkę rocznie i jest w lepszej sytuacji niż ktoś z milionem w trzech funduszach, których nie rozumie. A z 50 tysięcy robisz pierwszą — i uczysz się na własnej umowie, nie na cudzym prospekcie.",
    cta: "Obserwuj, jeśli masz kapitał, który nudzi się na koncie.",
    cards: [
      {
        title: "KWOTY",
        syncText: "Większość spraw na rynku",
        rows: [
          { icon: "dot", text: "Typowa sprawa", value: "100–300 tys." },
          {
            icon: "check",
            text: "Wejście od",
            value: "50 tys. zł",
            syncText: "A wejść da się już od 50 tysięcy",
          },
          {
            icon: "dot",
            text: "Poniżej 50 tys.",
            value: "koszty zjadają zysk",
            syncText: "Poniżej 50 tysięcy koszty",
          },
        ],
      },
      {
        title: "PRZYKŁAD",
        syncText: "Inwestor z 250 tysięcy",
        rows: [
          { icon: "dot", text: "Inwestor", value: "250 tys." },
          { icon: "check", text: "Jedna dobra pożyczka", value: "rocznie" },
          {
            icon: "check",
            text: "Pierwsza już od",
            value: "50 tys.",
            syncText: "A z 50 tysięcy robisz pierwszą",
          },
        ],
      },
    ],
  },
  {
    id: 10,
    title: "Co bank wie, a Ty nie",
    category: "inwestor",
    hook: "Czy wiesz, co robi bank w pierwszej sekundzie po podpisaniu umowy kredytowej?",
    content:
      "Wpisuje hipotekę. Nie czeka, nie ufa, nie wierzy na słowo. Umowa pożyczki bez wpisu w księdze wieczystej to tylko kartka papieru. Z wpisem to roszczenie, którego nie da się sprzedać, podarować ani ukryć razem z nieruchomością.",
    exception:
      "Wpis trwa od kilku dni do kilku tygodni — dlatego pieniądze wypłaca się dopiero po złożeniu wniosku o wpis, nigdy wcześniej.",
    practice:
      "Akt notarialny, wniosek o wpis, wypłata. Nigdy odwrotnie. Tak robią banki od 500 lat — i dlatego nadal istnieją.",
    cta: "Obserwuj Finance You — uczymy robić to, co banki, tylko bez banku.",
    cards: [
      {
        title: "UMOWA BEZ WPISU",
        syncText: "Umowa pożyczki bez wpisu",
        rows: [
          { icon: "dot", text: "Tylko kartka papieru" },
          { icon: "check", text: "Z wpisem: roszczenie", syncText: "Z wpisem to roszczenie" },
        ],
      },
      {
        title: "KOLEJNOŚĆ",
        syncText: "Akt notarialny, wniosek o wpis",
        rows: [
          { icon: "dot", text: "1. Akt notarialny", syncText: "Akt notarialny, wniosek" },
          { icon: "dot", text: "2. Wniosek o wpis", syncText: "wniosek o wpis, wypłata" },
          { icon: "dot", text: "3. Wypłata", syncText: "wypłata. Nigdy odwrotnie" },
        ],
      },
    ],
  },
];

export function findShortsEpisode(id: number): ShortsEpisode | undefined {
  return SHORTS_SERIES.find((e) => e.id === id);
}

// Prefiks promptu odcinka serii — inny niż "#N · " paczki 250, żeby kolejka
// i biblioteka rozróżniały obie bazy bez zmiany schematu bazy danych.
export function episodePromptTag(id: number): string {
  return `#S${id} · `;
}

export function episodePromptFor(ep: ShortsEpisode): string {
  return `${episodePromptTag(ep.id)}${ep.title}`;
}

export function parseEpisodePromptTag(prompt: string): number | null {
  const m = /^#S(\d{1,3}) · /.exec(prompt);
  return m ? Number(m[1]) : null;
}

export type EpisodeScriptParts = {
  hook: string;
  /** Treść + wyjątek + praktyka — środek rolki (sekcja „treść" w panelu). */
  content: string;
  cta: string;
  /** Pełny tekst mówiony — trafia do TTS. */
  script: string;
  title: string;
  description: string;
  hashtags: string[];
};

const joinSpoken = (...parts: string[]) =>
  parts
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");

/** Scenariusz odcinka 1:1 (bez AI): hook → treść → wyjątek → praktyka → CTA. */
export function buildEpisodeScript(ep: ShortsEpisode): EpisodeScriptParts {
  const content = joinSpoken(ep.content, ep.exception, ep.practice);
  return {
    hook: ep.hook,
    content,
    cta: ep.cta,
    script: joinSpoken(ep.hook, content, ep.cta),
    title: ep.hook.slice(0, 92),
    description: `${ep.content}\n\nMateriał edukacyjny — to nie jest indywidualna porada inwestycyjna.`,
    hashtags: INWESTOR_HASHTAGS,
  };
}

/**
 * Nakładki odcinka: znacznik kategorii, DUŻY tytuł odcinka na ekranie
 * (zsynchronizowany z mówionym hookiem) i karty ekranowe z definicji
 * odcinka. Wszystkie czasy poza startem to szacunki — przy wypalaniu
 * dopasowuje je do kwestii SRT overlaysWithCueTiming.
 */
export function buildEpisodeOverlays(ep: ShortsEpisode): DynamicOverlays {
  // Hook jest mówiony od razu (bez mówionego otwarcia), ~14 znaków/s.
  const hookEnd = 1 + ep.hook.length / 14 + 0.4;
  const contentStart = hookEnd + 0.5;
  return {
    tag: SHORTS_OVERLAY_TAGS[ep.category],
    tagHoldSeconds: 1.5,
    headline: ep.title,
    headlineSyncText: ep.hook,
    headlineStartSeconds: 1.0,
    headlineEndSeconds: Math.min(Math.max(hookEnd, 4), 10),
    cards: ep.cards.map((card, i) => ({
      ...card,
      startSeconds: contentStart + i * 8,
      endSeconds: card.endSeconds ?? null,
    })),
  };
}
