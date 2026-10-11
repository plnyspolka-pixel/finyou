// STRAŻNIK PRAWDY — każda treść agenta wzrostu (post, opis, odpowiedź na
// komentarz) przechodzi tędy przed publikacją.
//
// Właściciel: „agent nie może mówić nieprawdy; prawdę przedstawia w
// obiektywnie korzystny dla widza sposób". Strażnik rozróżnia:
//   • block — nieprawda albo obietnica, której nie możemy dać (gwarancja
//             zysku, „bez ryzyka", prowizja ≠ umowa, LTV > limit, odsetki
//             powyżej maksymalnych, stawki miesięczne, cudze numery…),
//   • fix   — poprawiane automatycznie (brak zastrzeżenia przy treści
//             inwestycyjnej, „link w bio" poza IG/TikTokiem, nadmiar hashtagów),
//   • warn  — do wiedzy agenta, nie blokuje (brak pytania/CTA, brak „dla firm").
//
// Liczby porównujemy z tym samym źródłem co umowy (fees.ts, plans.ts), więc
// zmiana stawki w kodzie natychmiast zmienia to, co strażnik uznaje za prawdę.
// Czysty moduł — bez I/O.
import {
  FY_COMMISSION_PCT,
  LTV_MAX,
  maxCapitalRate,
  maxDelayRate,
} from "@/lib/contract-engine/fees";
import { SUBSCRIPTION_MONTHLY_PLN, SUBSCRIPTION_YEARLY_PLN } from "@/lib/investor-plan/plans";
import { guardOutboundContactDetails } from "@/lib/bot-contact-guard";
import { COMPANY_DATA } from "@/lib/company";

export type GuardAudience = "inwestor" | "klient" | "ogolny";
export type GuardPlatform =
  | "facebook_post"
  | "instagram"
  | "x"
  | "youtube"
  | "tiktok"
  | "comment_reply"
  | "generic";

export interface GuardViolation {
  code: string;
  severity: "block" | "fix" | "warn";
  message: string;
  match?: string;
}

export interface GuardResult {
  ok: boolean;
  text: string;
  violations: GuardViolation[];
}

export const INVESTOR_DISCLAIMER =
  "Materiał edukacyjny — nie stanowi oferty ani rekomendacji inwestycyjnej. Inwestowanie wiąże się z ryzykiem utraty kapitału.";

const L = "\\p{L}";
const w = (src: string) => new RegExp(`(?<!${L})(?:${src})`, "iu");

