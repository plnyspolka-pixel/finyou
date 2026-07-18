// Automatyczna analiza ryzyka po skompletowaniu wniosku.
// Zasada: gdy wniosek ma komplet danych (kontakt + kwota + KW + zdjęcia/
// dokumenty) — albo brakuje mu WYŁĄCZNIE imienia i nazwiska klienta —
// system sam dociąga właściciela z działu II KW (cache kw_documents,
// w razie potrzeby płatne pobranie z CMD KW Engine), uzupełnia klienta
// i leada, po czym odpala pełną ocenę ryzyka inwestycji.
// runInvestmentRiskAssessmentCore jest idempotentna (cache per wniosek),
// więc wołanie z wielu miejsc jest tanie i bezpieczne.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  decodeMaybeBase64,
  fetchAndStoreKw,
  hasCmdConfig,
  normalizeKwNumber as normalizeKwCompact,
} from "@/lib/kw-fetch.server";
import { extractKwOwnerPersons } from "./kw-parser.server";
import { runInvestmentRiskAssessmentCore } from "./risk-assessment.functions";
import { assessWnioskCompleteness, isRealNamePart } from "./auto-risk-rules";

// Tabela investment_risk_assessments nie jest w wygenerowanych typach —
// dostęp przez rzutowanie (jak w risk-assessment.functions.ts).
const db = supabaseAdmin as unknown as { from: (t: string) => any; rpc: (fn: string, args?: any) => any };

// Statusy, w których auto-status (i auto-analiza) nie ingerują — jak w
// compute_loan_auto_status. Wniosek jest już za etapem szukania inwestora
// albo zamknięty/odrzucony.
const ADVANCED_STATUSES = new Set([
  "warunki_zaakceptowane", "dokumenty_przygotowanie_umowy", "notariusz", "zamkniete",
  "zaakceptowany_przez_klienta", "do_umowy", "oczekuje_podpisania_umowy", "umowa_podpisana",
  "oczekuje_ustanowienia_zabezpieczen", "zabezpieczenia_ustanowione",
  "dokumenty_dostarczone_do_inwestora", "oczekuje_wyplaty", "wyplacony",
  "wniosek_odrzucony", "nie_rokuje", "zamkniety", "archiwalny",
]);

// EKW zapisuje nazwiska CAPS-em ("JAN KOWALSKI") — do bazy trafiają "Jan Kowalski".
function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

// Prosty guard przed równoległym podwójnym uruchomieniem w tej samej
// instancji (kilka zdarzeń może domknąć wniosek niemal jednocześnie).
const inFlight = new Set<string>();

export type AutoRiskResult = {
  eligible: boolean;
  ran: boolean;
  nameFilledFromKw: boolean;
  reason: string;
};

/**
 * Sprawdza kompletność wniosku i — jeśli kwalifikuje się do automatycznej
 * analizy ryzyka — dociąga brakujące imię/nazwisko z KW i uruchamia ocenę.
 * Bezpieczna do wołania fire-and-forget z dowolnego miejsca po zapisie danych.
 */
