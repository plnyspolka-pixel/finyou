// Nazwa firmy w napisach rolek — zawsze „Finance You" / „financeyou.pl".
//
// Plik SRT z HeyGena powstaje z rozpoznawania mowy polskiego lektora, a ten
// czyta „Finance You" po angielsku. Rozpoznawanie potrafi to zapisać jako
// „fajnasiu", „fajnans ju", „finans ju", „finansu.pl", „Finanse.eu.pl",
// „finansuj.pl", „financYou", samo „Finance." itp. — i taki napis szedł
// prosto do wypalenia na rolce. Tu, przed wypaleniem, zamieniamy każdą taką
// wersję na poprawną nazwę, a z końcówką „.pl" / „kropka pl" — na adres
// financeyou.pl.
//
// Formy z prawdziwych plików SRT (do testów): fajnasiu, fajnasiu.pl,
// FinanceYou, FinanceYou.pl, financYou.pl, finansyou.pl, finansu.pl,
// Finanse.eu.pl, finansuj.pl, „Finance" | „You." (rozcięte na dwie kwestie),
// „Finance." (samo, drugi człon zlepił się z następnym słowem).
//
// Czysta logika (bez I/O), testowana w caption-brand.test.ts.

import type { SrtCue } from "./caption-style";

export const BRAND_NAME = "Finance You";
export const BRAND_DOMAIN = "financeyou.pl";

// Pierwszy człon: „finance" w zapisie fonetycznym — fajnans, fajnens, finans,
// fajna, fajnan… Drugi: „you" — ju, you, siu, sju, śju, cju… Ze zlepieniem
// „fajnasiu" dzieli się to naturalnie na „fajna" + „siu".
const FIRST = String.raw`f(?:aj|ej|a|i|y)n(?:a|e|ą|ę)n?(?:[sśzcč]{0,2}e?)`;
const SECOND = String.raw`(?:ju|jó|jou|you|yu|iu|siu|sju|śju|sziu|cju|ciu|czju|dżu|dziu)`;
const SEP = String.raw`[\s\-–]*`;
// Drugi człon zredukowany do samej samogłoski, zlepiony z pierwszym (czasem
// przez kropkę): „finansu", „finanseu", „Finanse.eu". Bez odstępu — „finanse
// u nas" to zwykłe polskie słowa.
const SECOND_GLUED = String.raw`\.?(?:u|eu|ue)`;
// „.pl", „ pl", „kropka pl", „kropka pe el".
const DOMAIN_TAIL = String.raw`(?:\s*\.\s*|\s+kropka\s+|\s+)(?:pl|pe\s*el)(?![\p{L}\p{N}])`;
// Jak wyżej, ale tylko z wyraźną kropką / „kropka" — dla luźniejszego dopasowania.
const DOMAIN_TAIL_STRICT = String.raw`(?:\s*\.\s*|\s+kropka\s+)(?:pl|pe\s*el)(?![\p{L}\p{N}])`;
const WWW = String.raw`(?:w{3}\s*\.\s*)?`;
const LB = String.raw`(?<![\p{L}\p{N}])`;
const RB = String.raw`(?![\p{L}\p{N}])`;

// Jedno przejście, cztery warianty (kolejność ma znaczenie — pierwszy pasujący
// wygrywa). Z końcówką domeny → adres, bez niej → nazwa. (Dwa osobne
// przejścia psułyby już poprawiony adres: „financeyou" w „financeyou.pl"
// to też nazwa firmy.)
//   1. pełna nazwa: pierwszy człon + drugi człon (+ domena);
//   2. drugi człon zlepiony samogłoską: „finansu", „Finanse.eu" (+ domena);
//   3. adres strony z dowolnie przekręconym rdzeniem: wszystko, co zaczyna
//      się od „fin…"/„fajn…" i kończy wyraźnym „.pl" / „kropka pl" („finansuj.pl",
//      „finanse u.pl") — w rolce Finance You inny taki adres nie pada;
//   4. samo „finance" w angielskiej pisowni — po polsku to tylko nazwa firmy
//      (drugi człon zlepił się z następnym słowem albo przepadł).
const BRAND_RE = new RegExp(
  `${LB}(?:` +
    `${WWW}${FIRST}${SEP}${SECOND}(${DOMAIN_TAIL})?` +
    `|${FIRST}${SECOND_GLUED}(${DOMAIN_TAIL})?` +
    `|${WWW}f(?:aj|ej|a|i|y)n\\p{L}{0,8}(?:[.\\s\\-]{0,2}\\p{L}{1,4})?(${DOMAIN_TAIL_STRICT})` +
    `|finance` +
    `)${RB}`,
  "giu",
);
// Ogon kwestii / początek następnej — gdy nazwa rozjechała się na dwie kwestie
// („… z Finance." | „You."). Interpunkcja po pierwszym członie nie przeszkadza.
const FIRST_AT_END_RE = new RegExp(`${LB}${FIRST}[.,;:!?…]*\\s*$`, "iu");
const SECOND_AT_START_RE = new RegExp(`^\\s*${SECOND}(${DOMAIN_TAIL})?${RB}\\s*`, "iu");

/** Poprawia nazwę firmy i adres strony w jednym tekście napisu. */
export function fixBrandInText(text: string): string {
  return text.replace(BRAND_RE, (_m, d1?: string, d2?: string, d3?: string) =>
    d1 || d2 || d3 ? BRAND_DOMAIN : BRAND_NAME,
  );
}

/**
 * Poprawia nazwę firmy we wszystkich kwestiach — także wtedy, gdy
 * rozpoznawanie mowy rozcięło ją między dwie kwestie („… fajna" | „siu …").
 * Kwestia, która po sklejeniu zostaje pusta, wypada.
 */
export function fixBrandInCues(cues: SrtCue[]): SrtCue[] {
  const out = cues.map((c) => ({ ...c }));
  for (let i = 0; i + 1 < out.length; i++) {
    const head = FIRST_AT_END_RE.exec(out[i].text);
    if (!head) continue;
    const tail = SECOND_AT_START_RE.exec(out[i + 1].text);
    if (!tail) continue;
    const joined = tail[1] ? BRAND_DOMAIN : BRAND_NAME;
    const rest = out[i + 1].text.slice(tail[0].length);
    // Interpunkcja zaraz po nazwie zostaje przy niej, a nie na początku kolejnej kwestii.
    const punct = /^[.,!?:;…]+/.exec(rest)?.[0] ?? "";
    out[i].text = `${out[i].text.slice(0, head.index)}${joined}${punct}`.trim();
    out[i + 1].text = rest.slice(punct.length).trim();
  }
  return out.map((c) => ({ ...c, text: fixBrandInText(c.text) })).filter((c) => c.text.length > 0);
}
