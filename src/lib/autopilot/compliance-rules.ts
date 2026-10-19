// Bramka compliance autopilota — REGUŁY TWARDE (brief 5.7 p. 1–2).
//
// Czysta logika, bez I/O, testowana w compliance-rules.test.ts. Reguły są
// w kodzie i wersjonowane (COMPLIANCE_RULES_VERSION) — agent NIE może ich
// zmienić promptem ani zapisem w bazie (brief 2.1, 5.7 p. 8). Zmiana = commit
// w repo + podbicie wersji; wersja trafia do audytu każdej decyzji
// (`ai_compliance_checks.rules_version`).
//
// Reguły nie są poradą prawną — to deterministyczny filtr sygnałów
// ostrzegawczych (KNF/ESMA o finfluencerach, AI Act art. 50, B2B toru
// pożyczkobiorców). Recenzent LLM (compliance.server.ts) ocenia resztę.

export const COMPLIANCE_RULES_VERSION = "2026-10-19.1";

export const TRACKS = ["pozyczkobiorca", "inwestor"] as const;
export type Track = (typeof TRACKS)[number];
/** Treść bez przypisanego toru sprawdzamy regułami OBU torów (najostrzej). */
export type TrackOrBoth = Track | "oba";

export const CONTENT_KINDS = [
  "video_script",
  "video_caption",
  "post_caption",
  "title",
  "comment_reply",
  "email",
  "lead_magnet",
  "landing",
  "ad",
  "blog_article",
] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

const VIDEO_KINDS: readonly ContentKind[] = ["video_script", "video_caption"];
/** Treści mówione / pokazywane przez awatara Filipa. */
const AVATAR_KINDS: readonly ContentKind[] = ["video_script", "video_caption"];

export type HardRule = {
  id: string;
  scope: "common" | Track;
  /** Domyślnie wszystkie rodzaje treści. */
  kinds?: readonly ContentKind[];
  /** Rodzaje treści wyłączone z reguły (z uzasadnieniem w `reason`). */
  exceptKinds?: readonly ContentKind[];
  pattern: RegExp;
  /** Frazy dozwolone, wycinane z tekstu przed sprawdzeniem reguły. */
  allow?: RegExp[];
  /** Reguła nie łamie się, gdy tekst zawiera zdanie równoważące (np. o ryzyku). */
  unlessText?: RegExp;
  reason: string;
};

const L = String.raw`\p{L}*`;
const AMOUNT = String.raw`\d[\d\s.,]*\s*(?:zł|pln|złotych|tys\.?\s*zł)`;
const RISK_SENTENCE = /ryzyk\p{L}*|utrat\p{L}*\s+(?:części|całości|kapitał)/iu;

/**
 * Lista reguł twardych. Każda blokuje publikację i wymusza przepisanie.
 * Wzorce celowo łapią odmiany (\p{L}*) — język polski fleksyjny.
 */
