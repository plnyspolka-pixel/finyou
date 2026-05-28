// Pure KW helpers — safe for browser and server.

export const KW_REGEX = /^[A-Z]{2}[0-9A-Z]{2}\/[0-9]{8}\/[0-9]$/;

const WEIGHTS_DEPT: Record<string, number> = {
  "0":0,"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,
  "A":10,"B":11,"C":12,"D":13,"E":14,"F":15,"G":16,"H":17,"I":18,"J":19,
  "K":20,"L":21,"M":22,"N":23,"O":24,"P":25,"R":26,"S":27,"T":28,"U":29,
  "W":30,"Y":31,"Z":32,"X":33,
};
const W = [1, 3, 7];

export function kwChecksum(kwNumber: string): number | null {
  const m = kwNumber.match(/^([A-Z]{2}[0-9A-Z]{2})\/([0-9]{8})\/([0-9])$/);
  if (!m) return null;
  const code = m[1];
  const num = m[2];
  const chars = (code + num).split("");
  let sum = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const v = WEIGHTS_DEPT[c];
    if (v === undefined) return null;
    sum += v * W[i % 3];
  }
  return sum % 10;
}

export function isValidKwFormat(kw: string): boolean {
  return KW_REGEX.test(kw.trim().toUpperCase());
}

export function isValidKwChecksum(kw: string): boolean {
  const v = kwChecksum(kw.trim().toUpperCase());
  if (v === null) return false;
  const expected = parseInt(kw.trim().slice(-1), 10);
  return v === expected;
}

export function splitKw(kw: string): { dept: string; number: string; check: string } | null {
  const m = kw.trim().toUpperCase().match(/^([A-Z]{2}[0-9A-Z]{2})\/([0-9]{8})\/([0-9])$/);
  if (!m) return null;
  return { dept: m[1], number: m[2], check: m[3] };
}

export type KwStatus =
  | "PENDING" | "PROCESSING" | "SUCCESS" | "PARTIAL_SUCCESS"
  | "RETRY_SCHEDULED" | "FAILED_INVALID_NUMBER" | "FAILED_NOT_FOUND"
  | "FAILED_MAX_ATTEMPTS" | "REQUIRES_MANUAL_REVIEW"
  | "BLOCKED_BY_SECURITY" | "RATE_LIMITED";

export const KW_STATUS_LABEL: Record<KwStatus, string> = {
  PENDING: "Oczekuje na pobranie",
  PROCESSING: "Pobieranie w toku",
  SUCCESS: "Pobrano i przeanalizowano",
  PARTIAL_SUCCESS: "Pobrano część danych — wymagana kontrola",
  RETRY_SCHEDULED: "Zaplanowano kolejną próbę",
  FAILED_INVALID_NUMBER: "Błędny numer KW",
  FAILED_NOT_FOUND: "Nie znaleziono księgi",
  FAILED_MAX_ATTEMPTS: "Przekroczono limit prób",
  REQUIRES_MANUAL_REVIEW: "Wymaga ręcznej weryfikacji",
  BLOCKED_BY_SECURITY: "Zatrzymane przez zabezpieczenie strony",
  RATE_LIMITED: "Ograniczenie czasowe / limit zapytań",
};

export const KW_SECTIONS = [
  { key: "I-O", label: "Dział I-O", expectedHeader: "DZIAŁ I-O" },
  { key: "I-Sp", label: "Dział I-Sp", expectedHeader: "DZIAŁ I-SP" },
  { key: "II", label: "Dział II", expectedHeader: "DZIAŁ II" },
  { key: "III", label: "Dział III", expectedHeader: "DZIAŁ III" },
  { key: "IV", label: "Dział IV", expectedHeader: "DZIAŁ IV" },
] as const;

// --- Parser ------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function toPlainText(htmlOrText: string | null | undefined): string {
  if (!htmlOrText) return "";
  return /<[a-z]/i.test(htmlOrText) ? stripHtml(htmlOrText) : htmlOrText.replace(/\s+/g, " ").trim();
}

