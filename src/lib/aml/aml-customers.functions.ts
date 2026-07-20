/* eslint-disable @typescript-eslint/no-explicit-any -- tabele aml_* nie są jeszcze w wygenerowanych typach Database; luźny dostęp jak w module wind_* */
// Klienci i weryfikacje AML: profil klienta, CRBR, screening Dilisense
// (klient + reprezentanci + beneficjenci rzeczywiści), ocena trafień,
// unieważnianie screeningu przy zmianie danych oraz oceny ryzyka.
// Wywołania Dilisense wyłącznie przez backend — klucz w sekretach.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BLOCKING_RESOLUTIONS,
  type AmlHitResolution,
  type AmlRiskLevel,
} from "@/lib/aml/aml-types";
import { proposeRiskLevel, type RiskProposal } from "@/lib/aml/risk-proposal";

type Loose = { from: (t: string) => any };
const loose = (c: unknown) => c as Loose;

// ── Klienci ──────────────────────────────────────────────────────────
const CustomerInput = z.object({
  id: z.string().uuid().optional(),
  entityType: z.enum(["osoba_fizyczna", "firma"]),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  companyName: z.string().optional(),
  pesel: z.string().optional(),
  dob: z.string().optional(),
  nip: z.string().optional(),
  krs: z.string().optional(),
  regon: z.string().optional(),
  documentType: z.string().optional(),
  documentNumber: z.string().optional(),
  address: z.string().optional(),
  countryResidence: z.string().default("PL"),
  countryActivity: z.string().default("PL"),
  citizenship: z.string().optional(),
  financingPurpose: z.string().optional(),
  repaymentSource: z.string().optional(),
  clientId: z.string().uuid().optional(),
  loanApplicationId: z.string().uuid().optional(),
});

function customerDisplayName(c: any): string {
  return c.entity_type === "firma"
    ? (c.company_name ?? "")
    : [c.first_name, c.last_name].filter(Boolean).join(" ");
}

export const listAmlCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await loose(context.supabase)
      .from("aml_customers")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { customers: data ?? [] };
  });

export const upsertAmlCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CustomerInput.parse(data))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const row = {
      user_id: context.userId,
      entity_type: data.entityType,
      first_name: data.firstName ?? null,
      last_name: data.lastName ?? null,
      company_name: data.companyName ?? null,
      pesel: data.pesel ?? null,
      dob: data.dob || null,
      nip: data.nip?.replace(/\D/g, "") || null,
      krs: data.krs ?? null,
      regon: data.regon ?? null,
      document_type: data.documentType ?? null,
      document_number: data.documentNumber ?? null,
      address: data.address ?? null,
      country_residence: data.countryResidence,
      country_activity: data.countryActivity,
      citizenship: data.citizenship ?? null,
      financing_purpose: data.financingPurpose ?? null,
      repayment_source: data.repaymentSource ?? null,
      client_id: data.clientId ?? null,
      loan_application_id: data.loanApplicationId ?? null,
    };

    const { amlAudit } = await import("@/lib/aml/audit.server");

    if (data.id) {
      const { data: updated, error } = await db
        .from("aml_customers")
        .update(row)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      // Zmiana danych przed umową unieważnia aktualny screening.
      const { screeningFingerprint } = await import("@/lib/aml/dilisense.server");
      const fp = screeningFingerprint({
        name: customerDisplayName(updated),
        dob: updated.dob,
        representatives: (updated.representatives ?? []) as { name: string }[],
        beneficialOwners: (updated.beneficial_owners ?? []) as { name: string }[],
      });
      if (updated.screening_fingerprint && updated.screening_fingerprint !== fp) {
        await db
          .from("aml_screenings")
          .update({
            status: "invalidated",
            invalidated_at: new Date().toISOString(),
            invalidated_reason: "Zmiana danych klienta przed zawarciem umowy",
          })
          .eq("customer_id", updated.id)
          .in("status", ["clear", "review_required", "approved_after_review", "blocked"]);
        await db
          .from("aml_customers")
          .update({ screening_status: "invalidated", screening_fingerprint: null })
          .eq("id", updated.id);
        await amlAudit({
          userId: context.userId,
          entityType: "screening",
          entityId: updated.id,
          action: "screening_invalidated_data_change",
          details: {},
        });
        updated.screening_status = "invalidated";
      }
      await amlAudit({
        userId: context.userId,
        entityType: "customer",
        entityId: updated.id,
        action: "customer_updated",
        details: {},
      });
      return { customer: updated };
    }

    const { data: created, error } = await db
      .from("aml_customers")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await amlAudit({
      userId: context.userId,
      entityType: "customer",
      entityId: created.id,
      action: "customer_created",
      details: { entityType: data.entityType },
    });
    return { customer: created };
  });

