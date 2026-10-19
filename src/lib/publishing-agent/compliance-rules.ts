/**
 * Twarde reguły compliance agenta publikującego (brief 5.7 p. 1–2).
 *
 * Reguły są DETERMINISTYCZNE i WERSJONOWANE w repo — agent nie może ich
 * zmienić (zmiana = commit + nowa `COMPLIANCE_RULES_VERSION`). Każda treść,
 * która wychodzi na zewnątrz (scenariusz, napisy, tytuł, opis, odpowiedź na
 * komentarz, mail, lead magnet, strona, reklama, artykuł), przechodzi przez
 * `checkHardRules`; wynik razem z wersją reguł trafia do audytu.
 *
 * To nie jest porada prawna — zestaw do jednorazowego przeglądu prawnego
 * (brief 8 p. 5). Reguły działają od razu; przegląd może je zaostrzyć.
 */

export const COMPLIANCE_RULES_VERSION = "2026-10-19.1";

export type AudienceTrack = "pozyczkobiorca" | "inwestor";

export type ContentKind =
  | "video_script"
  | "caption"
  | "title"
  | "comment_reply"
  | "email"
  | "lead_magnet"
  | "page"
  | "ad"
  | "article";

/** Rodzaje treści, które lądują w wideo/rolce albo pod nią. */
const VIDEO_KINDS: ContentKind[] = ["video_script", "caption", "title", "ad"];

export interface ComplianceContext {
  kind: ContentKind;
  /** Tor odbiorcy; brak = reguły wspólne + obu torów (najostrzej). */
  track?: AudienceTrack | null;
  /** Treść wygenerowana / wypowiadana przez awatara AI. */
  aiGenerated?: boolean;
}

export interface ComplianceViolation {
  ruleId: string;
  /** Fragment tekstu, który złamał regułę. */
  match: string;
  message: string;
  /** Wskazówka dla autora (pętla naprawcza). */
  fix: string;
}

interface HardRule {
  id: string;
  scope: "common" | AudienceTrack;
  /** Ogranicza regułę do rodzajów treści; brak = wszystkie. */
  kinds?: ContentKind[];
  /** Tylko dla treści awatara AI. */
  aiOnly?: boolean;
  pattern: RegExp;
  /** Zaprzeczenie tuż przed dopasowaniem („nie gwarantujemy”) znosi regułę. */
  negatable?: boolean;
  /** Dodatkowy warunek na całym tekście (np. brak zdania o ryzyku). */
  when?: (text: string) => boolean;
  message: string;
  fix: string;
}

// Granice słów dla polskich liter (\b w JS rozumie tylko ASCII).
const L = "(?<![\\p{L}\\p{N}])";
const R = "(?![\\p{L}\\p{N}])";
const rx = (body: string) => new RegExp(`${L}(?:${body})`, "giu");

const RISK_RE = /ryzyk|egzekucj|utrat\p{L}*\s+(?:kapitał|nieruchomoś)|strat\p{L}*\s+kapitał/iu;
const hasRisk = (t: string) => RISK_RE.test(t);