export const HARD_RULES: readonly HardRule[] = [
  // ── wspólne ────────────────────────────────────────────────────────────
  {
    id: "guarantee",
    scope: "common",
    pattern: new RegExp(String.raw`gwarant${L}|gwarancj${L}`, "iu"),
    allow: [/Bankow\p{L}*\s+Fundusz\p{L}*\s+Gwarancyjn\p{L}*/giu, /\bBFG\b/gu],
    reason: "Słowa „gwarantowany/gwarancja” — zakazane (sygnał ostrzegawczy KNF).",
  },
  {
    id: "no_risk",
    scope: "common",
    pattern:
      /bez\s+(?:żadnego\s+|jakiegokolwiek\s+)?ryzyk\p{L}*|zero\s+ryzyk\p{L}*|nie\s+ma\s+(?:żadnego\s+)?ryzyk\p{L}*/iu,
    reason: "„Bez ryzyka” — każda transakcja wiąże się z ryzykiem.",
  },
  {
    id: "sure_profit",
    scope: "common",
    pattern: new RegExp(
      String.raw`(?:pewn|bezpieczn|stabiln|stał|przewidywaln|atrakcyjn|wysok)${L}\s+(?:\p{L}+\s+)?(?:zysk|zwrot|dochod|dochód|zarob|procent|odset)${L}|(?:zysk|zwrot|dochód|dochod)${L}\s+(?:jest\s+)?(?:pewn|bezpieczn|stabiln)${L}`,
      "iu",
    ),
    reason: "„Pewny/bezpieczny/stabilny zysk” — obietnica wyniku.",
  },
  {
    id: "minimal_risk",
    scope: "common",
    pattern:
      /(?:minimaln|znikom|niewielk|niski)\p{L}*\s+ryzyk\p{L}*|ryzyk\p{L}*\s+(?:jest\s+)?(?:minimaln|znikom)\p{L}*/iu,
    reason: "Bagatelizowanie ryzyka („minimalne ryzyko”).",
  },
  {
    id: "percent_return",
    scope: "common",
    // Blog przytacza oprocentowanie lokat/obligacji ze źródeł (fakt, nie
    // obietnica) — tam ocenę zostawiamy recenzentowi LLM i regule słownej.
    exceptKinds: ["blog_article"],
    pattern: new RegExp(
      String.raw`\d+(?:[.,]\d+)?\s*(?:%|proc${L})\s*(?:\p{L}+\s+){0,3}?(?:zwrot|zysk|rocznie|w\s+skali\s+roku|oprocentowan|rentown|dochod|dochód|stop${L}\s+zwrotu|odset)|(?:zwrot|zysk|oprocentowan|rentown|stop${L}\s+zwrotu|odset|zarob)${L}\s+(?:\p{L}+\s+){0,3}?(?:do\s+|nawet\s+|od\s+|ok\.\s+|około\s+)?\d+(?:[.,]\d+)?\s*(?:%|proc)`,
      "iu",
    ),
    reason: "Konkretny procent zwrotu/oprocentowania — w komunikacji nie podajemy stóp zwrotu.",
  },
  {
    id: "verbal_return_range",
    scope: "common",
    pattern:
      /(?:kilkunast|kilkudziesi|dwucyfrow|kilkuprocentow)\p{L}*\s+(?:\p{L}+\s+){0,2}?(?:procent|%|zwrot|zysk)\p{L}*/iu,
    reason: "Słowny przedział stóp zwrotu („kilkanaście procent rocznie”) — obietnica wyniku.",
  },
  {
    id: "double_money",
    scope: "common",
    pattern: /podw(?:ój|oi|aja|ojen)\p{L}*/iu,
    reason: "„Podwój/podwoisz” — obietnica wyniku.",
  },
  {
    id: "unbacked_superlative",
    scope: "common",
    pattern:
      /najlepsz\p{L}*|najbezpieczniejsz\p{L}*|najkorzystniejsz\p{L}*|najtańsz\p{L}*|najwyższ\p{L}*\s+(?:zysk|zwrot|stop)\p{L}*|numer\s+(?:1|jeden)\b|nr\s*1\b|lider\p{L}*\s+rynku/iu,
    reason: "Superlatyw bez pokrycia.",
  },
  {
    id: "closed_group_invite",
    scope: "common",
    kinds: AVATAR_KINDS,
    pattern:
      /(?:zamkni\p{L}*|ekskluzywn\p{L}*|elitarn\p{L}*|prywatn\p{L}*|tajn\p{L}*)\s+(?:klub|grup|społeczno|kręg)\p{L}*|dołącz\p{L}*\s+do\s+(?:naszego\s+|mojego\s+)?(?:klubu|grupy|kręgu)/iu,
    reason: "Zaproszenie do zamkniętej grupy/klubu w treści awatara (sygnał ostrzegawczy KNF).",
  },
  {
    id: "institution_endorsement",
    scope: "common",
    pattern:
      /(?:KNF|Komisj\p{L}*\s+Nadzoru\s+Finansowego|UOKiK|NBP|PKO|Pekao|mBank|ING|Santander|Millennium|BNP|Alior|Credit\s+Agricole)\s+(?:\p{L}+\s+){0,2}?(?:poleca|rekomend|zatwierdz|autoryz|nadzoruj|licencjonuj|współprac|partner)\p{L}*|(?:nadzorowan|zatwierdzon|rekomendowan|polecan|licencjonowan|autoryzowan)\p{L}*\s+przez\s+(?:KNF|Komisj\p{L}*|UOKiK|NBP|bank)/iu,
    reason: "Instytucja (KNF, bank) przedstawiona jako rekomendacja / partner.",
  },
  {
    id: "time_pressure",
    scope: "common",
    pattern:
      /tylko\s+(?:dziś|dzisiaj|teraz|do\s+końca)|ostatni\p{L}*\s+(?:szans|dzień|dni|miejsc)\p{L}*|zostało\s+(?:tylko|już\s+tylko)|nie\s+zwlekaj|działaj\s+(?:teraz|natychmiast|szybko)|zanim\s+będzie\s+za\s+późno|ofert\p{L}*\s+(?:ograniczon|limitowan)\p{L}*|liczba\s+miejsc\s+(?:jest\s+)?ograniczon/iu,
    reason: "Presja czasu.",
  },
  {
    id: "price_in_video",
    scope: "common",
    kinds: VIDEO_KINDS,
    pattern: new RegExp(
      String.raw`(?:cen${L}|opłat${L}|abonament${L}|pakiet${L}|kosztuje|koszt${L}|cennik${L})\s+(?:\S+\s+){0,4}?${AMOUNT}|${AMOUNT}\s*(?:\/|za|na)\s*(?:mies|miesiąc|rok|6\s*mies|pół\s+roku|abonament|pakiet)`,
      "iu",
    ),
    reason: "Cena w treści wideo — ceny podaje wyłącznie strona (cennik).",
  },
  {
    id: "personal_data",
    scope: "common",
    pattern:
      /(?<!\d)\d{11}(?!\d)|PL\s?\d{2}(?:\s?\d{4}){6}|[A-Z]{2}\d[A-Z]\/\d{8}\/\d|[\w.+-]+@(?!financeyou\.pl\b)[\w-]+\.[\w.]+/u,
    reason: "Dane osobowe/identyfikujące (PESEL, rachunek, nr księgi wieczystej, cudzy e-mail).",
  },
  // ── tor pożyczkobiorcy (B2B, cel gospodarczy) ───────────────────────────
  {
    id: "consumer_targeting",
    scope: "pozyczkobiorca",
    pattern:
      /na\s+(?:dowolny|każdy|jakikolwiek)\s+cel|cel\p{L}*\s+konsumpcyjn\p{L}*|kredyt\p{L}*\s+konsumenck\p{L}*|pożycz\p{L}*\s+konsumenck\p{L}*|na\s+(?:wakacje|wesele|samochód|komuni\p{L}*|święta|remont\s+mieszkania)|dla\s+os(?:ób|oby)\s+prywatn\p{L}*|dla\s+każdego|bez\s+względu\s+na\s+cel/iu,
    reason: "Kierowanie do konsumentów / cel niegospodarczy — tor wyłącznie B2B.",
  },
  {
    id: "no_verification",
    scope: "pozyczkobiorca",
    pattern:
      /bez\s+(?:sprawdzania|weryfikacji|BIK|zdolności|zaświadczeń|formalności|pytań)|100\s*%\s*(?:decyzji\s+)?pozytywn\p{L}*|każd\p{L}*\s+(?:dostanie|otrzyma)\s+(?:pożyczk|finansowan)\p{L}*|(?:pożyczk|finansowan)\p{L}*\s+(?:dla\s+)?(?:każdego|zawsze)|nawet\s+z\s+komornikiem/iu,
    reason: "Obietnica finansowania bez weryfikacji („bez BIK”, „100% decyzji pozytywnych”).",
  },
  {
    id: "cost_as_slogan",
    scope: "pozyczkobiorca",
    pattern:
      /(?:nisk|niższ|atrakcyjn|tani|tań|korzystn|okazyjn)\p{L}*\s+(?:oprocentowan|odset|koszt|prowizj|rat)\p{L}*|oprocentowan\p{L}*\s+(?:już\s+)?od\s+\d/iu,
    reason: "Koszt/oprocentowanie jako hasło reklamowe.",
  },
  // ── tor inwestora ───────────────────────────────────────────────────────
  {
    id: "return_promise",
    scope: "inwestor",
    pattern:
      /zarobi(?:sz|cie|my)\s+(?:\d|nawet|co\s+najmniej|minimum|pewnie|na\s+pewno)|(?:obiecuj|zapewniam|zapewniamy)\p{L}*\s+(?:\p{L}+\s+){0,2}?(?:zysk|zwrot|dochód)\p{L}*|(?:zysk|zwrot)\p{L}*\s+(?:co\s+miesiąc\s+)?na\s+pewno/iu,
    reason: "Obietnica zwrotu z inwestycji.",
  },
  {
    id: "buyback_guarantee",
    scope: "inwestor",
    pattern:
      /odkup\p{L}*\s+(?:\p{L}+\s+){0,2}?(?:udział|wierzytelno|pożycz|inwestycj|należnoś)\p{L}*/iu,
    reason: "Odkup udziałów/wierzytelności (wzorzec Fast Invest, KNF 2017).",
  },
  {
    id: "money_printer",
    scope: "inwestor",
    pattern: /(?:drukark|maszyn)\p{L}*\s+(?:do\s+)?pieniędzy/iu,
    unlessText: RISK_SENTENCE,
    reason: "„Drukarka do pieniędzy” bez zdania równoważącego ryzyko.",
  },
  {
    id: "i_invest_too_lure",
    scope: "inwestor",
    pattern:
      /(?:sam|ja)\s+(?:też\s+|również\s+)?(?:inwestuję|zainwestowałem|lokuję)|moje\s+(?:własne\s+)?pieniądze\s+(?:też|również|są)/iu,
    reason: "„Sam też inwestuję” jako wabik (ESMA/KNF).",
  },
];

