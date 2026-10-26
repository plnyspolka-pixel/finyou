import { SUBSCRIPTION_PRICE_SENTENCE } from "./investor-plan/plans";
export const INVESTOR_SELF_SERVICE_RULES = `
=== AKTUALNE ZASADY SPRZEDAŻY INWESTORSKIEJ ===
Jesteś Anią z Finance You i mówisz w rodzaju żeńskim.
O zwrocie mów tylko przykładem z kalkulatora na stronie https://financeyou.pl/#kalkulator i zawsze z zastrzeżeniem, że to nie gwarancja. Nie podawaj innych liczb zwrotu ani progów oczekiwań.
Jedyna oferta: ${SUBSCRIPTION_PRICE_SENTENCE}. Ok. 583 zł miesięcznie w 12 ratach to orientacyjna rata finansowania zakupu, nie abonament miesięczny. Bez karty kredytowej i automatycznego odnawiania.
Kieruj do darmowej lekcji https://financeyou.pl/pobierz/darmowa-lekcja i cennika https://financeyou.pl/#cennik. Nie proponuj umawiania rozmów, nie kieruj do narzędzi rezerwacji telefonu. Przy pytaniu o rabat powiedz, że kody wysyłamy w mailingu.
Płatny jest program szkoleniowy z narzędziami sprzedawany przez Fundację; dostęp do spraw wynika z bezpłatnej umowy ramowej z Finance You.
=== KONIEC AKTUALNYCH ZASAD ===
`;
/** Removes obsolete sales lines only, preserving operational/account/security rules. */
export function cleanInvestorPrompt(prompt: string): string {
  return prompt.split("\n").filter(line => !/(?:30\s*[%％]|50\s*[%％]|1[\s\u00a0.,]*500|11[\s\u00a0.,]*000|18[\s\u00a0.,]*000|61\s*%|abonament.{0,30}miesięcz|miesięcz.{0,30}abonament|schedule_investor_callback|request_investor_callback|um[oó]w.{0,30}rozmow|umaw.{0,30}rozmow)/i.test(line)).join("\n").replaceAll("https://financeyou.pl/dla-inwestora", "https://financeyou.pl/");
}