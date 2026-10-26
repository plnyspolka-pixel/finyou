// Zastrzeżenia w scenariuszu rolki (decyzja właściciela 26.10.2026): tekst
// mówiony ma DOKŁADNIE jedno zdanie o ryzyku. Pozostałe ostrzeżenia i formułki
// („nie stanowi oferty/porady”, „zwrot nie jest gwarantowany”, „wynik
// szacunkowy”, „materiał poglądowy”, drugie zdanie o utracie kapitału…) należą
// do stopki opisu publikacji i do samego materiału — nie do rolki, w której
// lektor zamiast edukować ostrzegał widza co drugie zdanie.
//
// Moduł liczy zdania-zastrzeżenia (próg dla scenarzysty, bramki i produkcji)
// i sprawdza wynik „odchudzenia” przez AI (acceptCondensedScript): zastrzeżeń
// ma ubyć, jedno ma zostać, hasło CTA i długość mają się zgadzać, a reguły
// twarde nie mogą zgłosić nowych blokad. Czysty moduł – bez I/O.
import { checkHardRules, type RuleContext } from "./compliance-rules";

/** Ile zdań o ryzyku / zastrzeżeń może mieć scenariusz rolki. */
export const MAX_WARNING_SENTENCES_PER_REEL = 1;

/** Markery zdania-zastrzeżenia: ryzyko, brak gwarancji, formułki prawne, „szacunkowy”. */
const WARNING_RE = new RegExp(
  [
    "ryzyk\\p{L}*",
    "nie\\s+gwarantuj\\p{L}*",
    "nie\\s+(?:jest|są|ma)\\s+(?:\\p{L}+\\s+)?gwarantowan\\p{L}*",
    "(?:bez|brak|nie\\s+ma)\\s+gwarancji",
    "nie\\s+stanowi\\s+(?:oferty|porady|rekomendacji|doradztwa)",
    "nie\\s+(?:jest|są|stanowi)\\s+(?:to\\s+)?porad\\p{L}*",
    "niebędąc\\p{L}*\\s+porad\\p{L}*",
    "nie\\s+zastępuj\\p{L}*\\s+(?:\\p{L}+\\s+){0,2}(?:analizy|porady|doradztwa|konsultacji)",
    "utrat\\p{L}*\\s+(?:części|całości)",
    "charakter\\s+(?:poglądow|informacyjn|orientacyjn|szacunkow|edukacyjn)\\p{L}*",
    "(?:wyłącznie|czysto)\\s+(?:poglądow|informacyjn|orientacyjn)\\p{L}*",
    "(?:wynik|kwota|kalkulacj|wyliczeni|dane|liczby)\\p{L}*\\s+(?:jest\\s+|są\\s+|to\\s+)?(?:szacunkow|orientacyjn)\\p{L}*",
    "decyzj\\p{L}*\\s+(?:zależy|należy)\\s+(?:od|do)\\s+(?:oceny|weryfikacji|finansując|indywidualn|inwestora|decyzji)\\p{L}*",
    // „Finansowanie / kwota zależy od pozytywnej weryfikacji / oceny wniosku”.
    "zależ\\p{L}*\\s+od\\s+(?:pozytywn\\p{L}*\\s+)?(?:oceny|weryfikacji|decyzji)",
    // Koszt jako ostrzeżenie: „wiąże się z wyższym kosztem”, „bywa droższe”.
    "(?:wyższ|większ)\\p{L}*\\s+koszt\\p{L}*",
    "koszt\\p{L}*\\s+(?:\\p{L}+\\s+){0,3}(?:jest|są|bywa|będzie)\\s+wyższ\\p{L}*",
    "drożs\\p{L}*|droższ\\p{L}*",
    "(?:możesz|można|mogą|może)\\s+(?:\\p{L}+\\s+)?stracić",
  ].join("|"),
  "iu",
);

