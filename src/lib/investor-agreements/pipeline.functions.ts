// Jeden pipeline inwestora — server functions kroków 1–4 (dane pożyczkodawcy,
// rachunek do spłaty, KYC, screening list sankcyjnych) oraz zagregowany stan
// dla kolorowego steppera w panelu.
//
// Kroki 5–9 (doręczenie, umowa ramowa, NDA, RODO, Zlecenie) żyją w
// legal-pack.functions.ts — tutaj tylko spinamy je w jeden widok i jedną
// bramkę kolejności (computeInvestorPipeline).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectPolishBankAccount } from "@/lib/polish-bank";
import { isValidNip, isValidPostalCode, normalizeNip } from "@/lib/access/core";
import {
  computeInvestorPipeline,
  type PipelineInput,
  type KycStatus,
  type ScreeningResult,
} from "@/lib/investor-plan/pipeline";

// Typy wygenerowane dla Supabase nie znają jeszcze kolumn tej migracji.
const loose = (c: unknown) => c as any;

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return loose(supabaseAdmin);
}

const INVESTOR_COLUMNS =
  "id, user_id, entity_variant, is_consumer, first_name, last_name, company_name, email, phone, " +
  "pesel, nip, krs, regon, legal_form, address, street, city, postal_code, country, " +
  "representative_first_name, representative_last_name, representative_role, " +
  "bank_account, bank_account_bank_name, bank_account_confirmed_at, " +
  "lender_data_completed_at, lender_lookup_source, lender_lookup_at, " +
  "screening_id, screening_result, screening_updated_at";