export type HardViolation = { ruleId: string; match: string; reason: string };

export type RuleContext = { track: TrackOrBoth; kind: ContentKind };

function ruleApplies(rule: HardRule, ctx: RuleContext): boolean {
  if (rule.scope !== "common" && ctx.track !== "oba" && rule.scope !== ctx.track) return false;
  if (rule.kinds && !rule.kinds.includes(ctx.kind)) return false;
  if (rule.exceptKinds?.includes(ctx.kind)) return false;
  return true;
}

/** Zastrzeżenie „to nie jest porada” jako JEDYNE zastrzeżenie (brief 5.7 p. 1). */
const NOT_ADVICE =
  /nie\s+(?:jest|stanowi)\s+(?:\p{L}+\s+){0,2}?(?:porad|rekomendacj|ofert|doradztw)\p{L}*/iu;

/** Reguły twarde dla tekstu. Pusta lista = tekst przechodzi warstwę deterministyczną. */
export function checkHardRules(text: string, ctx: RuleContext): HardViolation[] {
  const source = (text ?? "").normalize("NFC");
  const out: HardViolation[] = [];
  for (const rule of HARD_RULES) {
    if (!ruleApplies(rule, ctx)) continue;
    let t = source;
    for (const a of rule.allow ?? []) t = t.replace(a, " ");
    const m = t.match(rule.pattern);
    if (!m) continue;
    if (rule.unlessText && rule.unlessText.test(source)) continue;
    out.push({ ruleId: rule.id, match: m[0].trim(), reason: rule.reason });
  }
  if (NOT_ADVICE.test(source) && !RISK_SENTENCE.test(source)) {
    out.push({
      ruleId: "not_advice_only",
      match: source.match(NOT_ADVICE)?.[0] ?? "",
      reason: "„To nie jest porada” jako jedyne zastrzeżenie — brak informacji o ryzyku.",
    });
  }
  // Scenariusz o pieniądzach musi mieć beat ryzyka („ale”) — inaczej przepisanie.
  if (ctx.kind === "video_script" && isMoneyTopic(source) && !RISK_SENTENCE.test(source)) {
    out.push({
      ruleId: "missing_risk_beat",
      match: "",
      reason: "Scenariusz o pieniądzach bez linii ryzyka (beat „ale”).",
    });
  }
  return out;
}