/** Brak spłaty + skutek („przy braku spłaty… egzekucja / utrata / zaspokojenie”). */
const NON_REPAYMENT_RE =
  /(?:niespłac\p{L}*|nie\s+spłac\p{L}*|nie\s+uda\s+się\s+spłacić|brak\p{L}*\s+(?:terminowej\s+)?spłaty)/iu;
const CONSEQUENCE_RE = /(?:utrat\p{L}*|egzekucj\p{L}*|zaspokoj\p{L}*|strac\p{L}*|ryzyk\p{L}*)/iu;

/** Tytuły materiałów w cudzysłowie („…(szanse i ryzyka)”) to nazwy, nie zastrzeżenia. */
function withoutQuotedTitles(sentence: string): string {
  return sentence.replace(/„[^”]*”/gu, " ").replace(/"[^"]*"/gu, " ");
}

function isWarningSentence(sentence: string): boolean {
  const s = withoutQuotedTitles(sentence);
  return WARNING_RE.test(s) || (NON_REPAYMENT_RE.test(s) && CONSEQUENCE_RE.test(s));
}

const RISK_WORD_RE = /ryzyk/iu;

/** Podział na zdania: koniec zdania + wielka litera (nie tnie „750 tys. zł”). */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+(?=[„"(]?\p{Lu})/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Zdania scenariusza, które są ostrzeżeniem / zastrzeżeniem. */
export function warningSentences(text: string): string[] {
  return splitSentences(text).filter(isWarningSentence);
}

export function countWarnings(text: string): number {
  return warningSentences(text).length;
}

/** Czy scenariusz ma więcej zastrzeżeń niż jedno dozwolone zdanie o ryzyku. */
export function overWarns(text: string): boolean {
  return countWarnings(text) > MAX_WARNING_SENTENCES_PER_REEL;
}

/** Hasło CTA („Skomentuj START”) — ma przetrwać odchudzanie. */
export function scriptKeyword(text: string): string | null {
  const m = text.match(
    /(?:[Ss]komentuj|[Nn]apisz(?:\s+w\s+komentarzu)?|[Ww]pisz)\s+[„"]?([A-ZĄĆĘŁŃÓŚŹŻ]{3,12})(?![\p{L}])/u,
  );
  return m?.[1] ?? null;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Czy odchudzona wersja scenariusza nadaje się do użycia zamiast oryginału.
 * Odrzucenie = zostaje oryginał (z nadmiarem zastrzeżeń, ale bez utraty treści).
 */
export function acceptCondensedScript(
  original: string,
  candidate: string,
  ctx: RuleContext,
): { ok: boolean; reason: string } {
  const out = candidate.trim();
  if (!out) return { ok: false, reason: "pusty tekst" };
  const before = countWarnings(original);
  const after = countWarnings(out);
  if (after >= before) return { ok: false, reason: `zastrzeżeń nie ubyło (${before} → ${after})` };
  if (after < 1) return { ok: false, reason: "zniknęło zdanie o ryzyku" };
  if (RISK_WORD_RE.test(original) && !RISK_WORD_RE.test(out))
    return { ok: false, reason: "zniknęło słowo „ryzyko”" };
  const kw = scriptKeyword(original);
  if (kw && !out.includes(kw)) return { ok: false, reason: `brak hasła ${kw}` };
  const wb = wordCount(original);
  const wa = wordCount(out);
  if (wa < Math.ceil(wb * 0.6)) return { ok: false, reason: `za krótki (${wa}/${wb} słów)` };
  if (wa > wb + 5) return { ok: false, reason: `dłuższy niż oryginał (${wa}/${wb} słów)` };
  const known = new Set(
    checkHardRules(original, ctx)
      .filter((h) => h.severity === "block")
      .map((h) => h.code),
  );
  const fresh = checkHardRules(out, ctx).filter(
    (h) => h.severity === "block" && !known.has(h.code),
  );
  if (fresh.length)
    return { ok: false, reason: `nowe blokady: ${fresh.map((h) => h.code).join(", ")}` };
  return { ok: true, reason: `zastrzeżenia ${before} → ${after}` };
}
