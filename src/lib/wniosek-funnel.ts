// JEDNO źródło prawdy dla danych przekazywanych między krokami kreatora wniosku.
//
// Wcześniej te same dane krążyły w trzech różnych kluczach sessionStorage
// (`calc_step1_v1`, `embed_calc_v1`, `wniosek_prefill_v1`) zapisywanych i czytanych
// w sześciu miejscach. Przez to parametry z kalkulatora na landingu (kwota, typ
// zabezpieczenia) ginęły w drodze:
//   landing → /wniosek-zabezpieczenie → /wniosek-formularz
// bo formularz czytał wyłącznie `embed_calc_v1`, a tamten krok zapisywał `calc_step1_v1`.
//
// Kanoniczny przepływ kreatora:
//   kalkulator / lead          → /wniosek-start (konto + zgody)
//                              → /wniosek-formularz (3 kroki, zapis do DB)
//                              → /wniosek-opis (booster po złożeniu)
//   /wniosek/$token (lead Meta) → prefill + claim → /wniosek-start
//
// Wszystkie kroki czytają i piszą stan przez ten moduł (klucz `wniosek_funnel_v1`).

export type WniosekFunnelState = {
  // parametry z kalkulatora / wizardu
  amount?: number | null;
  annualRate?: number | null;
  months?: number | null;
  maxPayment?: number | null;
  secType?: string | null;
  source?: string | null;
  /** Krok startowy formularza (mapowany w /wniosek-formularz). */
  startStep?: number | null;
  // prefill z leada / linku zwrotnego
  loanApplicationId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

const KEY = "wniosek_funnel_v1";
// Klucze ze starszych wersji — czytane tylko po to, by nie zgubić sesji w trakcie wdrożenia.
const LEGACY_KEYS = ["calc_step1_v1", "embed_calc_v1", "wniosek_prefill_v1"] as const;

function safeParse(raw: string | null): Partial<WniosekFunnelState> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Partial<WniosekFunnelState>) : {};
  } catch {
    return {};
  }
}

/** Odczyt połączonego stanu (klucz kanoniczny + ewentualne klucze legacy). */
export function readFunnelState(): WniosekFunnelState {
  if (typeof window === "undefined") return {};
  const legacy = LEGACY_KEYS.reduce<Partial<WniosekFunnelState>>(
    (acc, k) => ({ ...acc, ...safeParse(sessionStorage.getItem(k)) }),
    {},
  );
  return { ...legacy, ...safeParse(sessionStorage.getItem(KEY)) };
}

/** Dopisz/nadpisz część stanu (read-merge-write). Pola `undefined` są pomijane. */
export function mergeFunnelState(patch: Partial<WniosekFunnelState>): void {
  if (typeof window === "undefined") return;
  const cleaned = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const next = { ...readFunnelState(), ...cleaned };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

/** Wyczyść stan kreatora (po skonsumowaniu w formularzu) — łącznie z kluczami legacy. */
export function clearFunnelState(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
    LEGACY_KEYS.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* noop */
  }
}

/** Przechwyć parametry kalkulatora z URL-a (amount/months/secType…) do stanu kreatora. */
export function captureFunnelParamsFromUrl(): void {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams(window.location.search);
  if (!sp.get("amount") && !sp.get("secType")) return;
  mergeFunnelState({
    amount: sp.get("amount") ? Number(sp.get("amount")) : undefined,
    annualRate: sp.get("annualRate") ? Number(sp.get("annualRate")) : undefined,
    months: sp.get("months") ? Number(sp.get("months")) : undefined,
    maxPayment: sp.get("maxPayment") ? Number(sp.get("maxPayment")) : undefined,
    secType: sp.get("secType") || undefined,
    source: sp.get("source") || "embed",
  });
}
