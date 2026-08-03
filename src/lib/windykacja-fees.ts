// Cennik opłat za czynności windykacyjne (domyślne podpowiedzi).
// Kwoty są edytowalne przy każdej czynności — inwestor nalicza je zgodnie
// z umową pożyczki (opłaty muszą mieć podstawę umowną). Naliczona opłata
// trafia do rejestru czynności i jest doliczana do zadłużenia jako koszt
// (zaliczanie wpłat wg art. 451 k.c.: najpierw koszty, potem odsetki, kapitał).
export const WIND_FEE_DEFAULTS = {
  sms: 20,
  email: 20,
  telefon: 50,
  pismo: 100, // wezwanie / pismo wysłane listem poleconym (koszt + obsługa)
} as const;

export type WindFeeKind = keyof typeof WIND_FEE_DEFAULTS;

/** Typy zdarzeń traktowane jako czynności windykacyjne w rejestrze. */
export const WIND_ACTION_EVENT_TYPES = [
  "sms",
  "email",
  "telefon",
  "pismo_nadane",
  "dokument_wygenerowany",
  "czynnosc_sadowa",
] as const;
