// REGUŁY TWARDE compliance (brief 5.7 p.1–2) – deterministyczne,
// wersjonowane w repo. Agent ich nie zmienia: zmiana = commit + nowa
// COMPLIANCE_RULES_VERSION (zapisywana przy każdej decyzji bramki).
//
//   • block   – treść nie może wyjść; bramka wymusza przepisanie,
//   • require – brak elementu obowiązkowego; bramka dokleja go sama
//               (oznaczenie AI, linia ryzyka, identyfikacja nadawcy).
//
// To NIE jest porada prawna – to zakodowany zestaw zasad z briefu właściciela.
// Przegląd prawny (brief p. 8.5) może je tylko zaostrzyć.
// Czysty moduł – bez I/O.
import { COMPANY_DATA } from "@/lib/company";
import type { ContentKind, PublishPlatform, Track } from "./types";

export const COMPLIANCE_RULES_VERSION = "2026-10-19.1";

export type RuleSeverity = "block" | "require";

export interface RuleHit {
  code: string;
  severity: RuleSeverity;
  message: string;
  match?: string;
}

export interface RuleContext {
  kind: ContentKind;
  track?: Track | null;
  platform?: PublishPlatform | null;
}

// Granica słowa dla polskich liter (\b nie działa z „ą”, „ż”…).
const NL = "(?<![\\p{L}\\p{N}])";
const re = (src: string) => new RegExp(`${NL}(?:${src})`, "giu");

/** Zaprzeczenie tuż przed dopasowaniem („nie gwarantujemy”, „brak gwarancji”). */
function negatedBefore(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 28), index).toLowerCase();
  return /(?:^|[^\p{L}])(?:nie|brak|bez|żadn\p{L}*|nikt|nigdy)(?:[^\p{L}]+\p{L}+){0,2}[^\p{L}]*$/u.test(
    before,
  );
}

interface PatternRule {
  code: string;
  re: RegExp;
  message: string;
  /** Pomiń trafienie poprzedzone zaprzeczeniem. */
  allowNegated?: boolean;
  tracks?: Track[];
  kinds?: ContentKind[];
  /** Trafienie neutralizowane przez obecność tego wzorca w całym tekście. */
  unlessText?: RegExp;
}

const VIDEO_KINDS: ContentKind[] = ["script", "title", "description"];

