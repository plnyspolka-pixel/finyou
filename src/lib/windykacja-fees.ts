// Cennik opłat za czynności windykacyjne.
//
// Opłaty muszą mieć PODSTAWĘ UMOWNĄ: właściwy cennik to tabela opłat z umowy
// pożyczki (`wind_loans.oplaty_windykacyjne`, odczytywana z umowy przy
// zakładaniu sprawy i edytowalna). Poniższe kwoty są tylko domyślną
// podpowiedzią, gdy umowa nie określa opłaty za daną czynność.
// Naliczona opłata trafia do rejestru czynności windykacyjnych i jest
// doliczana do zadłużenia jako koszt (zaliczanie wpłat wg art. 451 k.c.:
// najpierw koszty, potem odsetki, kapitał).
export const WIND_FEE_DEFAULTS = {
  sms: 20,
  email: 20,
  telefon: 50,
  pismo: 100, // wezwanie / pismo wysłane listem poleconym (koszt + obsługa)
} as const;

export type WindFeeKind = keyof typeof WIND_FEE_DEFAULTS;

/**
 * Tabela opłat z umowy pożyczki (zł za czynność). Brak klucza lub null =
 * umowa nie określa opłaty za tę czynność (używamy domyślnej podpowiedzi).
 * `brak_oplat: true` = umowa NIE przewiduje żadnych opłat windykacyjnych —
 * wtedy nic nie naliczamy (0 zł), także zamiast podpowiedzi.
 */
export interface WindFeeTable {
  sms?: number | null;
  email?: number | null;
  telefon?: number | null;
  pismo?: number | null;
  brak_oplat?: boolean | null;
  /** Skąd tabela: odczyt AI z umowy, ręczna korekta, brak. */
  zrodlo?: "umowa" | "recznie" | null;
}

export const WIND_FEE_LABELS: Record<WindFeeKind, string> = {
  sms: "SMS windykacyjny",
  email: "E-mail windykacyjny",
  telefon: "Telefon windykacyjny (agent AI / rozmowa)",
  pismo: "Wezwanie / pismo listem poleconym",
};

function feeNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/** Normalizuje dowolny JSON (z bazy, OCR lub formularza) do WindFeeTable. */
export function normalizeWindFeeTable(v: unknown): WindFeeTable | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const t: WindFeeTable = {
    sms: feeNumber(o.sms),
    email: feeNumber(o.email),
    telefon: feeNumber(o.telefon),
    pismo: feeNumber(o.pismo),
    brak_oplat: o.brak_oplat === true,
    zrodlo: o.zrodlo === "umowa" || o.zrodlo === "recznie" ? o.zrodlo : null,
  };
  const anyValue = t.brak_oplat || [t.sms, t.email, t.telefon, t.pismo].some((x) => x != null);
  return anyValue ? t : null;
}

/**
 * Opłata za czynność ZGODNIE Z UMOWĄ: kwota z tabeli umowy, a gdy umowa jej
 * nie określa — domyślna podpowiedź. Umowa bez opłat windykacyjnych → 0.
 */
export function windFeeForAction(
  table: WindFeeTable | null | undefined,
  kind: WindFeeKind,
): { fee: number; source: "umowa" | "domyslna" | "brak" } {
  if (table?.brak_oplat) return { fee: 0, source: "brak" };
  const v = table?.[kind];
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return { fee: v, source: "umowa" };
  return { fee: WIND_FEE_DEFAULTS[kind], source: "domyslna" };
}

/** Typy zdarzeń traktowane jako czynności windykacyjne w rejestrze. */
export const WIND_ACTION_EVENT_TYPES = [
  "sms",
  "email",
  "telefon",
  "pismo_nadane",
  "dokument_wygenerowany",
  "czynnosc_sadowa",
] as const;