/** Obietnice i sformułowania, które są nieprawdą albo obietnicą bez pokrycia. */
const BANNED: Array<{ code: string; re: RegExp; message: string }> = [
  {
    code: "gwarancja_zysku",
    re: w(
      `gwarantowan\\p{L}*\\s+(?:zysk|zwrot|stop|oprocentowani|dochód|dochod|zarobek)|(?:zysk|zwrot|dochód|zarobek)\\p{L}*\\s+gwarantowan|gwarancj\\p{L}*\\s+(?:zysku|zwrotu)`,
    ),
    message: "Nie gwarantujemy zysku ani stopy zwrotu.",
  },
  {
    code: "gwarancja_finansowania",
    re: w(
      `gwarantujemy|gwarantowan\\p{L}*\\s+(?:finansowani|pożyczk|wypłat|decyzj)|na pewno (?:dostaniesz|otrzymasz|przejdzie|dostanie)|(?:każdy|każda) dostanie|pieniądze (?:na pewno|gwarantowane)`,
    ),
    message: "Nie obiecujemy przyznania finansowania ani decyzji.",
  },
  {
    code: "pewny_zysk",
    re: w(`pewn\\p{L}*\\s+(?:zysk|zwrot|zarobek|dochód)|zarobisz\\s+(?:nawet\\s+)?\\d`),
    message: "Zysk nie jest pewny; nie podajemy obiecanego wyniku.",
  },
  {
    code: "bez_ryzyka",
    re: w(
      `bez\\s+(?:żadnego\\s+)?ryzyka|zero\\s+ryzyka|brak\\s+ryzyka|minimaln\\p{L}*\\s+ryzyk|ryzyko\\s+(?:jest\\s+)?(?:zerowe|żadne)|100\\s?%\\s+bezpieczn|bezpieczn\\p{L}*\\s+(?:lokat|inwestycj|zysk|zwrot)`,
    ),
    message: "Każda inwestycja i pożyczka niesie ryzyko — nie piszemy, że go nie ma.",
  },
  {
    code: "bez_weryfikacji",
    re: w(
      `bez\\s+(?:sprawdzania|weryfikacji)\\s+(?:bik|zdolności|historii|zus)|nie\\s+sprawdzamy\\s+(?:bik|zdolności|zus)`,
    ),
    message:
      "Oceniamy przede wszystkim zabezpieczenie, ale nie twierdzimy, że niczego nie sprawdzamy.",
  },
  {
    code: "hipoteka_gwarantuje",
    re: w(
      `hipotek\\p{L}*\\s+gwarantuj|czyst\\p{L}* księg\\p{L}*\\s+(?:oznacza|to)\\s+(?:brak|zero)\\s+ryzyk|art\\.?\\s*777\\s+pozwala\\s+omin`,
    ),
    message:
      "Hipoteka i art. 777 zabezpieczają, ale nie gwarantują odzyskania pieniędzy ani nie omijają sądu.",
  },
  {
    code: "niezweryfikowany_zwrot",
    re: w(
      `kilkadziesiąt\\s+procent|kilkudziesięciu\\s+procent|dwucyfrow\\p{L}*\\s+zysk\\p{L}*\\s+gwarant`,
    ),
    message:
      "Przedział zwrotu „kilkudziesięciu procent” nie wynika z faktów systemu (odsetki maksymalne + prowizja inwestora).",
  },
  {
    code: "stawka_miesieczna",
    re: /\d+(?:[.,]\d+)?\s?%\s*(?:miesięcznie|w skali miesiąca|mies\.|\/\s?mies)/iu,
    message:
      "Nie komunikujemy stawek miesięcznych — oprocentowanie podajemy w skali roku (odsetki maksymalne).",
  },
  {
    code: "rama_konsumencka",
    re: w(
      `(?<!nie (?:udzielamy|finansujemy|dajemy) \\p{L}*\\s?)(?:kredyt|pożyczk)\\p{L}*\\s+na\\s+(?:wakacje|wesele|samochód|auto|zakup\\s+(?:mieszkania|domu)|święta|życie)`,
    ),
    message: "Finansujemy wyłącznie cele firmowe — nie reklamujemy pożyczek na cele prywatne.",
  },
];

const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));