const RX = {
  hasOwnership: /\b(własność|udział)\b/i,
  shareFraction: /\b(\d{1,4})\s*\/\s*(\d{1,4})\b/,
  hasMortgage: /\b(hipoteka|hipoteczna|wierzyciel hipoteczny|kwota hipoteki)\b/i,
  hasEnforcement: /\b(egzekucj|komornik|wpis egzekucyjny|zajęci[ae])\b/i,
  hasWarning: /\bostrzeżeni/i,
  hasMention: /\bwzmianka/i,
  hasPersonalEasement: /\bsłużebność\s+osobist/i,
  hasLifeEstate: /\b(dożywoci|dożywotni)/i,
  hasThirdPartyClaims: /\broszczeni/i,
  hasSaleBan: /\b(zakaz\s+zbywania|ograniczenie\s+rozporządzania)\b/i,
};

export type ParsedKw = {
  kw_number: string;
  downloaded_at: string;
  source: "EKW";
  summary: Record<string, unknown>;
  property: Record<string, unknown>;
  owners: Array<Record<string, unknown>>;
  section_iii: Record<string, unknown>;
  section_iv: Record<string, unknown>;
  risk_flags: Record<string, boolean | null>;
  missing_sections: string[];
};

export type SectionInputs = {
  summary?: { raw_text?: string | null; raw_html?: string | null } | null;
  sections: Partial<Record<"I-O" | "I-Sp" | "II" | "III" | "IV", { raw_text?: string | null; raw_html?: string | null }>>;
};

export function parseKw(kwNumber: string, input: SectionInputs): ParsedKw {
  const summaryText = toPlainText(input.summary?.raw_text ?? input.summary?.raw_html ?? "");
  const sIO = toPlainText(input.sections["I-O"]?.raw_text ?? input.sections["I-O"]?.raw_html ?? "");
  const sISp = toPlainText(input.sections["I-Sp"]?.raw_text ?? input.sections["I-Sp"]?.raw_html ?? "");
  const sII = toPlainText(input.sections["II"]?.raw_text ?? input.sections["II"]?.raw_html ?? "");
  const sIII = toPlainText(input.sections["III"]?.raw_text ?? input.sections["III"]?.raw_html ?? "");
  const sIV = toPlainText(input.sections["IV"]?.raw_text ?? input.sections["IV"]?.raw_html ?? "");

  const missing: string[] = [];
  for (const s of KW_SECTIONS) {
    const k = s.key as "I-O" | "I-Sp" | "II" | "III" | "IV";
    const txt = { "I-O": sIO, "I-Sp": sISp, "II": sII, "III": sIII, "IV": sIV }[k];
    if (!txt || txt.length < 20) missing.push(s.key);
  }

  const owners: Array<Record<string, unknown>> = [];
  const ownerLines = sII.split(/(?<=[.;])\s+/).filter((l) => /własn|udział|PESEL|REGON/i.test(l)).slice(0, 10);
  for (const line of ownerLines) {
    const fr = line.match(RX.shareFraction);
    owners.push({
      name: null,
      share: fr ? `${fr[1]}/${fr[2]}` : null,
      identifier: null,
      raw_entry: line.trim().slice(0, 500),
    });
  }

  const fr = sII.match(RX.shareFraction);
  const coOwn =
    owners.length > 1 ||
    (fr ? !(fr[1] === fr[2] || (fr[1] === "1" && fr[2] === "1")) : false);

  const risk_flags: Record<string, boolean | null> = {
    co_ownership: coOwn,
    owner_mismatch: null,
    has_mortgage: RX.hasMortgage.test(sIV),
    has_section_iii_entries: sIII.length > 30,
    has_mention: RX.hasMention.test(sIII + " " + summaryText),
    has_warning: RX.hasWarning.test(sIII + " " + summaryText),
    has_enforcement: RX.hasEnforcement.test(sIII),
    has_personal_easement: RX.hasPersonalEasement.test(sIII + " " + sISp),
    has_life_estate: RX.hasLifeEstate.test(sIII),
    has_third_party_claims: RX.hasThirdPartyClaims.test(sIII),
    has_sale_ban: RX.hasSaleBan.test(sIII),
    missing_critical_sections: missing.includes("III") || missing.includes("IV"),
  };

  return {
    kw_number: kwNumber,
    downloaded_at: new Date().toISOString(),
    source: "EKW",
    summary: { raw_text: summaryText.slice(0, 4000) },
    property: { section_i_o_raw: sIO.slice(0, 8000), section_i_sp_raw: sISp.slice(0, 8000) },
    owners,
    section_iii: { raw: sIII.slice(0, 8000) },
    section_iv: { raw: sIV.slice(0, 8000), has_mortgage: risk_flags.has_mortgage },
    risk_flags,
    missing_sections: missing,
  };
}

