// Głos torów w ROLKACH (scenariusz, hook, tytuł) — zasady dla scenarzysty
// i planera. Czysty moduł – bez I/O.
//
// Tor pożyczkobiorcy (decyzja właściciela 21.10.2026): w samych rolkach NIE
// akcentujemy, że oferta jest tylko dla firm. Mówimy po prostu o pożyczkach
// pod zastaw nieruchomości; warunki (w tym działalność gospodarcza) klient
// poznaje przy wniosku. Słowa „firma”, „przedsiębiorca”, „działalność” —
// najwyżej raz i tylko, gdy temat tego wymaga. Bez zmian zostają: reguła
// compliance „konsument” (bez „na dowolny cel”, „na wakacje”, „dla osób
// prywatnych”…) i linia o celu gospodarczym w stopce OPISU publikacji.
import type { Track } from "./types";

/** Słowa akcentujące B2B w torze pożyczkobiorcy (odmiany). */
const B2B_WORD_RE =
  /(?<![\p{L}\p{N}])(?:firm\p{L}*|przedsiębior\p{L}*|działalnoś\p{L}*|biznes\p{L}*|b2b)(?![\p{L}\p{N}])/giu;

export const BORROWER_MAX_B2B_MENTIONS = 1;

export function b2bMentions(text: string): string[] {
  return [...text.matchAll(B2B_WORD_RE)].map((m) => m[0]);
}

/** Czy scenariusz/hook toru pożyczkobiorcy za mocno akcentuje „tylko dla firm”. */
export function overstressesB2b(text: string): boolean {
  return b2bMentions(text).length > BORROWER_MAX_B2B_MENTIONS;
}

export const TRACK_SCRIPT_RULES: Record<Track, string> = {
  pozyczkobiorca: `TOR: pożyczkobiorca — osoba, która potrzebuje szybkiego finansowania pod zastaw nieruchomości (często po odmowie banku).
- Mów po prostu o pożyczkach pod zastaw nieruchomości. NIE akcentuj, że oferta jest tylko dla firm: słowa „firma”, „przedsiębiorca”, „działalność” (i odmiany) najwyżej RAZ w całym tekście i tylko, gdy temat tego wymaga — najlepiej wcale. Warunki (w tym działalność gospodarcza) klient poznaje przy wniosku.
- Nie kieruj do konsumentów: nigdy „na dowolny cel”, „na wakacje”, „na wesele”, „na samochód”, „dla osób prywatnych”, „kredyt konsumencki”.
- Bez obietnic („dla każdego”, „bez BIK”, „bez sprawdzania”, „100% decyzji”), bez presji czasu, bez kosztu/oprocentowania jako hasła.
- Widz jest bohaterem; pokazujemy, co może zrobić. Rolka sprzedażowa: fakty i korzyść, bez zdań o ryzyku i koszcie („droższe niż bank”, „ryzyko utraty nieruchomości”) — widz to wie, nie myślimy za niego.`,
  inwestor: `TOR: inwestor prywatny — szanse, nie straszenie; „zarabiaj tak, jak banki od stuleci”, zarabianie na nieruchomościach bez kupowania i remontowania.
- Przedstawiaj fakty i mechanizm, bez oceniania ryzyka: ŻADNYCH zdań o ryzyku, możliwej stracie kapitału ani formułek („nie stanowi oferty”, „zwrot nie jest gwarantowany”) — inwestor wie, że może stracić. Bez stóp zwrotu, gwarancji, odkupu, „sam inwestuję” i zamkniętych grup.`,
};

/** Przykłady hooków toru (dla planera) — bez akcentu „dla firm”. */
export const TRACK_HOOK_EXAMPLES: Record<Track, string[]> = {
  pozyczkobiorca: [
    "Bank powiedział nie? Twoja nieruchomość może powiedzieć tak.",
    "Ile naprawdę dostaniesz pod nieruchomość wartą milion?",
    "Ten jeden dokument wydłuża finansowanie o tygodnie.",
  ],
  inwestor: [
    "Wiesz, na czym bank zarabia najwięcej?",
    "Bank vs Ty: kto lepiej ocenia zabezpieczenie?",
  ],
};