async function myInvestor(db: any, userId: string) {
  const { data } = await db
    .from("investors")
    .select(INVESTOR_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/** Mapowanie statusu sesji Didit → status kroku KYC w pipelinie. */
export function mapKycStatus(status: string | null | undefined): KycStatus {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
      return "approved";
    case "declined":
      return "rejected";
    case "in review":
      return "manual_review";
    case "expired":
    case "abandoned":
      return "expired";
    case "":
      return "not_started";
    default:
      return "pending";
  }
}

// ── Krok 1: dane pożyczkodawcy ──────────────────────────────────────────────

const LenderSchema = z
  .object({
    entityVariant: z.enum(["osoba_fizyczna", "jdg", "osoba_prawna"]),
    isConsumer: z.boolean(),
    firstName: z.string().trim().max(120).optional().nullable(),
    lastName: z.string().trim().max(120).optional().nullable(),
    pesel: z.string().trim().max(11).optional().nullable(),
    companyName: z.string().trim().max(300).optional().nullable(),
    nip: z.string().trim().max(20).optional().nullable(),
    krs: z.string().trim().max(20).optional().nullable(),
    regon: z.string().trim().max(20).optional().nullable(),
    legalForm: z.string().trim().max(120).optional().nullable(),
    representativeFirstName: z.string().trim().max(120).optional().nullable(),
    representativeLastName: z.string().trim().max(120).optional().nullable(),
    representativeRole: z.string().trim().max(120).optional().nullable(),
    street: z.string().trim().min(1).max(300),
    postalCode: z.string().trim().min(1).max(12),
    city: z.string().trim().min(1).max(120),
    country: z.string().trim().max(2).optional().default("PL"),
    email: z.string().trim().email().max(255),
    phone: z.string().trim().min(6).max(30),
    lookupSource: z.enum(["gus", "krs", "reczne"]).default("reczne"),
  })
  .refine((v) => !(v.entityVariant === "osoba_prawna" && v.isConsumer), {
    message: "Osoba prawna nie może być Konsumentem.",
  });

export type LenderDataInput = z.infer<typeof LenderSchema>;

/**
 * Walidacja kompletu danych strony umowy. Osoba fizyczna: imię, nazwisko,
 * PESEL. JDG i spółka: nazwa i poprawny NIP (spółka dodatkowo reprezentacja).
 * Zwraca listę błędów — pusta oznacza komplet.
 */
export function validateLenderData(input: LenderDataInput): string[] {
  const errors: string[] = [];
  const req = (v: unknown, label: string) => {
    if (!v || !String(v).trim()) errors.push(label);
  };

  if (input.entityVariant === "osoba_fizyczna") {
    req(input.firstName, "Podaj imię");
    req(input.lastName, "Podaj nazwisko");
    const pesel = String(input.pesel ?? "").replace(/\D/g, "");
    if (!/^\d{11}$/.test(pesel)) errors.push("Podaj poprawny PESEL (11 cyfr)");
  } else {
    req(input.companyName, "Podaj pełną nazwę firmy");
    if (!input.nip || !isValidNip(input.nip)) errors.push("Podaj poprawny NIP");
    if (input.entityVariant === "osoba_prawna") {
      req(input.representativeFirstName, "Podaj imię osoby reprezentującej");
      req(input.representativeLastName, "Podaj nazwisko osoby reprezentującej");
      req(input.representativeRole, "Podaj funkcję osoby reprezentującej");
    }
  }

  req(input.street, "Podaj ulicę i numer");
  if (!isValidPostalCode(input.postalCode)) errors.push("Nieprawidłowy kod pocztowy (00-000)");
  req(input.city, "Podaj miejscowość");
  req(input.email, "Podaj adres e-mail");
  req(input.phone, "Podaj numer telefonu");
  return errors;
}

/** Krok 1: zapis danych pożyczkodawcy (po wyszukaniu w GUS/KRS albo ręcznie). */
export const saveLenderData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => LenderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const errors = validateLenderData(data);
    if (errors.length > 0) throw new Error(errors[0]);

    const db = await adminDb();
    const nowIso = new Date().toISOString();
    const isCompany = data.entityVariant !== "osoba_fizyczna";
    const street = data.street.trim();
    const patch = {
      user_id: context.userId,
      entity_variant: data.entityVariant,
      is_consumer: data.isConsumer,
      first_name: data.firstName?.trim() || null,
      last_name: data.lastName?.trim() || null,
      pesel:
        data.entityVariant === "osoba_fizyczna"
          ? String(data.pesel ?? "").replace(/\D/g, "")
          : null,
      company_name: isCompany ? data.companyName?.trim() || null : null,
      nip: isCompany ? normalizeNip(data.nip ?? "") : null,
      krs: isCompany ? String(data.krs ?? "").replace(/\D/g, "") || null : null,
      regon: isCompany ? String(data.regon ?? "").replace(/\D/g, "") || null : null,
      legal_form: isCompany ? data.legalForm?.trim() || null : null,
      representative_first_name: data.representativeFirstName?.trim() || null,
      representative_last_name: data.representativeLastName?.trim() || null,
      representative_role: data.representativeRole?.trim() || null,
      street,
      address: street,
      postal_code: data.postalCode.trim(),
      city: data.city.trim(),
      country: (data.country || "PL").toUpperCase(),
      email: data.email.trim(),
      phone: data.phone.trim(),
      lender_data_completed_at: nowIso,
      lender_lookup_source: data.lookupSource,
      lender_lookup_at: data.lookupSource === "reczne" ? null : nowIso,
    };

    const existing = await myInvestor(db, context.userId);
    if (existing) {
      const { error } = await db.from("investors").update(patch).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db
        .from("investors")
        .insert({ ...patch, investor_type: isCompany ? "instytucjonalny" : "indywidualny" });
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

// ── Krok 2: rachunek bankowy do spłaty pożyczki ─────────────────────────────

/** Krok 2: rachunek, na który pożyczkobiorca spłaca pożyczkę. Obowiązkowy. */
export const saveRepaymentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ account: z.string().trim().min(10).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const detected = detectPolishBankAccount(data.account);
    if (!detected.success) {
      throw new Error(
        detected.errorCode === "TOO_SHORT"
          ? "Numer rachunku jest za krótki — podaj pełny NRB (26 cyfr) albo IBAN."
          : "Nieprawidłowy numer rachunku — suma kontrolna się nie zgadza.",
      );
    }

    const db = await adminDb();
    const investor = await myInvestor(db, context.userId);
    if (!investor) {
      throw new Error("Najpierw uzupełnij krok 1 — dane pożyczkodawcy.");
    }
    const { error } = await db
      .from("investors")
      .update({
        bank_account: detected.normalized,
        bank_account_bank_name: detected.bankName,
        bank_account_confirmed_at: new Date().toISOString(),
      })
      .eq("id", investor.id);
    if (error) throw new Error(error.message);

    return {
      ok: true as const,
      normalized: detected.normalized,
      bankName: detected.bankName,
    };
  });