/** Wartości liczbowe sprzeczne z faktami systemu. */
function numericViolations(text: string, date: Date | string): GuardViolation[] {
  const out: GuardViolation[] = [];
  const t = text.toLowerCase();

  // Prowizja Finance You (od pożyczkobiorcy). Prowizji inwestora nie sprawdzamy.
  for (const m of t.matchAll(/prowizj\p{L}*([^.%\n]{0,60}?)(\d+(?:[.,]\d+)?)\s?%/giu)) {
    const ctx = t.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + m[0].length);
    if (/inwestor/.test(ctx) && !/finance you|pożyczkobior|nasz/.test(ctx)) continue;
    const v = num(m[2]);
    if (Number.isFinite(v) && Math.abs(v - FY_COMMISSION_PCT) > 1e-9) {
      out.push({
        code: "prowizja_niezgodna",
        severity: "block",
        match: m[0],
        message: `Prowizja Finance You to ${FY_COMMISSION_PCT}% (min. 5 000 zł), a nie ${m[2]}%.`,
      });
    }
  }
  // LTV / procent wartości nieruchomości.
  for (const m of t.matchAll(
    /(?:ltv[^.%\n]{0,30}?|do\s+)(\d+(?:[.,]\d+)?)\s?%(?:\s+wartości)?/giu,
  )) {
    const ctx = t.slice(m.index ?? 0, (m.index ?? 0) + m[0].length + 30);
    if (!/ltv|wartości/.test(ctx)) continue;
    const v = num(m[1]);
    if (Number.isFinite(v) && v > LTV_MAX + 1e-9) {
      out.push({
        code: "ltv_ponad_limit",
        severity: "block",
        match: m[0],
        message: `Limit LTV to ${LTV_MAX}% — nie ${m[1]}%.`,
      });
    }
  }
  // Oprocentowanie / odsetki roczne powyżej maksymalnych.
  const cap = maxCapitalRate(date);
  const delay = maxDelayRate(date);
  for (const m of t.matchAll(
    /(oprocentowani|odset)\p{L}*([^.%\n]{0,50}?)(\d+(?:[.,]\d+)?)\s?%/giu,
  )) {
    const ctx = t.slice(m.index ?? 0, (m.index ?? 0) + m[0].length + 25);
    const v = num(m[3]);
    if (!Number.isFinite(v)) continue;
    const limit = /opóźnieni|zwłok/.test(ctx) ? delay : cap;
    if (v > limit + 1e-9) {
      out.push({
        code: "odsetki_ponad_maksymalne",
        severity: "block",
        match: m[0],
        message: `Oprocentowanie nie może przekroczyć odsetek maksymalnych (${String(limit).replace(".", ",")}% rocznie).`,
      });
    }
  }
  // Ceny abonamentu.
  for (const m of t.matchAll(/abonament\p{L}*([^.\n]{0,60}?)(\d[\d\s\u00a0]{2,})\s?zł/giu)) {
    const v = num(m[2]);
    if (Number.isFinite(v) && v !== SUBSCRIPTION_MONTHLY_PLN && v !== SUBSCRIPTION_YEARLY_PLN) {
      out.push({
        code: "abonament_niezgodny",
        severity: "block",
        match: m[0],
        message: `Abonament kosztuje ${SUBSCRIPTION_MONTHLY_PLN} zł miesięcznie albo ${SUBSCRIPTION_YEARLY_PLN} zł za rok.`,
      });
    }
  }
  return out;
}

const INVESTOR_CONTENT = w(
  `inwestuj|inwestor|inwestowa|zysk|zwrot|kapitał|lokat|pasywn\\p{L}* dochód|odsetk\\p{L}* (?:dla|pracuj)|stop\\p{L}* zwrotu|portfel`,
);
const BUSINESS_MENTION = w(`firm|przedsiębior|działalnoś|b2b|jdg|spółk|biznes|gospodarstw`);
const ENGAGEMENT = /\?|obserwuj|napisz|daj znać|komentarz|zapisz|udostępnij|sprawdź/i;

const LIMITS: Partial<Record<GuardPlatform, number>> = {
  x: 280,
  instagram: 2200,
  facebook_post: 63000,
  youtube: 5000,
  tiktok: 2200,
  comment_reply: 1000,
};

/** Długość tekstu na X: URL liczy się jako 23 znaki. */
export function xWeightedLength(text: string): number {
  return text.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
}

export interface GuardInput {
  text: string;
  audience: GuardAudience;
  platform: GuardPlatform;
  date?: Date | string;
}