const HARD_RULES: HardRule[] = [
  // ── wspólne ────────────────────────────────────────────────────────────
  {
    id: "guarantee",
    scope: "common",
    pattern: rx("gwarant\\p{L}*|gwarancj\\p{L}*"),
    negatable: true,
    message: "Słowo „gwarancja/gwarantowany” sugeruje pewny wynik.",
    fix: "Usuń gwarancję; opisz mechanizm zabezpieczenia i jego ograniczenia.",
  },
  {
    id: "no_risk",
    scope: "common",
    pattern: rx(`bez\\s+(?:żadnego\\s+)?ryzyk\\p{L}*${R}|zero\\s+ryzyk\\p{L}*`),
    negatable: true,
    message: "„Bez ryzyka” — każda pożyczka i inwestycja niesie ryzyko.",
    fix: "Napisz, jakie ryzyko istnieje i co je ogranicza.",
  },
  {
    id: "sure_profit",
    scope: "common",
    pattern: rx(
      "(?:pewn|bezpieczn|stabiln|stał)\\p{L}*\\s+(?:zysk|zwrot|dochod|dochód|zarob)\\p{L}*",
    ),
    negatable: true,
    message: "Obietnica pewnego / bezpiecznego / stabilnego zysku.",
    fix: "Zastąp opisem, od czego zależy wynik i co może pójść nie tak.",
  },
  {
    id: "minimal_risk",
    scope: "common",
    pattern: rx("(?:minimaln|znikom|zerow)\\p{L}*\\s+ryzyk\\p{L}*"),
    negatable: true,
    message: "„Minimalne ryzyko” bagatelizuje ryzyko.",
    fix: "Nazwij ryzyko wprost (np. długa egzekucja, spadek wartości).",
  },
  {
    id: "double_money",
    scope: "common",
    pattern: rx("podw[oó]j\\p{L}*|podwoi\\p{L}*|pomnóż\\p{L}*\\s+(?:pieniądz|kapitał|oszczędnoś)\\p{L}*"),
    negatable: true,
    message: "„Podwój / pomnóż pieniądze” — obietnica wyniku.",
    fix: "Usuń obietnicę wyniku; pokaż mechanizm.",
  },
  {
    id: "unbacked_superlative",
    scope: "common",
    pattern: rx(
      "(?:najlepsz|najbezpieczniejsz|najpewniejsz|najmądrzejsz|najskuteczniejsz|najwyższ|najbardziej\\s+opłacaln)\\p{L}*\\s+(?:sposób|sposob|inwestycj|zwrot|zysk|ofert|okazj|metod|lokat)\\p{L}*",
    ),
    message: "Superlatyw bez pokrycia (sygnał ostrzegawczy KNF).",
    fix: "Zamień na konkret: liczbę, porównanie z założeniami albo „rzadko omawiany sposób”.",
  },
  {
    id: "closed_group",
    scope: "common",
    kinds: VIDEO_KINDS,
    pattern: rx(
      "zamknię\\p{L}*\\s+(?:grup|klub|społeczno|krąg)\\p{L}*|klub\\p{L}*\\s+inwestor\\p{L}*|tylko\\s+dla\\s+wybranych|ekskluzywn\\p{L}*\\s+(?:grup|klub|dostęp)\\p{L}*",
    ),
    message: "Zaproszenie do zamkniętej grupy / klubu w treści wideo (sygnał KNF).",
    fix: "Zamiast klubu — edukacyjny lead magnet albo otwarty webinar.",
  },
  {
    id: "regulator_endorsement",
    scope: "common",
    pattern: rx(
      "(?:nadzorowan|zatwierdzon|rekomendowan|polecan|licencjonowan|autoryzowan)\\p{L}*\\s+(?:przez\\s+)?(?:knf|nbp|bfg|uokik|bank\\p{L}*)",
    ),
    negatable: true,
    message: "Instytucja (KNF/NBP/BFG/bank) przedstawiona jako rekomendacja.",
    fix: "Nie powołuj się na instytucje jako aprobatę oferty.",
  },
  {
    id: "not_advice_only",
    scope: "common",
    pattern: rx(
      "(?:to\\s+)?nie\\s+(?:jest|stanowi)\\s+(?:porad|rekomendacj|doradztw)\\p{L}*",
    ),
    when: (t) => !hasRisk(t),
    message: "„To nie jest porada” jako jedyne zastrzeżenie — nie chroni (ESMA/KNF).",
    fix: "Dodaj zdanie o konkretnym ryzyku; formułka sama nie wystarcza.",
  },
  {
    id: "price_in_video",
    scope: "common",
    kinds: VIDEO_KINDS,
    pattern: rx(
      "abonament\\p{L}*|pakiet\\p{L}*\\s+(?:pro|podstawow)\\p{L}*|cennik\\p{L}*|\\d[\\d\\s.,]*\\s?(?:zł|pln)\\s*(?:\\/|za|na)\\s*(?:mies|miesiąc|rok|30\\s+dni|365\\s+dni|pół\\s+roku|6\\s+mies)\\p{L}*|opłat\\p{L}*\\s+(?:za\\s+okazj|stał|abonament)\\p{L}*",
    ),
    message: "Cena / opłata naszego produktu w treści wideo (ceny tylko na stronie).",
    fix: "Usuń cenę; odeślij do strony z aktualnym cennikiem.",
  },
  {
    id: "personal_data",
    scope: "common",
    pattern: new RegExp(
      `${L}(?:\\d{11}|[A-Z]{2}\\d[A-Z]\\/\\d{8}\\/\\d|(?:PL)?\\d{2}(?:\\s?\\d{4}){6})${R}`,
      "gu",
    ),
    message: "Dane identyfikujące (PESEL, nr księgi wieczystej, nr rachunku).",
    fix: "Zanonimizuj — żadnych numerów identyfikujących klientów ani nieruchomości.",
  },
  // ── tor pożyczkobiorcy (B2B, wyłącznie cel gospodarczy) ────────────────
  {
    id: "consumer_targeting",
    scope: "pozyczkobiorca",
    pattern: rx(
      "na\\s+(?:dowolny|każdy|jakikolwiek)\\s+cel|cel\\p{L}*\\s+konsumpcyjn\\p{L}*|na\\s+(?:wakacje|wesele|ślub|zakupy|remont\\s+mieszkania|spłatę\\s+chwilówek)|dla\\s+(?:osób\\s+prywatnych|konsumentów|każdego)",
    ),
    negatable: true,
    message: "Kierowanie do konsumentów / cel inny niż gospodarczy (platforma B2B).",
    fix: "Mów do przedsiębiorców i o celu gospodarczym (firma, inwestycja, płynność).",
  },
  {
    id: "no_checks_promise",
    scope: "pozyczkobiorca",
    pattern: rx(
      "bez\\s+(?:sprawdzania|weryfikacji|bik|big|krd|zdolności)\\p{L}*|100\\s?%\\s+(?:decyzji\\s+)?pozytywn\\p{L}*|każdy\\s+dostanie|dla\\s+każdego",
    ),
    negatable: true,
    message: "Obietnica finansowania bez weryfikacji / „dla każdego”.",
    fix: "Opisz, co sprawdzamy i od czego zależy decyzja finansujących.",
  },
  {
    id: "time_pressure",
    scope: "pozyczkobiorca",
    pattern: rx(
      "tylko\\s+(?:dziś|dzisiaj|teraz|do\\s+(?:końca|jutra))|ostatni\\p{L}*\\s+szans\\p{L}*|oferta\\s+wygasa|nie\\s+czekaj|zostało\\s+tylko|działaj\\s+teraz|decyzj\\p{L}*\\s+w\\s+\\d+\\s*(?:min|godz|h)",
    ),
    message: "Presja czasu wobec osób w trudnej sytuacji finansowej.",
    fix: "Usuń pilność; daj spokojny następny krok (kalkulator, checklista).",
  },
  {
    id: "cost_as_slogan",
    scope: "pozyczkobiorca",
    pattern: rx(
      "(?:najniższ|nisk|tani|tania|tanie|atrakcyjn)\\p{L}*\\s+(?:oprocentowani|koszt|rat|prowizj)\\p{L}*|oprocentowani\\p{L}*\\s+(?:już\\s+)?od\\s+\\d",
    ),
    message: "Koszt / oprocentowanie jako hasło reklamowe.",
    fix: "Nie reklamuj kosztem; koszt zależy od transakcji i jest podawany w ofercie.",
  },
  // ── tor inwestora ─────────────────────────────────────────────────────
  {
    id: "buyback_guarantee",
    scope: "inwestor",
    pattern: rx("(?:gwarancj|obowiąz|obietnic)\\p{L}*\\s+(?:odkup|wykup)\\p{L}*|odkupimy\\s+(?:od\\s+ciebie|twoj)\\p{L}*"),
    message: "Gwarancja odkupu (precedens Fast Invest / KNF 2017).",
    fix: "Usuń; opisz realną ścieżkę wyjścia i jej ryzyko.",
  },
  {
    id: "money_printer",
    scope: "inwestor",
    pattern: rx("drukark\\p{L}*\\s+(?:do\\s+)?pieniędzy|maszynk\\p{L}*\\s+do\\s+(?:pieniędzy|zarabiania)"),
    negatable: true,
    when: (t) => !hasRisk(t),
    message: "„Drukarka pieniędzy” bez zdania równoważącego ryzyko.",
    fix: "Zostaw motyw jako pytanie i od razu je rozbrój: „Nie. I właśnie dlatego…” + ryzyko.",
  },
  {
    id: "insider_lure",
    scope: "inwestor",
    pattern: rx("(?:sam|ja|my)\\s+(?:też\\s+|również\\s+)?(?:w\\s+to\\s+)?inwestuj\\p{L}*"),
    negatable: true,
    message: "„Sam też inwestuję” jako wabik (sygnał KNF).",
    fix: "Zamiast tego ujawnij interes: „Finance You na tym zarabia, dlatego pokażę też minusy”.",
  },
];

