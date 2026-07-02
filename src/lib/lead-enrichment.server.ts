// Uniwersalna ekstrakcja danych z wiadomości inbound (email/messenger/sms/wa)
// oraz automatyczna promocja leada do loan_application, gdy zebrane są
// minimalne dane: KW + kwota + jakikolwiek załącznik/dokument.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type ExtractedFacts = {
  kwNumbers: string[];
  loanAmount: number | null;
  city: string | null;
};

const KW_RE =
  /\b([A-ZŁŃŚŻŹĄĆĘÓ0-9]{2}\d[A-Z0-9])[\s\/\\.-]{0,3}(\d{7,8})[\s\/\\.-]{0,3}(\d)\b/g;

// "100 000 zł", "100.000 PLN", "50 tys", "1,2 mln zł", "kwota: 250000"
const AMOUNT_RE =
  /(?:\b(?:kwota|pożyczka|potrzebuj[eę]|pożyczy[ćc]|wnioskuj[eę]|potrzeba)[^0-9]{0,30})?(\d{1,3}(?:[ .\u00a0]\d{3})+|\d{4,7})(?:[.,](\d{1,2}))?\s*(z[łl]|pln|tys(?:i[aą]c)?\.?|mln|m)?/gi;

const CITY_RE =
  /\b(?:z|w|do|nieruchomo[śs][ćc]\s*w|dzia[łl]ka\s*w|mieszkanie\s*w)\s+([A-ZŁŚŻŹĆĄĘÓŃ][a-ząćęłńóśżź]{2,}(?:[- ][A-ZŁŚŻŹĆĄĘÓŃ]?[a-ząćęłńóśżź]{2,})?)/g;

export function extractInboundFacts(text: string | null | undefined): ExtractedFacts {
  const out: ExtractedFacts = { kwNumbers: [], loanAmount: null, city: null };
  if (!text) return out;

  // KW — deduplikuj po znormalizowanej formie
  const kwSeen = new Set<string>();
  for (const m of text.matchAll(KW_RE)) {
    const norm = `${m[1].toUpperCase()}/${m[2]}/${m[3]}`;
    if (!kwSeen.has(norm)) {
      kwSeen.add(norm);
      out.kwNumbers.push(norm);
    }
  }

  // Kwota — wybierz największą wiarygodną wartość w PLN
  let bestAmt = 0;
  for (const m of text.matchAll(AMOUNT_RE)) {
    const digits = m[1].replace(/[ .\u00a0]/g, "");
    let n = Number(digits);
    if (!Number.isFinite(n)) continue;
    if (m[2]) n = Number(`${digits}.${m[2]}`);
    const unit = (m[3] ?? "").toLowerCase();
    if (unit.startsWith("tys")) n *= 1000;
    else if (unit === "mln" || unit === "m") n *= 1_000_000;
    // Odsiej numery telefonów / PESEL / lata (>=5000 zł, <=10 mln)
    if (n >= 5000 && n <= 10_000_000 && n > bestAmt) bestAmt = n;
  }
  if (bestAmt > 0) out.loanAmount = Math.round(bestAmt * 100) / 100;

  // Miasto — pierwsze dopasowanie
  const cityMatch = CITY_RE.exec(text);
  if (cityMatch) out.city = cityMatch[1];

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
  if (touched) {
    appData.enriched_at = new Date().toISOString();
    await s.from("leads").update({ application_data: appData as any }).eq("id", leadId);
  }

  const promoted = await maybePromoteLeadToApplication(leadId);
  return { updated: touched, promoted };
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
  const kwNumbers: string[] = Array.isArray(appData.kw_numbers) ? appData.kw_numbers : [];
  const loanAmount: number | null = typeof appData.loan_amount === "number" ? appData.loan_amount : null;
  if (kwNumbers.length === 0 || !loanAmount) return null;

  // Sprawdź czy są jakiekolwiek załączniki na lead_communications lub dokumenty
  const { data: commsWithAtts } = await s
    .from("lead_communications")
    .select("id, attachments")
    .eq("lead_id", leadId);
  const hasCommAtts = (commsWithAtts ?? []).some((c: any) =>
    Array.isArray(c.attachments) && c.attachments.length > 0,
  );
  let hasDocs = hasCommAtts;
  if (!hasDocs && lead.client_id) {
    const { count } = await s
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("client_id", lead.client_id as any);
    if ((count ?? 0) > 0) hasDocs = true;
  }
  if (!hasDocs) return null;

  // 1) Klient — użyj istniejącego lub utwórz minimalnego
  let clientId = lead.client_id as string | null;
  if (!clientId) {
    const { data: c, error: cErr } = await s
      .from("clients")
      .insert({
        first_name: lead.first_name ?? "Klient",
        last_name: lead.last_name ?? "z leada",
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

  // 3) Properties per KW
  const propRows = kwNumbers.map((kw) => ({
    loan_application_id: loan.id,
    property_type: "mieszkanie" as any,
    city: (appData.city as string | null) ?? null,
    land_register_number: kw,
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

  return loan.id;
}