export function guardContent(input: GuardInput): GuardResult {
  const date = input.date ?? new Date();
  let text = String(input.text ?? "").trim();
  const violations: GuardViolation[] = [];

  if (!text) {
    return {
      ok: false,
      text,
      violations: [{ code: "pusta_tresc", severity: "block", message: "Treść jest pusta." }],
    };
  }

  for (const b of BANNED) {
    const m = text.match(b.re);
    if (m) violations.push({ code: b.code, severity: "block", match: m[0], message: b.message });
  }
  violations.push(...numericViolations(text, date));

  // Dane kontaktowe spoza oficjalnych — ten sam bezpiecznik co w botach.
  const contact = guardOutboundContactDetails(text, {
    knownText: [COMPANY_DATA.phone.display, COMPANY_DATA.email, COMPANY_DATA.website],
  });
  if (contact.redactions.length > 0) {
    violations.push({
      code: "obce_dane_kontaktowe",
      severity: "block",
      match: contact.redactions.map((r) => r.value).join(", "),
      message:
        "Tylko oficjalny kontakt Finance You (telefon, kontakt@financeyou.pl, financeyou.pl).",
    });
  }

  // ── poprawki automatyczne ────────────────────────────────────────────────
  const isInvestor =
    input.audience === "inwestor" || (input.audience === "ogolny" && INVESTOR_CONTENT.test(text));
  if (isInvestor && input.platform !== "comment_reply" && !/nie stanowi oferty/i.test(text)) {
    const sep = input.platform === "x" ? " " : "\n\n";
    const candidate = `${text}${sep}${input.platform === "x" ? "Materiał edukacyjny, nie oferta. Inwestowanie wiąże się z ryzykiem." : INVESTOR_DISCLAIMER}`;
    text = candidate;
    violations.push({
      code: "dodano_zastrzezenie",
      severity: "fix",
      message: "Dodano zastrzeżenie inwestycyjne.",
    });
  }
  if (input.platform !== "instagram" && input.platform !== "tiktok" && /link w bio/i.test(text)) {
    text = text.replace(/link w bio/gi, "financeyou.pl");
    violations.push({
      code: "link_w_bio",
      severity: "fix",
      message: "„Link w bio” zamieniono na financeyou.pl (poza IG/TikTokiem nie ma bio z linkiem).",
    });
  }
  if (input.platform === "instagram") {
    const tags = text.match(/#[\p{L}\d_]+/gu) ?? [];
    if (tags.length > 30) {
      const extra = new Set(tags.slice(30));
      let seen = 0;
      text = text
        .replace(/#[\p{L}\d_]+/gu, (tag) => (extra.has(tag) && ++seen > 0 ? "" : tag))
        .replace(/[ \t]{2,}/g, " ")
        .trim();
      violations.push({
        code: "za_duzo_hashtagow",
        severity: "fix",
        message: "Instagram: maksymalnie 30 hashtagów — nadmiar usunięto.",
      });
    }
  }

  // ── limity długości ──────────────────────────────────────────────────────
  const limit = LIMITS[input.platform];
  const length = input.platform === "x" ? xWeightedLength(text) : text.length;
  if (limit && length > limit) {
    violations.push({
      code: "za_dlugie",
      severity: "block",
      message: `Za długie dla ${input.platform}: ${length}/${limit} znaków.`,
    });
  }

  // ── ostrzeżenia ─────────────────────────────────────────────────────────
  if (
    input.audience === "klient" &&
    input.platform !== "comment_reply" &&
    !BUSINESS_MENTION.test(text)
  ) {
    violations.push({
      code: "brak_b2b",
      severity: "warn",
      message:
        "Treść dla pożyczkobiorców nie mówi, że to finansowanie dla firm — przyciągnie osoby, którym nie pomożemy.",
    });
  }
  if (input.platform !== "comment_reply" && !ENGAGEMENT.test(text)) {
    violations.push({
      code: "brak_cta",
      severity: "warn",
      message: "Brak pytania albo zachęty do interakcji — mały profil rośnie dzięki komentarzom.",
    });
  }

  return { ok: !violations.some((v) => v.severity === "block"), text, violations };
}

/** Lista naruszeń blokujących w formie do poprawki przez model. */
export function describeBlocking(result: GuardResult): string {
  return result.violations
    .filter((v) => v.severity === "block")
    .map((v) => `- ${v.message}${v.match ? ` (fragment: „${v.match}”)` : ""}`)
    .join("\n");
}