/** Stopy zwrotu / oprocentowanie jako obietnica — reguła kontekstowa. */
const PERCENT_RE =
  /(?<![\p{L}\p{N}])(?:\d+(?:[.,]\d+)?\s?(?:%|proc\p{L}*)|kilkunast\p{L}*\s+proc\p{L}*|kilkudziesię\p{L}*\s+proc\p{L}*|dwucyfrow\p{L}*)/giu;
const RETURN_CONTEXT_RE =
  /zwrot|rentown|zysk|zarabia|zarobi|oprocentow|rocznie|w\s+skali\s+roku|stop\p{L}*\s+(?:zwrotu|procent)|dochod|dochód|wynik|p\.a\./iu;
const PERCENT_SAFE_CONTEXT_RE = /ltv|komornik|egzekuc|opłat\p{L}*\s+(?:sądow|egzekuc|notarial|skarbow)|wskaźnik\p{L}*\s+zadłużenia|wartości\s+nieruchomości|inflacj|stop\p{L}*\s+(?:nbp|referencyjn)|rpp|wibor|wiron|podat|belk/iu;

const NEGATION_RE =
  /(?<![\p{L}\p{N}])(?:nie|nigdy|żadn\p{L}*|brak\p{L}*|bez|nikt|ani|zakaz\p{L}*)(?![\p{L}\p{N}])/iu;
