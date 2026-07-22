// Uniwersalna ekstrakcja danych z wiadomości inbound (email/messenger/sms/wa)
// oraz automatyczna promocja leada do loan_application, gdy zebrane są
// minimalne dane: KW + kwota + jakikolwiek załącznik/dokument.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeKwNumber } from "./kw";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type ExtractedFacts = {
  kwNumbers: string[];
  loanAmount: number | null;
  propertyValue: number | null;
  city: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

// Prefix sądu bywa zapisywany na kilka sposobów: "KS1J", "KS1 J", "KS1/J".
// Dopuszczamy opcjonalny separator (spacja / ukośnik / kropka / myślnik)
// pomiędzy cyfrą wydziału a literą oznaczenia zamiejscowego.
const KW_RE =
  /\b([A-ZŁŃŚŻŹĄĆĘÓ0-9]{2}\d)[\s\/\\.-]?([A-Z0-9])[\s\/\\.-]{0,3}(\d{7,8})[\s\/\\.-]{0,3}(\d)\b/g;


// Fragmenty, w których cyfry na pewno nie są kwotą — maile przychodzą często
// jako surowy HTML/CSS (kolory hex typu #951246), a adresy e-mail i linki
// zawierają liczby, które regex brałby za kwoty.
const stripNoise = (text: string): string => {
  let t = text
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, " ")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, " ")
    .replace(/#[0-9a-f]{3,8}\b/gi, " ");
  // Ciała reguł CSS ({...}) — część klientów pocztowych wkleja arkusz bez
  // znaczników <style>; pętla zdejmuje kolejne poziomy zagnieżdżenia.
  for (let i = 0; i < 5 && /\{[^{}]*\}/.test(t); i++) t = t.replace(/\{[^{}]*\}/g, " ");
  return t;
};