export async function maybeAutoRunRiskAssessment(
  applicationId: string,
  opts: { allowKwOrder?: boolean } = {},
): Promise<AutoRiskResult> {
  const allowKwOrder = opts.allowKwOrder ?? true;
  const skip = (reason: string): AutoRiskResult => ({ eligible: false, ran: false, nameFilledFromKw: false, reason });

  if (inFlight.has(applicationId)) return skip("analiza już trwa");
  inFlight.add(applicationId);
  try {
    const { data: app } = await supabaseAdmin
      .from("loan_applications")
      .select("id, status, client_id, loan_amount")
      .eq("id", applicationId)
      .maybeSingle();
    if (!app) return skip("wniosek nie znaleziony");
    if (app.status && ADVANCED_STATUSES.has(String(app.status))) return skip(`status zaawansowany (${app.status})`);

    const [{ data: leads }, { data: client }, { data: props }, { count: docsCount }] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("id, first_name, last_name, email, phone_normalized, phone_raw, kw_number, application_data")
        .eq("loan_application_id", applicationId)
        .order("created_at", { ascending: false })
        .limit(1),
      app.client_id
        ? supabaseAdmin.from("clients").select("id, first_name, last_name, email, phone").eq("id", app.client_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      supabaseAdmin.from("properties").select("land_register_number, photos").eq("loan_application_id", applicationId),
      supabaseAdmin.from("documents").select("id", { count: "exact", head: true }).eq("loan_application_id", applicationId),
    ]);
    const lead = leads?.[0] ?? null;

    const c = assessWnioskCompleteness({
      loanAmount: app.loan_amount ?? null,
      lead: lead as any,
      client: client as any,
      properties: (props ?? []) as any,
      documentsCount: docsCount ?? 0,
    });

    if (!c.complete && !c.onlyNameMissing) {
      return skip(`niekompletny (brakuje: ${c.missing.join(", ")})`);
    }

    // Treść KW jest potrzebna i do dociągnięcia nazwiska, i do analizy stanu
    // prawnego (analyzeKwLegal czyta wyłącznie cache kw_documents).
    const kwReady = await ensureKwCached(c.kwCandidates, allowKwOrder);

    let nameFilled = false;
    if (c.onlyNameMissing) {
      nameFilled = await fillNamesFromKw({
        applicationId,
        clientId: app.client_id ?? null,
        leadId: lead?.id ?? null,
        kwCandidates: c.kwCandidates,
      });
      if (!nameFilled) {
        console.warn(
          `[auto-risk] ${applicationId}: nie udało się dociągnąć imienia i nazwiska z KW` +
            (kwReady ? " (dział II bez rozpoznanych osób fizycznych)" : " (treść KW niedostępna)") +
            " — analiza ruszy mimo to.",
        );
      }
    }

    // Idempotencja: jeśli ocena już istnieje, nie przeliczamy.
    try {
      const { data: existing } = await db
        .from("investment_risk_assessments")
        .select("application_id")
        .eq("application_id", applicationId)
        .maybeSingle();
      if (existing) return { eligible: true, ran: false, nameFilledFromKw: nameFilled, reason: "ocena już istnieje" };
    } catch {
      // brak tabeli / błąd odczytu — core i tak sam sprawdzi cache
    }

    console.log(`[auto-risk] ${applicationId}: wniosek kompletny — uruchamiam automatyczną analizę ryzyka.`);
    await runInvestmentRiskAssessmentCore(applicationId);
    return { eligible: true, ran: true, nameFilledFromKw: nameFilled, reason: "ok" };
  } catch (e: any) {
    console.error(`[auto-risk] ${applicationId}: błąd`, e?.message ?? e);
    return skip(`błąd: ${e?.message ?? "nieznany"}`);
  } finally {
    inFlight.delete(applicationId);
  }
}

/** Dowozi treść pierwszej dostępnej KW do cache (status "ready"). */
async function ensureKwCached(kwCandidates: string[], allowKwOrder: boolean): Promise<boolean> {
  for (const raw of kwCandidates.slice(0, 2)) {
    const kw = normalizeKwCompact(raw);
    if (!kw) continue;
    const { data: doc } = await supabaseAdmin
      .from("kw_documents")
      .select("status")
      .eq("kw_number", kw)
      .maybeSingle();
    if (doc?.status === "ready") return true;
    if (doc?.status === "not_found") continue;
    if (!allowKwOrder || !hasCmdConfig()) continue;
    const out = await fetchAndStoreKw(kw);
    if (out.status === "ready") return true;
  }
  return false;
}

/**
 * Uzupełnia brakujące/placeholderowe imię i nazwisko klienta (oraz leada)
 * właścicielem z działu II KW. Po zapisie odświeża auto-status wniosku —
 * update na clients nie przechodzi przez triggery statusowe.
 */
