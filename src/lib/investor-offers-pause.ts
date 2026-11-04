// Wyłącznik: CHWILOWO wstrzymane pokazywanie ofert inwestorom ZEWNĘTRZNYM
// i ich rezerwacje (decyzja właściciela, 2026-11-04). Finance You jako inwestor
// działa bez zmian (investor-offers-pause.server.ts). Dotyczy wszystkich kanałów, którymi
// Projekt/oferta trafia do inwestora: Projekty w Zleceniach (lista, raport,
// rezerwacja, oferta, Ujawnienie, przedłużenia), automatyczne dopasowania,
// dystrybucja ofert e-mailem (ręczna, automatyczna, pośrednika), publiczna
// Karta oferty z linku i zajawki.
//
// Bez zmian: zespół (panel, analizy, pełny raport z mapą), własne analizy
// inwestora (Analityka, KW spoza Finance You) oraz Dopasowania już ujawnione
// przed wstrzymaniem (umowy w toku, kontakt do klienta).
//
// Wznowienie: ustaw INVESTOR_OFFERS_PAUSED na false.
export const INVESTOR_OFFERS_PAUSED = true;

export const INVESTOR_OFFERS_PAUSED_MESSAGE =
  "Pokazywanie ofert inwestorom zewnętrznym jest chwilowo wstrzymane.";

/** Rezerwacje (Karta Leada, Ujawnienie, wyłączność 24 h) usunięte z systemu. */
export const RESERVATIONS_REMOVED_MESSAGE =
  "Rezerwacje zostały usunięte — dane kontaktowe klienta są dostępne w karcie Projektu bez rezerwacji.";

export function assertInvestorOffersOpen(): void {
  if (INVESTOR_OFFERS_PAUSED) throw new Error(INVESTOR_OFFERS_PAUSED_MESSAGE);
}