// ── CRBR: pobranie beneficjentów i reprezentantów do profilu AML ─────
export const fetchCrbrForAmlCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ customerId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: customer, error } = await db
      .from("aml_customers")
      .select("*")
      .eq("id", data.customerId)
      .eq("user_id", context.userId)
      .single();
    if (error || !customer) throw new Error("Nie znaleziono klienta AML");
    if (customer.entity_type !== "firma") throw new Error("CRBR dotyczy wyłącznie firm");
    if (!customer.nip && !customer.krs) throw new Error("Podaj NIP albo KRS klienta");

    const { fetchCrbr } = await import("@/lib/crbr.server");
    const result = await fetchCrbr(
      { nip: customer.nip ?? undefined, krs: customer.krs ?? undefined },
      { force: false },
    );

    if (result.status !== "ok") {
      return { status: result.status, message: "message" in result ? result.message : "Błąd CRBR" };
    }

    const beneficialOwners = result.beneficialOwners.map((b) => ({
      name: [b.firstName, b.lastName].filter(Boolean).join(" "),
      firstName: b.firstName,
      lastName: b.lastName,
      pesel: b.pesel ?? null,
      dateOfBirth: b.dateOfBirth ?? null,
      role: b.role ?? null,
      sharePct: b.sharePercent ?? null,
      countryOfResidence: b.countryOfResidence ?? null,
    }));
    const representatives = result.representatives.map((r) => ({
      name: [r.firstName, r.lastName].filter(Boolean).join(" "),
      firstName: r.firstName,
      lastName: r.lastName,
      pesel: r.pesel ?? null,
      role: r.function ?? null,
      countryOfResidence: r.countryOfResidence ?? null,
    }));

    // Rozbieżności CRBR: dane rejestrowe vs dane w profilu AML.
    const discrepancies: { field: string; crbr: string; profile: string }[] = [];
    if (
      result.company.name &&
      customer.company_name &&
      result.company.name.trim().toLowerCase() !== customer.company_name.trim().toLowerCase()
    ) {
      discrepancies.push({
        field: "Nazwa firmy",
        crbr: result.company.name,
        profile: customer.company_name,
      });
    }
    if (result.company.nip && customer.nip && result.company.nip !== customer.nip) {
      discrepancies.push({ field: "NIP", crbr: result.company.nip, profile: customer.nip });
    }

    const { data: updated } = await db
      .from("aml_customers")
      .update({
        crbr_data: result.company,
        beneficial_owners: beneficialOwners,
        representatives,
        crbr_discrepancies: discrepancies,
        crbr_fetched_at: new Date().toISOString(),
      })
      .eq("id", customer.id)
      .select("*")
      .single();

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "customer",
      entityId: customer.id,
      action: "crbr_fetched",
      details: {
        beneficialOwners: beneficialOwners.length,
        representatives: representatives.length,
        discrepancies: discrepancies.length,
      },
    });
    return { status: "ok", customer: updated, discrepancies };
  });

// ── Screening Dilisense ──────────────────────────────────────────────
/**
 * Jednorazowy screening AML klienta przed zawarciem umowy:
 *  - osoba fizyczna → checkIndividual (names + dob + fuzzy_search=1),
 *  - firma → checkEntity (names + fuzzy_search=1) + checkIndividual dla
 *    każdego reprezentanta i beneficjenta rzeczywistego z CRBR.
 * Brak trafień = 'clear' (można zawrzeć umowę). Trafienia = 'review_required'.
 */