const PATTERNS: PatternRule[] = [
  // ── wspólne ────────────────────────────────────────────────────────────────
  {
    code: "gwarancja",
    re: re("gwarant\\p{L}*|gwarancj\\p{L}*"),
    message: "Nie używamy słów „gwarancja/gwarantowany” – nie gwarantujemy zysku ani finansowania.",
    allowNegated: true,
  },
  {
    code: "bez_ryzyka",
    re: re("bez\\s+(?:żadnego\\s+)?ryzyk\\p{L}*|zero\\s+ryzyk\\p{L}*|wolne\\s+od\\s+ryzyk\\p{L}*"),
    message: "„Bez ryzyka” to nieprawda – każde finansowanie i inwestycja niesie ryzyko.",
  },
  {
    code: "pewny_zysk",
    re: re(
      "(?:pewn|bezpieczn|stabiln|stał|regularn)\\p{L}*\\s+(?:zysk|zwrot|zarob|dochod|dochód)\\p{L}*",
    ),
    message: "Zysk nie jest pewny ani stały – nie obiecujemy wyniku.",
    allowNegated: true,
  },
  {
    code: "minimalne_ryzyko",
    re: re("minimaln\\p{L}*\\s+ryzyk\\p{L}*|niski\\p{L}*\\s+ryzyk\\p{L}*\\s+wysok"),
    message: "Nie bagatelizujemy ryzyka („minimalne ryzyko”).",
  },
  {
    code: "podwojenie",
    re: re("podwoi\\p{L}*|podwój\\p{L}*|podwaja\\p{L}*|pomnóż\\p{L}*\\s+(?:kapitał|pieniądze)"),
    message: "Obietnica „podwojenia” pieniędzy jest niedozwolona.",
  },
  {
    code: "superlatyw",
    re: re(
      "najlepsz\\p{L}*|najtańsz\\p{L}*|najszybsz\\p{L}*|najbezpieczniejsz\\p{L}*|najkorzystniejsz\\p{L}*|nr\\s*1|numer\\s+jeden|lider\\p{L}*\\s+rynku|jedyn\\p{L}*\\s+na\\s+rynku",
    ),
    message: "Superlatyw bez pokrycia w danych.",
  },
  {
    code: "zamknieta_grupa",
    re: re(
      "zamknięt\\p{L}*\\s+(?:grup|klub|społeczność|krąg)\\p{L}*|ekskluzywn\\p{L}*\\s+(?:grup|klub)\\p{L}*|grup\\p{L}*\\s+vip|klub\\p{L}*\\s+inwestor\\p{L}*",
    ),
    message: "Zaproszenia do zamkniętych grup/klubów to sygnał ostrzegawczy KNF/ESMA.",
  },
  {
    code: "instytucja_jako_rekomendacja",
    re: re(
      "(?:rekomendowan|polecan|zatwierdzon|autoryzowan|nadzorowan|licencjonowan)\\p{L}*\\s+(?:przez\\s+)?(?:knf|nbp|bank\\p{L}*|uokik)|(?:knf|nbp|uokik)\\s+(?:poleca|rekomenduje|zatwierdził\\p{L}*)",
    ),
    message: "Nie przedstawiamy instytucji (KNF, NBP, banki) jako rekomendujących naszą ofertę.",
  },
  {
    code: "cena_w_wideo",
    re: re(
      "(?:cen\\p{L}*|kosztuje|abonament\\p{L}*|pakiet\\p{L}*|opłat\\p{L}*|za\\s+jedyne)[^.!?\\n]{0,30}?\\d[\\d\\s.,]*\\s?(?:zł|pln|złotych)",
    ),
    message: "W wideo nie podajemy cen (cennik obowiązuje wyłącznie na stronie).",
    kinds: VIDEO_KINDS,
  },
  // ── tor pożyczkobiorcy ─────────────────────────────────────────────────────
  {
    code: "konsument",
    re: re(
      "na\\s+dowolny\\s+cel|na\\s+cele\\s+(?:konsumpcyjn|prywatn)\\p{L}*|na\\s+(?:wakacje|wesele|samochód|auto|święta)|dla\\s+osób\\s+prywatnych|kredyt\\p{L}*\\s+konsumenck\\p{L}*",
    ),
    message: "Finansowanie wyłącznie na cel gospodarczy (B2B) – bez kierowania do konsumentów.",
    tracks: ["pozyczkobiorca"],
  },
  {
    code: "dla_kazdego",
    re: re("dla\\s+każdego|każdy\\s+(?:dostanie|otrzyma)|każda\\s+firma\\s+(?:dostanie|otrzyma)"),
    message: "„Dla każdego” – decyzja zależy od finansujących i zabezpieczenia.",
    tracks: ["pozyczkobiorca"],
  },
  {
    code: "bez_weryfikacji",
    re: re(
      "bez\\s+(?:sprawdzania|weryfikacji|bik\\p{L}*|big\\p{L}*|zdolności|formalności|zaświadczeń)|100\\s?%\\s+(?:decyzji\\s+)?pozytywn\\p{L}*|(?:decyzj\\p{L}*|akceptacj\\p{L}*)\\s+(?:dla\\s+)?100\\s?%",
    ),
    message: "Nie obiecujemy finansowania bez weryfikacji, BIK ani zdolności.",
    tracks: ["pozyczkobiorca"],
  },
  {
    code: "presja_czasu",
    re: re(
      "ostatni\\p{L}*\\s+szans\\p{L}*|tylko\\s+(?:dziś|dzisiaj|teraz)|oferta\\s+ważna\\s+do|zostało\\s+(?:tylko\\s+)?\\d+\\s+(?:miejsc|dni|godzin)|nie\\s+czekaj\\p{L}*,?\\s+(?:aż|bo)",
    ),
    message: "Bez presji czasu wobec osób w trudnej sytuacji.",
    tracks: ["pozyczkobiorca"],
  },
  {
    code: "koszt_jako_haslo",
    re: re(
      "(?:oprocentowani\\p{L}*|rrso|koszt\\p{L}*|prowizj\\p{L}*)\\s+(?:już\\s+)?od\\s+\\d[\\d.,]*\\s?%",
    ),
    message: "Koszt/oprocentowanie nie jest hasłem reklamowym.",
    tracks: ["pozyczkobiorca"],
  },
  // ── tor inwestora ──────────────────────────────────────────────────────────
  {
    code: "gwarancja_odkupu",
    re: re("odkup\\p{L}*\\s+(?:udział|pożycz|wierzytel)\\p{L}*|odkupimy|buy\\s?back"),
    message: "Gwarancja odkupu udziałów/pożyczek (przypadek Fast Invest) jest niedozwolona.",
    tracks: ["inwestor"],
    allowNegated: true,
  },
  {
    code: "drukarka_bez_ryzyka",
    re: re("drukark\\p{L}*\\s+do\\s+pieniędzy|maszynk\\p{L}*\\s+do\\s+(?:pieniędzy|zarabiania)"),
    message: "„Drukarka do pieniędzy” wymaga zdania równoważącego ryzyko.",
    tracks: ["inwestor"],
    unlessText: /ryzyk/iu,
  },
  {
    code: "sam_inwestuje",
    re: re(
      "(?:sam|ja)\\s+(?:też\\s+)?inwestuj\\p{L}*|inwestuj\\p{L}*\\s+(?:własne|swoje)\\s+pieniądze|moje\\s+pieniądze\\s+też",
    ),
    message: "„Sam też inwestuję” jako wabik – sygnał ostrzegawczy KNF/ESMA.",
    tracks: ["inwestor"],
  },
  {
    code: "inwestowanie_zabawa",
    re: re(
      "inwestowanie\\s+(?:to\\s+)?(?:zabaw|gr)\\p{L}*|łatwe\\s+pieniądze|szybk\\p{L}*\\s+(?:zysk|zarobek)",
    ),
    message: "Inwestowanie nie jest zabawą ani szybkim zarobkiem.",
    tracks: ["inwestor"],
  },
];