// ── Krok 4: screening list sankcyjnych / PEP (Dilisense) ────────────────────

/**
 * Klasyfikacja trafień. Potwierdzenie sankcji to ZAWSZE decyzja człowieka
 * (compliance w panelu administratora) — automat kieruje wyłącznie do analizy.
 */
export function classifyInvestorScreening(records: unknown[]): ScreeningResult {
  if (!records.length) return "clear";
  let pep = false;
  let sanction = false;
  for (const rec of records) {
    const r = rec as { source_type?: string; pep_type?: string };
    const t = String(r.source_type ?? "").toUpperCase();
    if (t.includes("SANCTION")) sanction = true;
    if (t.includes("PEP") || r.pep_type) pep = true;
  }
  if (sanction) return "possible_match";
  if (pep) return "pep_review_required";
  return "manual_review";
}

function screeningSubject(investor: any): { kind: "osoba" | "podmiot"; name: string } | null {
  if (investor?.entity_variant === "osoba_prawna" && investor?.company_name) {
    return { kind: "podmiot", name: String(investor.company_name).trim() };
  }
  const name = [investor?.first_name, investor?.last_name].filter(Boolean).join(" ").trim();
  if (name) return { kind: "osoba", name };
  if (investor?.company_name)
    return { kind: "podmiot", name: String(investor.company_name).trim() };
  return null;
}

async function runScreening(db: any, userId: string, investor: any) {
  const subject = screeningSubject(investor);
  if (!subject) throw new Error("Brak danych do screeningu — uzupełnij krok 1.");

  const { checkIndividual, checkEntity } = await import("@/lib/aml/dilisense.server");
  let result: ScreeningResult;
  let raw: unknown = null;
  let totalHits = 0;
  try {
    const res =
      subject.kind === "podmiot"
        ? await checkEntity({ names: subject.name })
        : await checkIndividual({ names: subject.name });
    raw = res.raw;
    totalHits = res.totalHits;
    result = classifyInvestorScreening(res.foundRecords);
  } catch (e) {
    // Błąd dostawcy nie może po cichu przepuścić inwestora dalej.
    raw = { error: e instanceof Error ? e.message : String(e) };
    result = "manual_review";
  }

  const { data: row, error } = await db
    .from("investor_screenings")
    .insert({
      user_id: userId,
      subject_kind: subject.kind,
      subject_name: subject.name,
      query: { names: subject.name },
      raw_result: raw,
      total_hits: totalHits,
      result,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const { error: updErr } = await db
    .from("investors")
    .update({
      screening_id: row.id,
      screening_result: result,
      screening_updated_at: new Date().toISOString(),
    })
    .eq("id", investor.id);
  if (updErr) throw new Error(updErr.message);

  return { result, totalHits };
}

/** Krok 4: uruchomienie screeningu. Wymaga pozytywnego KYC (krok 3). */
export const runMySanctionsScreening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const investor = await myInvestor(db, context.userId);
    if (!investor) throw new Error("Najpierw uzupełnij krok 1 — dane pożyczkodawcy.");
    if (!investor.bank_account_confirmed_at) {
      throw new Error("Najpierw podaj rachunek do spłaty pożyczki (krok 2).");
    }

    const { data: didit } = await db
      .from("didit_verifications")
      .select("status")
      .eq("vendor_data", `investor:${context.userId}`)
      .eq("status", "Approved")
      .limit(1)
      .maybeSingle();
    if (!didit) {
      throw new Error("Screening uruchamiamy po pozytywnej weryfikacji tożsamości (krok 3).");
    }

    return { ok: true as const, ...(await runScreening(db, context.userId, investor)) };
  });

// ── Zagregowany stan pipeline'u ─────────────────────────────────────────────

/** Dane pożyczkodawcy zwracane do panelu (serializowalny, jawny kształt). */
export interface LenderView {
  entity_variant: string | null;
  is_consumer: boolean | null;
  first_name: string | null;
  last_name: string | null;
  pesel: string | null;
  company_name: string | null;
  nip: string | null;
  krs: string | null;
  regon: string | null;
  legal_form: string | null;
  representative_first_name: string | null;
  representative_last_name: string | null;
  representative_role: string | null;
  street: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  bank_account: string | null;
  lender_data_completed_at: string | null;
  lender_lookup_source: string | null;
}