const NEGATION_WINDOW_WORDS = 5;

/** Pytanie z odpowiedzią przeczącą („Czy notariusz gwarantuje…? Nie.”). */
function isAnsweredNo(text: string, index: number): boolean {
  const qEnd = text.indexOf("?", index);
  if (qEnd < 0) return false;
  const between = text.slice(index, qEnd);
  if (/[.!]/.test(between)) return false;
  return /^\s*(?:nie|wcale|absolutnie\s+nie)(?![\p{L}\p{N}])/iu.test(text.slice(qEnd + 1, qEnd + 20));
}

function isNegated(text: string, index: number): boolean {
  if (isAnsweredNo(text, index)) return true;
  const before = text.slice(Math.max(0, index - 60), index);
  const words = before.split(/[\s,;:]+/).filter(Boolean).slice(-NEGATION_WINDOW_WORDS);
  // Zaprzeczenie liczy się tylko w obrębie tego samego zdania.
  const lastStop = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"));
  const sameSentence = lastStop >= 0 ? before.slice(lastStop + 1) : before;
  const sentenceWords = sameSentence.split(/[\s,;:]+/).filter(Boolean);
  const n = Math.min(words.length, sentenceWords.length);
  if (n === 0) return false;
  const windowWords = words.slice(-n);
  return windowWords.some((w) => NEGATION_RE.test(w));
}