// "100 000 zł", "100.000 PLN", "50 tys", "1,2 mln zł", "kwota: 250000".
// Goła liczba bez waluty i bez słowa-klucza to zwykle telefon/kod/identyfikator
// — kwotę akceptujemy tylko z grupą 1 (słowo-klucz) lub 4 (waluta/jednostka).
const AMOUNT_RE =
  /(?:\b(kwot\p{L}*|pożyczk\p{L}*|pożyczy[ćc]|potrzebuj\p{L}*|potrzeba|wnioskuj\p{L}*|kredyt\p{L}*|finansowan\p{L}*)[^0-9]{0,30})?(?<![\w#@./-])(\d{1,3}(?:[ .\u00a0]\d{3})+|\d{4,7}|\d{1,3})(?:[.,](\d{1,2}))?(?!\d)\s*(z[łl]|pln|tys(?:i[aą]c\p{L}*)?\.?|mln|m\b)?/giu;

// Kontekst "wartość nieruchomości" — kwota tuż po tych słowach to wycena
// zabezpieczenia, nie kwota pożyczki ("Wartość domu to około 600000 zł").
// Uwaga: \b nie działa po polskich znakach (ć/ś to nie \w) — używamy \p{L}.
const VALUE_CTX_RE = /(?<!\p{L})(warto[śs][ćc]\p{L}*|wycen\p{L}*|wart[aey]?)(?!\p{L})/giu;

const CITY_RE =
  /\b(?:z|w|do|nieruchomo[śs][ćc]\s*w|dzia[łl]ka\s*w|mieszkanie\s*w)\s+([A-ZŁŚŻŹĆĄĘÓŃ][a-ząćęłńóśżź]{2,}(?:[- ][A-ZŁŚŻŹĆĄĘÓŃ]?[a-ząćęłńóśżź]{2,})?)/g;

// "jestem Jan Kowalski", "nazywam się…", "pozdrawiam Waldek Trojanowski",
// "z poważaniem…", "mam na imię Jan". Imię/nazwisko muszą zaczynać się
// wielką literą, więc "jestem zainteresowany" nie zostanie złapane.
const NAME_TOKEN = "[A-ZŁŚŻŹĆĄĘÓŃ][a-ząćęłńóśżź]+(?:-[A-ZŁŚŻŹĆĄĘÓŃ][a-ząćęłńóśżź]+)?";
const NAME_RE = new RegExp(
  `(?:[Jj]estem|[Nn]azywam si[ęe]|[Mm]am na imi[ęe]|[Zz] tej strony|[Pp]ozdrawiam|[Zz] powa[żz]aniem|[Ii]mi[ęe] i nazwisko:?)\\s+(${NAME_TOKEN})(?:\\s+(${NAME_TOKEN}))?`,
  "g",
);

// Wiadomość powitalna z reklamy leadowej FB — Messenger wstawia blok:
// "Full name: Michał Szpak\nPhone number: 609 657 140\nEmail: x@y.pl".
// To najpewniejsze źródło danych, parsujemy je wprost.
const FORM_NAME_RE = /(?:Full name|Imi[ęe] i nazwisko|Name)\s*[:\-]\s*([^\n\r]{2,60})/i;
const FORM_PHONE_RE = /(?:Phone(?: number)?|Telefon|Nr telefonu)\s*[:\-]\s*(\+?[\d][\d \-]{7,17})/i;
const FORM_EMAIL_RE = /E-?mail\s*[:\-]\s*([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/i;

function normalizePhone(p: string): string | null {
  const digits = p.replace(/\D/g, "");
  if (p.trim().startsWith("+") && digits.length >= 9) return `+${digits}`;
  if (digits.length === 9) return `+48${digits}`;
  if (digits.length === 11 && digits.startsWith("48")) return `+${digits}`;
  return null;
}

// Słowa, które pasują do wzorca, ale nie są imieniem.
const NAME_STOPWORDS = new Set([
  "Serdecznie", "Cieplutko", "Gorąco", "Państwa", "Pana", "Panią", "Pani",
  "Was", "Ciebie", "Cię", "Bardzo", "Wszystkich", "Zainteresowany", "Zainteresowana",
]);

export function extractInboundFacts(rawText: string | null | undefined): ExtractedFacts {
  const out: ExtractedFacts = {
    kwNumbers: [], loanAmount: null, propertyValue: null, city: null,
    firstName: null, lastName: null, email: null, phone: null,
  };
  if (!rawText) return out;

  // Blok formularza z reklamy FB — parsujemy PRZED stripNoise (usuwa e-maile).
  const formEmail = FORM_EMAIL_RE.exec(rawText);
  if (formEmail) out.email = formEmail[1].toLowerCase();
  const formPhone = FORM_PHONE_RE.exec(rawText);
  if (formPhone) out.phone = formPhone[1].trim();
  const formName = FORM_NAME_RE.exec(rawText);
  if (formName) {
    const parts = formName[1].trim().split(/\s+/).filter(Boolean);
    if (parts[0]) out.firstName = parts[0];
    if (parts.length > 1) out.lastName = parts.slice(1).join(" ");
  }

  const text = stripNoise(rawText);

  // Telefon poza formularzem — tylko w jednoznacznych sytuacjach:
  // (a) cała wiadomość to numer (odpowiedź na pytanie o telefon),
  // (b) numer z prefiksem +48, (c) numer po słowie tel/telefon/numer/kontakt.
  if (!out.phone) {
    const trimmed = text.trim();
    if (/^(?:\+?48[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3}$/.test(trimmed)) {
      out.phone = trimmed;
    } else {
      const ctx =
        /(?:tel\.?|telefon\p{L}*|numer\p{L}*|kontakt\p{L}*|dzwoni[ćc]|zadzwo[ńn]\p{L}*)[^\d\n]{0,20}((?:\+?48[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3})(?!\d)/iu.exec(text);
      const pref = /(\+48[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3})(?!\d)/.exec(text);
      if (ctx) out.phone = ctx[1].trim();
      else if (pref) out.phone = pref[1].trim();
    }
  }

  // KW — deduplikuj po znormalizowanej formie
  const kwSeen = new Set<string>();
  for (const m of text.matchAll(KW_RE)) {
    const norm = `${m[1].toUpperCase()}/${m[2]}/${m[3]}`;
    if (!kwSeen.has(norm)) {
      kwSeen.add(norm);
      out.kwNumbers.push(norm);
    }
  }

  // Pozycje słów "wartość/wycena/wart" — kwota do ~40 znaków za takim słowem
  // to wartość nieruchomości, nie kwota pożyczki.
  const valueCtxIdx: number[] = [];
  for (const v of text.matchAll(VALUE_CTX_RE)) valueCtxIdx.push(v.index ?? 0);

  // Kwota pożyczki vs wartość nieruchomości. Preferencje dla kwoty pożyczki:
  // 1) kwota ze słowem-kluczem prośby (kwota/pożyczka/potrzebuję/kredyt…),
  // 2) inaczej największa kwota poza kontekstem "wartość…".
  let bestKeywordAmt = 0;
  let bestPlainAmt = 0;
  let bestValueAmt = 0;
  for (const m of text.matchAll(AMOUNT_RE)) {
    const keyword = m[1];
    const unit = (m[4] ?? "").toLowerCase();
    if (!keyword && !unit) continue;
    const digits = m[2].replace(/[ .\u00a0]/g, "");
    let n = Number(digits);
    if (!Number.isFinite(n)) continue;
    if (m[3]) n = Number(`${digits}.${m[3]}`);
    if (unit.startsWith("tys")) n *= 1000;
    else if (unit === "mln" || unit === "m") n *= 1_000_000;
    // Odsiej numery telefonów / PESEL / lata (>=5000 zł, <=10 mln)
    if (n < 5000 || n > 10_000_000) continue;

    const digitIdx = (m.index ?? 0) + m[0].search(/\d/);
    const inValueCtx = valueCtxIdx.some((vi) => vi < digitIdx && digitIdx - vi <= 40);

    if (keyword) {
      if (n > bestKeywordAmt) bestKeywordAmt = n;
    } else if (inValueCtx) {
      if (n > bestValueAmt) bestValueAmt = n;
    } else if (n > bestPlainAmt) {
      bestPlainAmt = n;
    }
  }
  const bestAmt = bestKeywordAmt || bestPlainAmt;
  if (bestAmt > 0) out.loanAmount = Math.round(bestAmt * 100) / 100;
  if (bestValueAmt > 0) out.propertyValue = Math.round(bestValueAmt * 100) / 100;

  // Miasto — pierwsze dopasowanie
  CITY_RE.lastIndex = 0;
  const cityMatch = CITY_RE.exec(text);
  if (cityMatch) out.city = cityMatch[1];

  // Imię i nazwisko z treści — tylko jeśli formularz FB ich nie podał
  if (!out.firstName) {
    for (const m of text.matchAll(NAME_RE)) {
      const first = m[1];
      const last = m[2] ?? null;
      if (NAME_STOPWORDS.has(first)) continue;
      out.firstName = first;
      out.lastName = last && !NAME_STOPWORDS.has(last) ? last : null;
      break;
    }
  }

  return out;
}

/**
 * Wzbogaca leada danymi wyekstrahowanymi z inbound message. Nieinwazyjnie —
 * dopisuje tylko nowe KW/amount/city do application_data. Następnie próbuje
 * awansować leada do loan_application, jeżeli komplet warunków jest spełniony.
 */
export async function enrichLeadFromInbound(opts: {
  leadId: string;
  text?: string | null;
  hasAttachments?: boolean;
}): Promise<{ updated: boolean; promoted: string | null }> {
  const s = admin();
  const { leadId } = opts;
  const facts = extractInboundFacts(opts.text ?? "");

  const { data: lead } = await s
    .from("leads")
    .select("id, first_name, last_name, email, phone_normalized, phone_raw, source, client_id, loan_application_id, application_data")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { updated: false, promoted: null };

  const appData = { ...(lead.application_data as Record<string, any> ?? {}) };
  const existingKw: string[] = Array.isArray(appData.kw_numbers) ? [...appData.kw_numbers] : [];
  const beforeKwLen = existingKw.length;
  for (const k of facts.kwNumbers) if (!existingKw.includes(k)) existingKw.push(k);

  let touched = false;
  if (existingKw.length !== beforeKwLen) {
    appData.kw_numbers = existingKw;
    touched = true;
  }
  if (facts.loanAmount && !appData.loan_amount) {
    appData.loan_amount = facts.loanAmount;
    touched = true;
  }
  if (facts.city && !appData.city) {
    appData.city = facts.city;
    touched = true;
  }
  if (facts.propertyValue && !appData.property_value) {
    appData.property_value = facts.propertyValue;
    touched = true;
  }
  // Imię, nazwisko, e-mail i telefon z treści rozmowy — uzupełnij tylko
  // brakujące pola, aby lead od razu był podpisany danymi klienta.
  const namePatch: Record<string, string> = {};
  if (facts.firstName && !lead.first_name) namePatch.first_name = facts.firstName;
  if (facts.lastName && !lead.last_name) namePatch.last_name = facts.lastName;
  if (facts.email && !lead.email) namePatch.email = facts.email;
  if (facts.phone && !lead.phone_raw && !lead.phone_normalized) {
    namePatch.phone_raw = facts.phone;
    const norm = normalizePhone(facts.phone);
    if (norm) namePatch.phone_normalized = norm;
  }
  if (Object.keys(namePatch).length > 0) touched = true;

  if (touched) {
    appData.enriched_at = new Date().toISOString();
    await s.from("leads").update({ ...namePatch, application_data: appData as any }).eq("id", leadId);
  }

  // Jeśli lead ma już wniosek, dopisz nowe KW / kwotę bezpośrednio do niego.
  if (lead.loan_application_id) {
    await backfillApplicationFromFacts(lead.loan_application_id, appData, facts);
    return { updated: touched, promoted: null };
  }

  const promoted = await maybePromoteLeadToApplication(leadId);
  return { updated: touched, promoted };
}

/**
 * Dopisuje do istniejącego wniosku pożyczkowego dane wyekstrahowane z rozmowy:
 * brakującą kwotę pożyczki oraz nowe numery KW (jako properties).
 */
async function backfillApplicationFromFacts(
  loanId: string,
  appData: Record<string, any>,
  facts: ExtractedFacts,
) {
  const s = admin();
  const { data: loan } = await s
    .from("loan_applications")
    .select("id, loan_amount")
    .eq("id", loanId)
    .maybeSingle();
  if (!loan) return;

  if (facts.loanAmount && !loan.loan_amount) {
    await s.from("loan_applications").update({ loan_amount: facts.loanAmount }).eq("id", loanId);
  }

  const allKws: string[] = Array.isArray(appData.kw_numbers) ? appData.kw_numbers : [];
  const kwsToAdd = new Set([...(facts.kwNumbers ?? []), ...allKws]);
  if (kwsToAdd.size === 0) return;
  const { data: existingProps } = await s
    .from("properties")
    .select("land_register_number")
    .eq("loan_application_id", loanId);
  const existing = new Set(
    (existingProps ?? [])
      .map((p: any) => (p.land_register_number ?? "").trim().toUpperCase())
      .filter(Boolean),
  );
  const fresh = Array.from(kwsToAdd).filter((k) => !existing.has(k.trim().toUpperCase()));
  if (fresh.length === 0) return;
  const propertyType = mapPropertyType(appData.typ_nieruchomosci ?? appData.property_type);
  const estimatedValue: number | null =
    typeof appData.property_value === "number" ? appData.property_value : null;
  const rows = fresh.map((kw) => ({
    loan_application_id: loanId,
    property_type: propertyType as any,
    city: (appData.city as string | null) ?? null,
    land_register_number: kw,
    estimated_value: estimatedValue,
  }));
  const { error } = await s.from("properties").insert(rows as any);
  if (error) console.error("[lead-enrichment] backfill properties error", error);
}

/**
 * Mapuje typ nieruchomości zapisany przez bota / z rozmowy (typ_nieruchomosci,
 * np. "dom", "lokal użytkowy") na wartość enuma property_type w bazie.
 */
export function mapPropertyType(raw: unknown): string {
  const t = String(raw ?? "").toLowerCase();
  if (!t) return "mieszkanie";
  if (t.includes("dom")) return "dom";
  if (t.includes("mieszk")) return "mieszkanie";
  if (t.includes("lokal") || t.includes("usług") || t.includes("uslug") || t.includes("użytk") || t.includes("uzytk")) return "lokal_uslugowy";
  if (t.includes("działk") || t.includes("dzialk") || t.includes("budowlan")) return "dzialka_budowlana";
  if (t.includes("grunt") || t.includes("rolny") || t.includes("rolna")) return "grunt_rolny";
  if (t.includes("udział") || t.includes("udzial")) return "udzial_w_nieruchomosci";
  return "inna";
}

/**
 * Jeżeli lead nie ma jeszcze loan_application_id, a zebrał KW + kwotę + co
 * najmniej jeden załącznik (lead_communications.attachments albo dokument),
 * tworzy klienta (jeśli brak), wniosek i properties per KW.
 */
export async function maybePromoteLeadToApplication(leadId: string): Promise<string | null> {
  const s = admin();
  const { data: lead } = await s
    .from("leads")
    .select("id, first_name, last_name, email, phone_normalized, phone_raw, source, client_id, loan_application_id, application_data")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead || lead.loan_application_id) return null;

  const appData = (lead.application_data as Record<string, any>) ?? {};
  // Tylko poprawne numery KW — bot potrafił zapisać status ("PRZESŁANY")
  // zamiast numeru i taki tekst trafiał do properties.land_register_number.
  const kwNumbers: string[] = (Array.isArray(appData.kw_numbers) ? appData.kw_numbers : [])
    .map((k: unknown) => normalizeKwNumber(k))
    .filter((k: string | null): k is string => !!k);
  // Bot potrafi zapisać kwotę jako string ("60000") — akceptuj też liczbę w tekście.
  const rawAmount = appData.loan_amount;
  const loanAmount: number | null =
    typeof rawAmount === "number" && Number.isFinite(rawAmount)
      ? rawAmount
      : rawAmount != null && Number.isFinite(Number(rawAmount)) && Number(rawAmount) > 0
        ? Number(rawAmount)
        : null;
  if (kwNumbers.length === 0 || !loanAmount) return null;

  // Sprawdź czy są jakiekolwiek załączniki na lead_communications lub dokumenty
  const { data: commsWithAtts } = await s
    .from("lead_communications")
    .select("id, attachments")
    .eq("lead_id", leadId);
  const hasCommAtts = (commsWithAtts ?? []).some((c: any) =>
    Array.isArray(c.attachments) && c.attachments.length > 0,
  );
  if (!hasCommAtts) return null;

  // 1) Klient — użyj istniejącego lub utwórz minimalnego
  let clientId = lead.client_id as string | null;
  if (!clientId) {
    const { data: c, error: cErr } = await s
      .from("clients")
      .insert({
        // Bez zmyślonego nazwiska "z leada" — jawny brak danych, do
        // uzupełnienia przez bota/admina zanim wniosek pójdzie do inwestorów.
        first_name: lead.first_name ?? "Klient",
        last_name: lead.last_name ?? "(brak nazwiska)",
        email: lead.email ?? null,
        phone: lead.phone_normalized ?? lead.phone_raw ?? null,
        phone_raw: lead.phone_raw ?? null,
        phone_normalized: lead.phone_normalized ?? null,
        city: appData.city ?? null,
        source: lead.source ?? "inbound_enrichment",
        consent_rodo: true,
      })
      .select("id")
      .maybeSingle();
    if (cErr || !c) {
      console.error("[lead-enrichment] client insert error", cErr);
      return null;
    }
    clientId = c.id;
  }

  // 2) Wniosek pożyczkowy
  const { data: loan, error: lErr } = await s
    .from("loan_applications")
    .insert({
      client_id: clientId,
      status: "nowy_lead",
      loan_amount: loanAmount,
      source: `inbound_enrichment:${lead.source ?? "unknown"}`,
    })
    .select("id")
    .maybeSingle();
  if (lErr || !loan) {
    console.error("[lead-enrichment] loan insert error", lErr);
    return null;
  }

  // 3) Properties per KW — typ z danych zebranych przez bota (typ_nieruchomosci),
  //    wartość z rozmowy (property_value), miasto z ekstrakcji.
  const propertyType = mapPropertyType(appData.typ_nieruchomosci ?? appData.property_type);
  const estimatedValue: number | null =
    typeof appData.property_value === "number" ? appData.property_value : null;
  const propRows = kwNumbers.map((kw) => ({
    loan_application_id: loan.id,
    property_type: propertyType as any,
    city: (appData.city as string | null) ?? null,
    land_register_number: kw,
    estimated_value: estimatedValue,
  }));
  const { error: pErr } = await s.from("properties").insert(propRows as any);
  if (pErr) console.error("[lead-enrichment] properties insert error", pErr);

  // 4) Link lead → wniosek/klient
  await s
    .from("leads")
    .update({ loan_application_id: loan.id, client_id: clientId, status: "wniosek" as any })
    .eq("id", leadId);

  // 5) Przepnij wcześniej zapisane załączniki (documents.loan_application_id)
  //    które trafiły do bucketu z prefiksem leads/{leadId}/ ale bez wniosku
  await s
    .from("documents")
    .update({ loan_application_id: loan.id })
    .is("loan_application_id", null)
    .like("file_path", `leads/${leadId}/%`);

  // 6) Załączniki z rozmów (zdjęcia z Messengera/maili sprzed powstania
  //    wniosku) → rekordy documents, żeby były widoczne we wniosku.
  const attRows: Record<string, any>[] = [];
  for (const c of commsWithAtts ?? []) {
    for (const a of (Array.isArray((c as any).attachments) ? (c as any).attachments : []) as any[]) {
      if (!a?.path) continue;
      attRows.push({
        loan_application_id: loan.id,
        document_type: "attachment_inbound",
        file_name: a.name ?? String(a.path).split("/").pop(),
        file_path: a.path,
        file_url: a.path,
        status: "received",
        visibility_level: "pelne",
      });
    }
  }
  if (attRows.length > 0) {
    const { data: existingDocs } = await s
      .from("documents")
      .select("file_path")
      .in("file_path", attRows.map((r) => r.file_path));
    const seenPaths = new Set((existingDocs ?? []).map((d: any) => d.file_path));
    const fresh = attRows.filter((r) => !seenPaths.has(r.file_path));
    if (fresh.length > 0) {
      const { error: dErr } = await s.from("documents").insert(fresh as any);
      if (dErr) console.error("[lead-enrichment] comm attachments -> documents error", dErr);
    }
  }

  return loan.id;
}