const MONEY_TOPIC =
  /inwest\p{L}*|kapitał\p{L}*|zysk\p{L}*|zwrot\p{L}*|odset\p{L}*|oprocentowan\p{L}*|pożycz\p{L}*|finansowan\p{L}*|hipote\p{L}*|zarab\p{L}*|pieniądz\p{L}*|pieniędzy/iu;

export function isMoneyTopic(text: string): boolean {
  return MONEY_TOPIC.test(text ?? "");
}

// ── Elementy obowiązkowe (brief 5.7 p. 2) ────────────────────────────────

export const AI_LABEL_VIDEO = "Wideo wygenerowane z użyciem AI (awatar i głos AI).";
export const AI_LABEL_TEXT = "Treść przygotowana z użyciem AI.";
export const RISK_LINE: Record<Track, string> = {
  inwestor:
    "Materiał edukacyjny, nie stanowi oferty ani rekomendacji. Inwestowanie wiąże się z ryzykiem, w tym utraty części lub całości kapitału.",
  pozyczkobiorca:
    "Finansowanie wyłącznie dla przedsiębiorców, na cel związany z działalnością gospodarczą. Pożyczka zabezpieczona hipoteką — brak spłaty może skutkować utratą nieruchomości. Decyzja należy do finansujących.",
};
export const SENDER_LINE = "Finance You sp. z o.o., KRS 0000635207, financeyou.pl";