async function fillNamesFromKw(args: {
  applicationId: string;
  clientId: string | null;
  leadId: string | null;
  kwCandidates: string[];
}): Promise<boolean> {
  for (const raw of args.kwCandidates.slice(0, 2)) {
    const kw = normalizeKwCompact(raw);
    if (!kw) continue;
    const { data: doc } = await supabaseAdmin
      .from("kw_documents")
      .select("status, dzial_2")
      .eq("kw_number", kw)
      .maybeSingle();
    if (doc?.status !== "ready") continue;

    const persons = extractKwOwnerPersons(decodeMaybeBase64(doc.dzial_2));
    if (persons.length === 0) continue;
    const owner = persons[0];
    const firstName = titleCase(owner.firstName);
    const lastName = titleCase(owner.lastName);
    const allOwners = persons.map((p) => `${titleCase(p.firstName)} ${titleCase(p.lastName)}`);

    if (args.clientId) {
      const { data: cl } = await supabaseAdmin
        .from("clients")
        .select("first_name, last_name")
        .eq("id", args.clientId)
        .maybeSingle();
      const patch: Record<string, string> = {};
      if (!isRealNamePart(cl?.first_name)) patch.first_name = firstName;
      if (!isRealNamePart(cl?.last_name)) patch.last_name = lastName;
      if (Object.keys(patch).length > 0) {
        await supabaseAdmin.from("clients").update(patch as any).eq("id", args.clientId);
      }
    }

    if (args.leadId) {
      const { data: ld } = await supabaseAdmin
        .from("leads")
        .select("first_name, last_name, application_data")
        .eq("id", args.leadId)
        .maybeSingle();
      if (ld) {
        const appData = { ...((ld.application_data as Record<string, any>) ?? {}) };
        appData.kw_owners = allOwners;
        const patch: Record<string, any> = { application_data: appData };
        if (!isRealNamePart(ld.first_name)) patch.first_name = firstName;
        if (!isRealNamePart(ld.last_name)) patch.last_name = lastName;
        await supabaseAdmin.from("leads").update(patch as any).eq("id", args.leadId);
      }
    }

    // Update klienta nie odpala triggerów auto-statusu (są tylko na
    // loan_applications/properties/documents/leads) — przelicz jawnie.
    try {
      await db.rpc("apply_loan_auto_status", { _loan_id: args.applicationId });
    } catch {
      // best-effort — status i tak przeliczy się przy kolejnym zapisie
    }

    console.log(`[auto-risk] ${args.applicationId}: uzupełniono imię i nazwisko z działu II KW ${kw}.`);
    return true;
  }
  return false;
}

/**
 * Siatka bezpieczeństwa (cron): wyłapuje kompletne wnioski bez oceny ryzyka,
 * które domknęły się ścieżką bez serwerowego triggera (np. upload zdjęć
 * z panelu klienta). Limit chroni przed lawiną kosztownych analiz.
 */
export async function sweepAutoRiskAssessments(opts: { limit?: number } = {}): Promise<{
  checked: number;
  ran: number;
}> {
  const limit = opts.limit ?? 2;
  // Tylko świeżo aktualizowane wnioski — nie przeliczamy hurtowo archiwum.
  const since = new Date(Date.now() - 60 * 24 * 3600_000).toISOString();
  const { data: apps } = await supabaseAdmin
    .from("loan_applications")
    .select("id")
    .eq("status", "szukamy_inwestora")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(40);
  const ids = (apps ?? []).map((a) => a.id);
  if (ids.length === 0) return { checked: 0, ran: 0 };

  let done = new Set<string>();
  try {
    const { data: assessed } = await db
      .from("investment_risk_assessments")
      .select("application_id")
      .in("application_id", ids);
    done = new Set((assessed ?? []).map((r: any) => r.application_id));
  } catch {
    // brak tabeli — potraktuj wszystkie jako nieocenione
  }

  const pending = ids.filter((id) => !done.has(id)).slice(0, limit);
  let ran = 0;
  for (const id of pending) {
    const out = await maybeAutoRunRiskAssessment(id, { allowKwOrder: true });
    if (out.ran) ran += 1;
  }
  return { checked: pending.length, ran };
}
