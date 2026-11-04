// Harmonogram i tematy bota blogowego — czysta logika (testowalna bez Supabase).

export type PostKind =
  | "borrower_news"
  | "investor_news"
  | "legal_market_monitor"
  | "investor_review"
  | "evergreen_guide";

/** Rodzaje publikowane z harmonogramu i minimalny odstęp między nimi (dni). */
export const SCHEDULE: { kind: PostKind; everyDays: number }[] = [
  { kind: "evergreen_guide", everyDays: 7 },
  { kind: "legal_market_monitor", everyDays: 14 },
];

/** Czy rodzaj jest „do publikacji”: brak wpisu albo ostatni starszy niż odstęp (z zapasem 12 h na przesunięcia crona). */
export function isDue(
  lastPublishedAt: string | null | undefined,
  everyDays: number,
  now = new Date(),
): boolean {
  if (!lastPublishedAt) return true;
  const ageMs = now.getTime() - new Date(lastPublishedAt).getTime();
  return ageMs >= everyDays * 24 * 3600 * 1000 - 12 * 3600 * 1000;
}

/**
 * Tematy poradników (B2B: finansowanie celu gospodarczego pod zastaw
 * nieruchomości). Każdy ma frazę główną i stronę produktu, do której
 * poradnik linkuje — to wzmacnia strony pożyczek w Google. Kolejność =
 * priorytet; bot bierze pierwszy jeszcze nieopisany.
 */
export const EVERGREEN_GUIDES: { topic: string; keyword: string; target: string }[] = [
  {
    topic: "Pożyczka pod zastaw mieszkania dla firmy — jak działa krok po kroku",
    keyword: "pożyczka pod zastaw mieszkania dla firmy",
    target: "/pozyczka-pod-zastaw-mieszkania",
  },
  {
    topic: "Pożyczka pod zastaw domu na cel firmowy — warunki, dokumenty, czas",
    keyword: "pożyczka pod zastaw domu",
    target: "/pozyczka-pod-zastaw-domu",
  },
  {
    topic: "Ile można pożyczyć pod zastaw nieruchomości? LTV, wycena i przykłady wyliczeń",
    keyword: "ile można pożyczyć pod zastaw nieruchomości",
    target: "/kalkulator-ltv",
  },
  {
    topic: "Pożyczka pod zastaw działki budowlanej dla przedsiębiorcy",
    keyword: "pożyczka pod zastaw działki",
    target: "/pozyczka-pod-zastaw-dzialki",
  },
  {
    topic: "Pożyczka pod zastaw lokalu użytkowego — kiedy to dobre źródło finansowania firmy",
    keyword: "pożyczka pod zastaw lokalu użytkowego",
    target: "/pozyczka-pod-zastaw-lokalu-uzytkowego",
  },
  {
    topic: "Pożyczka pod zastaw ziemi rolnej — jak wycenia się grunt rolny i na co uważać",
    keyword: "pożyczka pod zastaw ziemi rolnej",
    target: "/pozyczka-pod-zastaw-ziemi-rolnej",
  },
  {
    topic:
      "Pożyczka dla rolnika pod zastaw gruntu — inwestycje w gospodarstwo bez czekania na bank",
    keyword: "pożyczka dla rolnika",
    target: "/pozyczka-dla-rolnikow",
  },
  {
    topic: "Pożyczka dla firmy od pierwszego dnia działalności — bez historii kredytowej, pod zastaw nieruchomości",
    keyword: "pożyczka dla nowej firmy",
    target: "/pozyczka-dla-nowych-firm",
  },
  {
    topic: "Pożyczka pod II hipotekę dla firmy — kiedy jest możliwa i jak ją uzyskać",
    keyword: "pożyczka pod drugą hipotekę",
    target: "/pozyczka-pod-zastaw-mieszkania",
  },
  {
    topic: "Bank odmówił kredytu firmie — jakie są alternatywy z zabezpieczeniem na nieruchomości",
    keyword: "bank odmówił kredytu firmie",
    target: "/dla-klienta",
  },
  {
    topic: "Jakie dokumenty są potrzebne do pożyczki pod zastaw nieruchomości dla firmy",
    keyword: "dokumenty do pożyczki pod zastaw nieruchomości",
    target: "/dla-klienta",
  },
  {
    topic: "Księga wieczysta a pożyczka pod zastaw — co sprawdzić przed złożeniem wniosku",
    keyword: "księga wieczysta pożyczka pod zastaw",
    target: "/dla-klienta",
  },
  {
    topic: "Akt notarialny, hipoteka i art. 777 k.p.c. — jak wygląda zabezpieczenie pożyczki",
    keyword: "zabezpieczenie pożyczki hipoteką",
    target: "/dla-klienta",
  },
  {
    topic:
      "Pożyczka pod zastaw nieruchomości na płynność firmy — zatory płatnicze, sezonowość, VAT",
    keyword: "pożyczka na płynność firmy",
    target: "/dla-klienta",
  },
  {
    topic: "Pożyczka pod zastaw nieruchomości na zakup maszyn i rozwój firmy",
    keyword: "pożyczka na rozwój firmy pod zastaw nieruchomości",
    target: "/dla-klienta",
  },
  {
    topic: "Pożyczka pozabankowa a kredyt firmowy — porównanie czasu, kosztów i wymogów",
    keyword: "pożyczka pozabankowa czy kredyt firmowy",
    target: "/pozyczki",
  },
];