export function computeLegalRiskScore(parsed: ParsedKw): number {
  let score = 95;
  const f = parsed.risk_flags;
  if (f.has_mortgage) score -= 15;
  if (f.has_section_iii_entries) score -= 5;
  if (f.has_enforcement) score -= 35;
  if (f.has_warning) score -= 25;
  if (f.has_mention) score -= 8;
  if (f.has_personal_easement) score -= 18;
  if (f.has_life_estate) score -= 22;
  if (f.has_third_party_claims) score -= 18;
  if (f.has_sale_ban) score -= 30;
  if (f.co_ownership) score -= 8;
  if (f.owner_mismatch === true) score -= 35;
  if (f.missing_critical_sections) score = Math.min(score, 55);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildInvestorSummary(parsed: ParsedKw, score: number): string {
  const f = parsed.risk_flags;
  const lines: string[] = [];
  lines.push(`Scoring prawny: ${score}/100`);
  lines.push("");
  lines.push("Stan prawny nieruchomości:");
  lines.push(parsed.owners.length > 0
    ? `– Liczba ujawnionych właścicieli/wpisów w dziale II: ${parsed.owners.length}.`
    : "– Działu II nie udało się jednoznacznie sparsować.");
  if (f.co_ownership) lines.push("– Wykryto współwłasność lub udziały — wymaga weryfikacji.");
  lines.push("");
  lines.push("Obciążenia hipoteczne:");
  lines.push(f.has_mortgage ? "– Dział IV zawiera wpisy hipoteczne." : "– Brak wpisów hipotecznych w dziale IV.");
  lines.push("");
  lines.push("Dział III:");
  if (f.has_section_iii_entries) {
    const flags = [
      f.has_warning && "ostrzeżenie",
      f.has_mention && "wzmianka",
      f.has_enforcement && "egzekucja/komornik",
      f.has_personal_easement && "służebność osobista",
      f.has_life_estate && "dożywocie",
      f.has_third_party_claims && "roszczenia osób trzecich",
      f.has_sale_ban && "zakaz zbywania",
    ].filter(Boolean);
    lines.push(flags.length ? `– Wykryto: ${flags.join(", ")}.` : "– Wpisy obecne, do indywidualnej oceny.");
  } else {
    lines.push("– Brak istotnych wpisów.");
  }
  lines.push("");
  lines.push("Rekomendacja:");
  if (score >= 90) lines.push("– Bardzo dobry stan prawny. Standardowa weryfikacja.");
  else if (score >= 75) lines.push("– Akceptowalny stan prawny. Drobne kwestie do weryfikacji.");
  else if (score >= 60) lines.push("– Umiarkowane ryzyko. Wymagana dokładna analiza prawna.");
  else if (score >= 40) lines.push("– Podwyższone ryzyko. Konieczna pogłębiona analiza.");
  else lines.push("– Wysokie ryzyko. Zabezpieczenie problematyczne.");
  if (f.missing_critical_sections) {
    lines.push("");
    lines.push("UWAGA: Brak działu III lub IV — analiza niekompletna.");
  }
  return lines.join("\n");
}

export const KW_INCOMPLETE_WARNING =
  "Analiza nie jest kompletna, ponieważ nie udało się pobrać wszystkich działów księgi wieczystej. Brak działu III lub IV uniemożliwia bezpieczną ocenę ryzyk prawnych i hipotecznych.";