function ruleApplies(rule: HardRule, ctx: ComplianceContext): boolean {
  if (rule.kinds && !rule.kinds.includes(ctx.kind)) return false;
  if (rule.aiOnly && !ctx.aiGenerated) return false;
  if (rule.scope === "common") return true;
  // Brak toru → najostrzej: obie listy torów.
  return !ctx.track || ctx.track === rule.scope;
}

function checkPercentReturns(text: string): ComplianceViolation[] {
  const out: ComplianceViolation[] = [];
  for (const m of text.matchAll(PERCENT_RE)) {
    const i = m.index ?? 0;
    const ctxText = text.slice(Math.max(0, i - 50), i + m[0].length + 50);
    if (PERCENT_SAFE_CONTEXT_RE.test(ctxText)) continue;
    if (!RETURN_CONTEXT_RE.test(ctxText)) continue;
    out.push({
      ruleId: "percent_return",
      match: m[0],
      message: "Konkretna stopa zwrotu / oprocentowanie przedstawione jako wynik.",
      fix: "Usuń liczbę zwrotu; pokaż mechanizm (LTV, zabezpieczenie, ryzyko) bez obietnicy.",
    });
  }
  return out;
}

/**
 * Sprawdza tekst regułami twardymi. Pusta lista = przechodzi.
 */
export function checkHardRules(text: string, ctx: ComplianceContext): ComplianceViolation[] {
  const source = (text ?? "").normalize("NFC");
  if (!source.trim()) return [];
  const violations: ComplianceViolation[] = [];
  for (const rule of HARD_RULES) {
    if (!ruleApplies(rule, ctx)) continue;
    if (rule.when && !rule.when(source)) continue;
    rule.pattern.lastIndex = 0;
    for (const m of source.matchAll(rule.pattern)) {
      if (rule.negatable && isNegated(source, m.index ?? 0)) continue;
      violations.push({ ruleId: rule.id, match: m[0], message: rule.message, fix: rule.fix });
      break; // jedno dopasowanie na regułę wystarczy do decyzji
    }
  }
  violations.push(...checkPercentReturns(source).slice(0, 1));
  return violations;
}

export const HARD_RULE_IDS = [...HARD_RULES.map((r) => r.id), "percent_return"] as const;

// ── Elementy obowiązkowe (5.7 p. 2) ────────────────────────────────────

export const COMPANY_IDENTIFICATION = "Finance You sp. z o.o., KRS 0000635207";

export type MandatoryElement = "ai_disclosure" | "sender_identification" | "risk_line";

const AI_DISCLOSURE_RE =
  /(?<![\p{L}])(?:AI|SI)(?![\p{L}])|sztuczn\p{L}*\s+inteligencj|wygenerowan\p{L}*|awatar\p{L}*/u;
const SENDER_RE = /KRS\s*0000635207|Finance\s+You\s+sp\.\s*z\s*o\.\s*o\./iu;

export const RISK_LINES: Record<AudienceTrack | "ogolny", string> = {
  inwestor:
    "Pożyczki prywatne nie są lokatą i nie są objęte gwarancją BFG. Zabezpieczenie hipoteczne nie wyklucza straty kapitału ani długiej egzekucji. Materiał edukacyjny.",
  pozyczkobiorca:
    "Finansowanie wyłącznie dla przedsiębiorców, na cel gospodarczy. Kalkulacje są orientacyjne, decyzja należy do finansujących. Ryzyko: brak spłaty pożyczki zabezpieczonej hipoteką grozi egzekucją z nieruchomości.",
  ogolny:
    "Materiał edukacyjny. Każde finansowanie i każda inwestycja wiąże się z ryzykiem, w tym utraty kapitału.",
};

export const AI_DISCLOSURE_TEXT =
  "Treść przygotowana z użyciem AI (cyfrowy awatar i syntetyczny głos Filipa Bielaka); scenariusz sprawdzony automatycznie pod kątem zgodności.";

export interface MandatoryContext extends ComplianceContext {
  /** Czy treść dotyczy pieniędzy (dla Finance You praktycznie zawsze). */
  aboutMoney?: boolean;
}