export function pickGuide(usedTopics: (string | undefined)[]): (typeof EVERGREEN_GUIDES)[number] {
  return (
    EVERGREEN_GUIDES.find((g) => !usedTopics.includes(g.topic)) ??
    EVERGREEN_GUIDES[usedTopics.length % EVERGREEN_GUIDES.length]
  );
}

/**
 * Tematy przeglądu inwestycyjnego. Wcześniej model sam „wybierał jeden” —
 * w praktyce prawie zawsze pierwszy, przez co powstało kilkanaście niemal
 * identycznych wpisów „vs obligacje COI/EDO vs lokaty 12M”, które Google
 * skleja jako duplikaty. Teraz temat wybiera kod: najdawniej użyty.
 */
export const REVIEW_TOPICS: string[] = [
  "Pożyczki pod zastaw nieruchomości vs obligacje skarbowe COI/EDO vs lokaty bankowe 12M",
  "Pożyczki pod zastaw vs crowdfunding nieruchomościowy (Shareholder, Social.Estate) vs REIT-y zagraniczne",
  "Mieszkania na wynajem vs pożyczki pod zastaw nieruchomości (yield netto, ROE z lewarem, koszty, podatki)",
  "Pożyczki prywatne pod hipotekę vs obligacje korporacyjne (Catalyst) vs fundusze dłużne",
  "IKE/IKZE w ETF vs aktywne inwestowanie w pożyczki pod zastaw",
  "Pożyczki pod zastaw nieruchomości vs złoto inwestycyjne vs obligacje indeksowane inflacją",
  "Pożyczki pod zastaw nieruchomości vs zakup działki pod inwestycję (płynność, ryzyko, podatki)",
  "Pożyczki pod zastaw nieruchomości vs fundusze private debt i FIZ (koszty, dostępność, kontrola)",
];

export function pickReviewTopic(usedNewestFirst: (string | undefined)[]): string {
  // Najpierw tematy jeszcze nieużyte, potem najdawniej użyty.
  const unused = REVIEW_TOPICS.find((t) => !usedNewestFirst.includes(t));
  if (unused) return unused;
  let best = REVIEW_TOPICS[0];
  let bestIdx = -1;
  for (const t of REVIEW_TOPICS) {
    const idx = usedNewestFirst.indexOf(t);
    if (idx > bestIdx) {
      bestIdx = idx;
      best = t;
    }
  }
  return best;
}