function toLenderView(row: any): LenderView | null {
  if (!row) return null;
  const pick = (k: string) => (row[k] ?? null) as string | null;
  return {
    entity_variant: pick("entity_variant"),
    is_consumer: row.is_consumer ?? null,
    first_name: pick("first_name"),
    last_name: pick("last_name"),
    pesel: pick("pesel"),
    company_name: pick("company_name"),
    nip: pick("nip"),
    krs: pick("krs"),
    regon: pick("regon"),
    legal_form: pick("legal_form"),
    representative_first_name: pick("representative_first_name"),
    representative_last_name: pick("representative_last_name"),
    representative_role: pick("representative_role"),
    street: pick("street"),
    address: pick("address"),
    postal_code: pick("postal_code"),
    city: pick("city"),
    email: pick("email"),
    phone: pick("phone"),
    bank_account: pick("bank_account"),
    lender_data_completed_at: pick("lender_data_completed_at"),
    lender_lookup_source: pick("lender_lookup_source"),
  };
}

export interface InvestorPipelineState {
  investor: LenderView | null;
  tier: "podstawowy" | "pro";
  pipeline: ReturnType<typeof computeInvestorPipeline>;
  input: PipelineInput;
  kyc: { status: KycStatus; url: string | null; fullName: string | null } | null;
  screening: { result: ScreeningResult | null; updatedAt: string | null };
  bank: { account: string | null; bankName: string | null; confirmedAt: string | null };
}

/** Stan całego pipeline'u dla zalogowanego inwestora (jedno zapytanie dla UI). */
export const getInvestorPipelineState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvestorPipelineState> => {
    const userId = context.userId as string;
    const db = await adminDb();

    const [
      investor,
      { data: docs },
      { data: acceptances },
      { data: deliveries },
      { count: orders },
      { data: didit },
      { data: tier },
    ] = await Promise.all([
      myInvestor(db, userId),
      db.from("legal_documents").select("code, version, sha256, active").order("sort_order"),
      db
        .from("investor_agreement_acceptances")
        .select("document_code, version, sha256")
        .eq("user_id", userId),
      db.from("legal_deliveries").select("id").eq("user_id", userId).limit(1),
      db.from("investor_orders").select("id", { count: "exact", head: true }).eq("user_id", userId),
      db
        .from("didit_verifications")
        .select("status, decision, verification_url")
        .eq("vendor_data", `investor:${userId}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.rpc("investor_tier", { _user_id: userId }),
    ]);

    const acceptedSet = new Set(
      (acceptances ?? []).map((a: any) => `${a.document_code}:${a.version}:${a.sha256}`),
    );
    const activeDocs = (docs ?? []).filter((d: any) => d.active);

    const input: PipelineInput = {
      lenderDataCompleted: Boolean(investor?.lender_data_completed_at),
      repaymentAccountConfirmed: Boolean(
        investor?.bank_account && investor?.bank_account_confirmed_at,
      ),
      kycStatus: mapKycStatus(didit?.status),
      screeningResult: (investor?.screening_result ?? null) as ScreeningResult | null,
      delivered: (deliveries ?? []).length > 0,
      isConsumer: Boolean(investor?.is_consumer),
      documents: activeDocs.map((d: any) => ({
        code: d.code,
        accepted: acceptedSet.has(`${d.code}:${d.version}:${d.sha256}`),
      })),
      packActive: activeDocs.length > 0,
      ordersCount: Number(orders ?? 0),
    };

    let fullName: string | null = null;
    if (didit?.status === "Approved") {
      const { extractDiditPersonalData } = await import("@/lib/didit.server");
      fullName = extractDiditPersonalData(didit.decision)?.fullName ?? null;
    }

    return {
      investor: toLenderView(investor),
      tier: (tier as "podstawowy" | "pro") ?? "podstawowy",
      pipeline: computeInvestorPipeline(input),
      input,
      kyc: didit
        ? { status: input.kycStatus, url: didit.verification_url ?? null, fullName }
        : null,
      screening: {
        result: input.screeningResult,
        updatedAt: (investor?.screening_updated_at ?? null) as string | null,
      },
      bank: {
        account: (investor?.bank_account ?? null) as string | null,
        bankName: (investor?.bank_account_bank_name ?? null) as string | null,
        confirmedAt: (investor?.bank_account_confirmed_at ?? null) as string | null,
      },
    };
  });