/** Procent jako obietnica zwrotu/zysku (nie: LTV, inflacja, stopy NBP ze źródłem). */
const PERCENT_RE = /\d+(?:[.,]\d+)?\s?%/gu;
const RETURN_WORDS =
  /(?:zwrot|zysk|zarob|zarabia|dochod|dochód|rentown|odset|oprocentowan|stop\p{L}*\s+zwrotu|rocznie|w\s+skali\s+roku|p\.a\.)/iu;
const MARKET_FACT_WORDS =
  /(?:nbp|inflacj|wibor|wiron|referencyjn|gus|lokat|obligacj|ltv|wskaźnik|bank\p{L}*\s+centraln)/iu;

function percentPromiseHits(text: string): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const m of text.matchAll(PERCENT_RE)) {
    const i = m.index ?? 0;
    const window = text.slice(Math.max(0, i - 45), i + m[0].length + 45);
    if (!RETURN_WORDS.test(window)) continue;
    if (MARKET_FACT_WORDS.test(window)) continue;
    hits.push({
      code: "procent_jako_obietnica",
      severity: "block",
      message: "Konkretny % zwrotu lub oprocentowania jako obietnica jest niedozwolony.",
      match: m[0],
    });
  }
  return hits;
}

/** Dane osobowe/identyfikujące klientów: PESEL, nr KW, cudze telefony i e-maile. */
const OUR_NUMBERS = [
  COMPANY_DATA.phone.e164,
  COMPANY_DATA.phoneContracts.e164,
  COMPANY_DATA.regon,
].map((p) => p.replace(/\D/g, "").slice(-9));
function personalDataHits(text: string): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const m of text.matchAll(/(?<!\d)\d{11}(?!\d)/gu)) {
    hits.push({ code: "pesel", severity: "block", message: "Numer PESEL w treści.", match: m[0] });
  }
  for (const m of text.matchAll(/\b[A-Z]{2}\d[A-Z]\/\d{8}\/\d\b/gu)) {
    hits.push({
      code: "numer_kw",
      severity: "block",
      message: "Numer księgi wieczystej klienta.",
      match: m[0],
    });
  }
  for (const m of text.matchAll(/(?<![\d])(?:\+?48[\s-]?)?(?:\d[\s-]?){9}(?![\d])/gu)) {
    const digits = m[0].replace(/\D/g, "").slice(-9);
    if (digits.length !== 9 || OUR_NUMBERS.includes(digits)) continue;
    hits.push({
      code: "telefon",
      severity: "block",
      message: "Cudzy numer telefonu w treści.",
      match: m[0].trim(),
    });
  }
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/gu)) {
    if (m[0].toLowerCase().endsWith("@financeyou.pl")) continue;
    hits.push({
      code: "email",
      severity: "block",
      message: "Cudzy adres e-mail w treści.",
      match: m[0],
    });
  }
  return hits;
}