export function missingMandatoryElements(text: string, ctx: MandatoryContext): MandatoryElement[] {
  const missing: MandatoryElement[] = [];
  const t = text ?? "";
  if (ctx.aiGenerated && !AI_DISCLOSURE_RE.test(t)) missing.push("ai_disclosure");
  const needsDescriptionBlocks = ctx.kind === "caption" || ctx.kind === "ad";
  if (needsDescriptionBlocks && !SENDER_RE.test(t)) missing.push("sender_identification");
  if ((ctx.aboutMoney ?? true) && !hasRisk(t) && ctx.kind !== "title" && ctx.kind !== "comment_reply") {
    missing.push("risk_line");
  }
  return missing;
}

/**
 * Dopisuje brakujące elementy obowiązkowe na końcu opisu (deterministycznie,
 * bez LLM). Przy limicie znaków (X) używa wersji skróconej; jeśli i ona się
 * nie zmieści, zwraca `null` — wtedy treść trzeba skrócić.
 */
export function applyMandatoryElements(
  text: string,
  ctx: MandatoryContext,
  opts: { maxLength?: number } = {},
): { text: string; added: MandatoryElement[] } | null {
  const missing = missingMandatoryElements(text, ctx);
  if (missing.length === 0) return { text, added: [] };
  const track = ctx.track ?? "ogolny";
  const full: string[] = [];
  const short: string[] = [];
  if (missing.includes("risk_line")) {
    full.push(RISK_LINES[track]);
    short.push("Materiał edukacyjny, finansowanie i inwestowanie wiążą się z ryzykiem.");
  }
  if (missing.includes("ai_disclosure")) {
    full.push(AI_DISCLOSURE_TEXT);
    short.push("Treść AI.");
  }
  if (missing.includes("sender_identification")) {
    full.push(`${COMPANY_IDENTIFICATION}.`);
    short.push("Finance You, KRS 0000635207.");
  }
  const base = (text ?? "").trimEnd();
  const fullText = `${base}\n\n${full.join("\n")}`.trim();
  if (!opts.maxLength || fullText.length <= opts.maxLength) {
    return { text: fullText, added: missing };
  }
  const shortText = `${base}\n${short.join(" ")}`.trim();
  if (shortText.length <= opts.maxLength) return { text: shortText, added: missing };
  return null;
}

/** Zgrubne rozpoznanie toru po treści, gdy wpis go nie niesie. */
export function inferTrack(text: string): AudienceTrack | null {
  const t = (text ?? "").toLowerCase();
  const inv = (t.match(/inwestor|inwestuj|inwestycj|kapitał|pożyczkodawc|dla-inwestora|zarabia/gu) ?? []).length;
  const bor = (t.match(/przedsiębiorc|firm|wniosek|finansowani|pożyczkobiorc|kredyt|bank odmówił|płynnoś/gu) ?? []).length;
  if (inv === 0 && bor === 0) return null;
  if (inv === bor) return null;
  return inv > bor ? "inwestor" : "pozyczkobiorca";
}

/** Przestarzały rok w tytule (np. „w 2024” publikowane w 2026). */
export function findStaleYears(text: string, now: Date = new Date()): number[] {
  const current = now.getUTCFullYear();
  const years = new Set<number>();
  const src = text ?? "";
  for (const m of src.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)) {
    const y = Number(m[1]);
    if (y >= current || y < 2000) continue;
    const before = src.slice(Math.max(0, (m.index ?? 0) - 12), m.index ?? 0).toLowerCase();
    const after = src.slice((m.index ?? 0) + 4, (m.index ?? 0) + 8);
    // Odwołania historyczne („od 2017”, „sprzed 2020”, „2019–2026”) są w porządku.
    if (/(?:od|sprzed|latach|roku|rok)\s*$/u.test(before)) continue;
    if (/^\s*[–-]\s*20\d{2}/u.test(src.slice((m.index ?? 0) + 4, (m.index ?? 0) + 11))) continue;
    if (/[–-]\s*$/u.test(before) && after !== "") continue;
    years.add(y);
  }
  return [...years].sort();
}