const HAS_AI_LABEL =
  /(?:wygenerowan|przygotowan|stworzon|utworzon)\p{L}*\s+(?:\p{L}+\s+){0,3}?(?:AI|sztuczn\p{L}*\s+inteligencj\p{L}*)|\bAI\s*[-–]\s*generated|awatar\p{L}*\s+AI/iu;
const HAS_SENDER = /KRS\s*:?\s*0000635207/iu;

/** Rodzaje treści, które dostają linię AI + ryzyko + nadawcę. */
const KINDS_WITH_FOOTER: readonly ContentKind[] = [
  "video_caption",
  "post_caption",
  "email",
  "lead_magnet",
  "landing",
  "ad",
];

export type MandatoryResult = { text: string; added: string[] };

/**
 * Dokleja brakujące elementy obowiązkowe (deterministyczne „przepisanie”
 * bez LLM). Linia ryzyka — tylko w treściach o pieniądzach; dla treści
 * „oba” — obie linie. `compact` (np. X) — tylko etykieta AI.
 */
export function applyMandatoryElements(
  text: string,
  ctx: RuleContext & { compact?: boolean },
): MandatoryResult {
  if (!KINDS_WITH_FOOTER.includes(ctx.kind)) return { text, added: [] };
  const lines: string[] = [];
  const added: string[] = [];
  const base = (text ?? "").trimEnd();
  if (!RISK_SENTENCE.test(base) && isMoneyTopic(base) && !ctx.compact) {
    const tracks: Track[] = ctx.track === "oba" ? ["inwestor", "pozyczkobiorca"] : [ctx.track];
    for (const t of tracks) lines.push(RISK_LINE[t]);
    added.push("risk_line");
  }
  if (!HAS_SENDER.test(base) && !ctx.compact) {
    lines.push(SENDER_LINE);
    added.push("sender");
  }
  if (!HAS_AI_LABEL.test(base)) {
    lines.push(ctx.kind === "video_caption" ? AI_LABEL_VIDEO : AI_LABEL_TEXT);
    added.push("ai_label");
  }
  if (!lines.length) return { text, added };
  return { text: `${base}\n\n${lines.join("\n")}`, added };
}

// ── Tor z treści (gdy wpis nie ma toru) ──────────────────────────────────

const INVESTOR_SIGNS =
  /inwestor\p{L}*|inwestuj\p{L}*|inwestowan\p{L}*|pożyczkodawc\p{L}*|kapitał\p{L}*|ulokuj\p{L}*|lokowa\p{L}*|dla-inwestora/giu;
const BORROWER_SIGNS =
  /pożyczkobior\p{L}*|przedsiębior\p{L}*|firm\p{L}*|wniosek\p{L}*|wniosk\p{L}*|potrzebujesz\s+finansowan\p{L}*|odmówił\p{L}*|embed\/wniosek|dla-klienta/giu;

/** Tor z treści; brak przewagi = „oba” (sprawdzamy najostrzej). */
export function inferTrack(text: string): TrackOrBoth {
  const inv = (text.match(INVESTOR_SIGNS) ?? []).length;
  const bor = (text.match(BORROWER_SIGNS) ?? []).length;
  if (inv >= bor * 2 && inv > 0) return "inwestor";
  if (bor >= inv * 2 && bor > 0) return "pozyczkobiorca";
  return "oba";
}

/** Krótki opis naruszeń do `last_error` / dziennika. */
export function describeViolations(v: HardViolation[]): string {
  return v.map((x) => `${x.ruleId}${x.match ? ` („${x.match.slice(0, 60)}”)` : ""}`).join("; ");
}