/** Reguły blokujące dla tekstu. Kolejność: wg pozycji w PATTERNS. */
export function checkHardRules(text: string, ctx: RuleContext): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const rule of PATTERNS) {
    if (rule.tracks && (!ctx.track || !rule.tracks.includes(ctx.track))) continue;
    if (rule.kinds && !rule.kinds.includes(ctx.kind)) continue;
    if (rule.unlessText && rule.unlessText.test(text)) continue;
    for (const m of text.matchAll(rule.re)) {
      if (rule.allowNegated && negatedBefore(text, m.index ?? 0)) continue;
      hits.push({ code: rule.code, severity: "block", message: rule.message, match: m[0] });
      break; // jedna informacja na regułę wystarczy do przepisania
    }
  }
  hits.push(...percentPromiseHits(text));
  hits.push(...personalDataHits(text));
  // „To nie jest porada” jako JEDYNE zastrzeżenie (KNF/ESMA: nie chroni).
  if (/nie\s+(?:jest|stanowi)\s+porad/iu.test(text) && !/ryzyk/iu.test(text)) {
    hits.push({
      code: "jedyne_zastrzezenie_porada",
      severity: "require",
      message: "„To nie jest porada” nie wystarcza – potrzebna linia o ryzyku.",
    });
  }
  return hits;
}

// ── elementy obowiązkowe (brief 5.7 p.2) ─────────────────────────────────────

export const AI_DISCLOSURE_LINE = "Treść wygenerowana z użyciem AI (awatar i głos AI).";
export const SENDER_LINE = `${COMPANY_DATA.legalName}, KRS ${COMPANY_DATA.krs} · ok. 15 lat na rynku finansowania pozabankowego.`;
export const RISK_LINES: Record<Track, string> = {
  pozyczkobiorca:
    "Materiał edukacyjny dla przedsiębiorców (finansowanie wyłącznie na cel gospodarczy). Kalkulacje są orientacyjne, decyzję podejmują finansujący, a zabezpieczenie na nieruchomości oznacza ryzyko jej utraty przy braku spłaty.",
  inwestor:
    "Materiał edukacyjny – nie stanowi oferty ani rekomendacji inwestycyjnej. Inwestowanie wiąże się z ryzykiem, w tym utraty części lub całości kapitału; decyzja należy do inwestora.",
};

const AI_DISCLOSURE_RE =
  /(?:wygenerowan\p{L}*|przygotowan\p{L}*|stworzon\p{L}*)\s+(?:z\s+użyciem|przez|przy\s+pomocy)\s+(?:ai|sztucznej\s+inteligencji)|awatar\p{L}*\s+ai|treść\s+ai|#ai(?![\p{L}])/iu;
const SENDER_RE = new RegExp(`KRS\\s*${COMPANY_DATA.krs}`, "u");
const RISK_RE = /ryzyk/iu;

/** Rodzaje treści, które muszą nieść oznaczenie AI, nadawcę i linię ryzyka. */
const NEEDS_FULL_FOOTER: ContentKind[] = ["description", "lead_magnet", "landing", "email", "ad"];

export function checkRequiredElements(text: string, ctx: RuleContext): RuleHit[] {
  if (!NEEDS_FULL_FOOTER.includes(ctx.kind)) return [];
  const hits: RuleHit[] = [];
  if (!AI_DISCLOSURE_RE.test(text))
    hits.push({
      code: "brak_oznaczenia_ai",
      severity: "require",
      message: "Brak oznaczenia treści AI.",
    });
  if (!SENDER_RE.test(text))
    hits.push({
      code: "brak_nadawcy",
      severity: "require",
      message: "Brak identyfikacji nadawcy (Finance You, KRS).",
    });
  if (!RISK_RE.test(text))
    hits.push({ code: "brak_linii_ryzyka", severity: "require", message: "Brak linii o ryzyku." });
  return hits;
}

/**
 * Dokleja brakujące elementy obowiązkowe (stopka). Idempotentne – drugi
 * przebieg nic nie dodaje.
 */
export function applyRequiredElements(text: string, ctx: RuleContext): string {
  const missing = new Set(checkRequiredElements(text, ctx).map((h) => h.code));
  if (!missing.size) return text;
  const lines: string[] = [];
  if (missing.has("brak_linii_ryzyka")) lines.push(RISK_LINES[ctx.track ?? "pozyczkobiorca"]);
  if (missing.has("brak_nadawcy")) lines.push(SENDER_LINE);
  if (missing.has("brak_oznaczenia_ai")) lines.push(AI_DISCLOSURE_LINE);
  return `${text.trimEnd()}\n\n${lines.join("\n")}`;
}

/** Wszystkie reguły naraz. `ok` = brak blokad (braki „require” da się dokleić). */
export function evaluateCompliance(
  text: string,
  ctx: RuleContext,
): { ok: boolean; blocks: RuleHit[]; requires: RuleHit[] } {
  const all = [...checkHardRules(text, ctx), ...checkRequiredElements(text, ctx)];
  return {
    ok: !all.some((h) => h.severity === "block"),
    blocks: all.filter((h) => h.severity === "block"),
    requires: all.filter((h) => h.severity === "require"),
  };
}