export const runAmlScreening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ customerId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: customer, error } = await db
      .from("aml_customers")
      .select("*")
      .eq("id", data.customerId)
      .eq("user_id", context.userId)
      .single();
    if (error || !customer) throw new Error("Nie znaleziono klienta AML");

    const { checkIndividual, checkEntity, screeningFingerprint } =
      await import("@/lib/aml/dilisense.server");
    const { amlAudit } = await import("@/lib/aml/audit.server");

    const name = customerDisplayName(customer);
    if (!name) throw new Error("Uzupełnij nazwę / imię i nazwisko klienta przed screeningiem");

    await db
      .from("aml_customers")
      .update({ screening_status: "in_progress" })
      .eq("id", customer.id);

    interface Subject {
      kind: "customer" | "representative" | "beneficial_owner";
      name: string;
      dob?: string | null;
      searchType: "individual" | "entity";
    }
    const subjects: Subject[] = [];
    if (customer.entity_type === "osoba_fizyczna") {
      subjects.push({ kind: "customer", name, dob: customer.dob, searchType: "individual" });
    } else {
      subjects.push({ kind: "customer", name, searchType: "entity" });
      for (const r of (customer.representatives ?? []) as { name: string }[]) {
        if (r.name)
          subjects.push({ kind: "representative", name: r.name, searchType: "individual" });
      }
      for (const b of (customer.beneficial_owners ?? []) as {
        name: string;
        dateOfBirth?: string | null;
      }[]) {
        if (b.name)
          subjects.push({
            kind: "beneficial_owner",
            name: b.name,
            dob: b.dateOfBirth,
            searchType: "individual",
          });
      }
    }

    const fingerprint = screeningFingerprint({
      name,
      dob: customer.dob,
      representatives: (customer.representatives ?? []) as { name: string }[],
      beneficialOwners: (customer.beneficial_owners ?? []) as { name: string }[],
    });

    let totalHits = 0;
    const screeningIds: string[] = [];
    try {
      for (const s of subjects) {
        // dob w formacie Dilisense (DD.MM.YYYY) — z ISO YYYY-MM-DD.
        const dob = s.dob ? s.dob.split("-").reverse().join(".") : undefined;
        const result =
          s.searchType === "individual"
            ? await checkIndividual({ names: s.name, dob })
            : await checkEntity({ names: s.name });
        totalHits += result.totalHits;
        const { data: created } = await db
          .from("aml_screenings")
          .insert({
            user_id: context.userId,
            customer_id: customer.id,
            subject_kind: s.kind,
            subject_name: s.name,
            subject_dob: s.dob || null,
            search_type: s.searchType,
            query: { names: s.name, dob: dob ?? null, fuzzy_search: 1 },
            raw_result: result.raw,
            total_hits: result.totalHits,
            status: result.totalHits > 0 ? "review_required" : "clear",
            fingerprint,
          })
          .select("id")
          .single();
        if (created) screeningIds.push(created.id);
      }
    } catch (e) {
      await db.from("aml_customers").update({ screening_status: "error" }).eq("id", customer.id);
      await db.from("aml_screenings").insert({
        user_id: context.userId,
        customer_id: customer.id,
        subject_kind: "customer",
        subject_name: name,
        search_type: customer.entity_type === "firma" ? "entity" : "individual",
        query: { names: name },
        status: "error",
        error_message: e instanceof Error ? e.message : String(e),
        fingerprint,
      });
      throw e;
    }

    const status = totalHits > 0 ? "review_required" : "clear";
    await db
      .from("aml_customers")
      .update({ screening_status: status, screening_fingerprint: fingerprint })
      .eq("id", customer.id);
    await amlAudit({
      userId: context.userId,
      entityType: "screening",
      entityId: customer.id,
      action: "screening_completed",
      details: { subjects: subjects.length, totalHits, status },
    });
    return { status, totalHits, screeningIds };
  });

export const listAmlScreenings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ customerId: z.string().uuid().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = loose(context.supabase)
      .from("aml_screenings")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.customerId) q = q.eq("customer_id", data.customerId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { screenings: rows ?? [] };
  });

/**
 * Ręczna ocena trafienia. Potwierdzona sankcja albo trafienie
 * nierozstrzygnięte blokuje zawarcie umowy (status 'blocked').
 */
export const resolveAmlScreening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        screeningId: z.string().uuid(),
        resolution: z.enum([
          "false_positive",
          "confirmed_pep",
          "confirmed_sanction",
          "confirmed_criminal",
          "unresolved",
        ]),
        note: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const blocking = BLOCKING_RESOLUTIONS.includes(data.resolution as AmlHitResolution);
    const newStatus = blocking ? "blocked" : "approved_after_review";

    const { data: screening, error } = await db
      .from("aml_screenings")
      .update({
        hit_resolution: data.resolution,
        resolution_note: data.note ?? null,
        resolved_by: context.userId,
        resolved_at: new Date().toISOString(),
        status: newStatus,
      })
      .eq("id", data.screeningId)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Stan klienta: zablokowany, jeżeli JAKIKOLWIEK screening blokuje.
    const { data: all } = await db
      .from("aml_screenings")
      .select("status, hit_resolution, total_hits")
      .eq("customer_id", screening.customer_id)
      .neq("status", "invalidated");
    const anyBlocked = (all ?? []).some((s: any) => s.status === "blocked");
    const anyUnreviewed = (all ?? []).some((s: any) => s.status === "review_required");
    const customerStatus = anyBlocked
      ? "blocked"
      : anyUnreviewed
        ? "review_required"
        : "approved_after_review";
    await db
      .from("aml_customers")
      .update({
        screening_status: customerStatus,
        pep_status: (all ?? []).some((s: any) => s.hit_resolution === "confirmed_pep") || undefined,
        sanction_hit:
          (all ?? []).some((s: any) => s.hit_resolution === "confirmed_sanction") || undefined,
      })
      .eq("id", screening.customer_id);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "screening",
      entityId: data.screeningId,
      action: "hit_resolved",
      details: { resolution: data.resolution, blocking, note: data.note },
    });
    return { screening, customerStatus, contractAllowed: !anyBlocked && !anyUnreviewed };
  });

// ── Oceny ryzyka ─────────────────────────────────────────────────────
export const proposeAmlRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ customerId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ proposal: RiskProposal }> => {
    const db = loose(context.supabase);
    const { data: customer, error } = await db
      .from("aml_customers")
      .select("*")
      .eq("id", data.customerId)
      .eq("user_id", context.userId)
      .single();
    if (error || !customer) throw new Error("Nie znaleziono klienta AML");

    const { data: screenings } = await db
      .from("aml_screenings")
      .select("status")
      .eq("customer_id", customer.id)
      .eq("status", "review_required");
    const { data: cashTx } = await db
      .from("aml_transactions")
      .select("id")
      .eq("customer_id", customer.id)
      .in("transaction_type", ["wplata_gotowkowa", "wyplata_gotowkowa"])
      .limit(1);

    const proposal = proposeRiskLevel({
      pepStatus: customer.pep_status,
      sanctionHit: customer.sanction_hit,
      unresolvedScreeningHits: screenings?.length ?? 0,
      countryResidence: customer.country_residence,
      countryActivity: customer.country_activity,
      crbrDiscrepancies: ((customer.crbr_discrepancies ?? []) as unknown[]).length,
      cashTransactions: (cashTx?.length ?? 0) > 0,
      missingBeneficialOwners:
        customer.entity_type === "firma" &&
        ((customer.beneficial_owners ?? []) as unknown[]).length === 0,
      financingPurposeProvided: Boolean(customer.financing_purpose),
      repaymentSourceProvided: Boolean(customer.repayment_source),
    });
    return { proposal };
  });

export const decideAmlRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        customerId: z.string().uuid(),
        proposedLevel: z.enum(["low", "standard", "high", "unacceptable"]),
        proposedFactors: z.array(
          z.object({ factor: z.string(), weight: z.number(), note: z.string().optional() }),
        ),
        finalLevel: z.enum(["low", "standard", "high", "unacceptable"]),
        overrideJustification: z.string().optional(),
      })
      .refine((v) => v.finalLevel === v.proposedLevel || Boolean(v.overrideJustification?.trim()), {
        message: "Ręczna zmiana poziomu ryzyka wymaga uzasadnienia",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: created, error } = await db
      .from("aml_risk_assessments")
      .insert({
        user_id: context.userId,
        customer_id: data.customerId,
        proposed_level: data.proposedLevel,
        proposed_factors: data.proposedFactors,
        final_level: data.finalLevel,
        override_justification: data.overrideJustification ?? null,
        decided_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await db
      .from("aml_customers")
      .update({
        risk_level: data.finalLevel as AmlRiskLevel,
        risk_assessed_at: new Date().toISOString(),
      })
      .eq("id", data.customerId)
      .eq("user_id", context.userId);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "risk_assessment",
      entityId: created.id,
      action: "risk_decided",
      details: {
        proposed: data.proposedLevel,
        final: data.finalLevel,
        overridden: data.finalLevel !== data.proposedLevel,
        justification: data.overrideJustification,
      },
    });
    return { assessment: created };
  });

export const listAmlRiskAssessments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await loose(context.supabase)
      .from("aml_risk_assessments")
      .select("*, aml_customers(id, entity_type, first_name, last_name, company_name)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { assessments: data ?? [] };
  });
