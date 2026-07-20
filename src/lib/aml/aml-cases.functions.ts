/* eslint-disable @typescript-eslint/no-explicit-any -- tabele aml_* nie są jeszcze w wygenerowanych typach Database; luźny dostęp jak w module wind_* */
// Sprawy AML — tworzone z klienta, screeningu, rozbieżności CRBR, oceny
// ryzyka, transakcji, rejestru ponadprogowego albo ręcznie.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Loose = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };
const loose = (c: unknown) => c as Loose;

const CaseInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(3),
  origin: z
    .enum([
      "customer",
      "screening",
      "crbr_discrepancy",
      "risk_assessment",
      "transaction",
      "threshold_register",
      "manual",
    ])
    .default("manual"),
  customerId: z.string().uuid().optional(),
  screeningId: z.string().uuid().optional(),
  riskAssessmentId: z.string().uuid().optional(),
  thresholdEntryId: z.string().uuid().optional(),
  transactionIds: z.array(z.string().uuid()).optional(),
  contractRef: z.string().optional(),
  parties: z
    .array(z.object({ role: z.string(), name: z.string(), account: z.string().optional() }))
    .optional(),
  accounts: z.array(z.string()).optional(),
  amounts: z.array(z.object({ amount: z.number(), currency: z.string() })).optional(),
  description: z.string().optional(),
  chronology: z.array(z.object({ date: z.string(), event: z.string() })).optional(),
  justification: z.string().optional(),
});

export const listAmlCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await loose(context.supabase)
      .from("aml_cases")
      .select("*, aml_customers(id, entity_type, first_name, last_name, company_name)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return { cases: data ?? [] };
  });

export const getAmlCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ caseId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: c, error } = await db
      .from("aml_cases")
      .select("*, aml_customers(*)")
      .eq("id", data.caseId)
      .eq("user_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    const { data: txLinks } = await db
      .from("aml_case_transactions")
      .select("transaction_id, aml_transactions(*)")
      .eq("case_id", data.caseId);
    const { data: attachments } = await db
      .from("aml_attachments")
      .select("*")
      .eq("case_id", data.caseId);
    const { data: reports } = await db
      .from("aml_reports")
      .select("id, report_type, status, current_version, created_at")
      .eq("case_id", data.caseId);
    const { data: audit } = await db
      .from("aml_audit_log")
      .select("*")
      .eq("entity_type", "case")
      .eq("entity_id", data.caseId)
      .order("created_at", { ascending: false })
      .limit(100);
    return {
      case: c,
      transactions: (txLinks ?? []).map((l: any) => l.aml_transactions).filter(Boolean),
      attachments: attachments ?? [],
      reports: reports ?? [],
      audit: audit ?? [],
    };
  });

export const upsertAmlCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CaseInput.parse(data))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { amlAudit } = await import("@/lib/aml/audit.server");

    const row: Record<string, unknown> = {
      title: data.title,
      origin: data.origin,
      customer_id: data.customerId ?? null,
      screening_id: data.screeningId ?? null,
      risk_assessment_id: data.riskAssessmentId ?? null,
      threshold_entry_id: data.thresholdEntryId ?? null,
      contract_ref: data.contractRef ?? null,
      parties: data.parties ?? [],
      accounts: data.accounts ?? [],
      amounts: data.amounts ?? [],
      description: data.description ?? null,
      chronology: data.chronology ?? [],
      justification: data.justification ?? null,
    };

    let caseRow: any;
    if (data.id) {
      const { data: updated, error } = await db
        .from("aml_cases")
        .update(row)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      caseRow = updated;
      await amlAudit({
        userId: context.userId,
        entityType: "case",
        entityId: caseRow.id,
        action: "case_updated",
        details: {},
      });
    } else {
      const { data: caseNo } = await db.rpc("aml_next_case_no", { _user_id: context.userId });
      const { data: created, error } = await db
        .from("aml_cases")
        .insert({
          ...row,
          user_id: context.userId,
          case_no: caseNo ?? `AML/${new Date().getFullYear()}/1`,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      caseRow = created;
      await amlAudit({
        userId: context.userId,
        entityType: "case",
        entityId: caseRow.id,
        action: "case_created",
        details: { origin: data.origin, title: data.title },
      });
    }

    if (data.transactionIds?.length) {
      await db.from("aml_case_transactions").upsert(
        data.transactionIds.map((txId) => ({
          case_id: caseRow.id,
          transaction_id: txId,
          user_id: context.userId,
        })),
        { onConflict: "case_id,transaction_id" },
      );
    }
    return { case: caseRow };
  });

export const setAmlCaseStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        caseId: z.string().uuid(),
        status: z.enum([
          "new",
          "in_analysis",
          "awaiting_information",
          "no_basis_for_report",
          "suspicion_confirmed",
          "report_in_preparation",
          "ready_for_signature",
          "signed",
          "submitted",
          "upo_received",
          "rejected",
          "correction_required",
          "closed",
        ]),
        note: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: current } = await db
      .from("aml_cases")
      .select("status, decisions")
      .eq("id", data.caseId)
      .eq("user_id", context.userId)
      .single();
    const decisions = [
      ...((current?.decisions ?? []) as unknown[]),
      {
        date: new Date().toISOString(),
        decision: `Status: ${current?.status} → ${data.status}`,
        note: data.note ?? null,
        by: context.userId,
      },
    ];
    const { data: updated, error } = await db
      .from("aml_cases")
      .update({ status: data.status, decisions })
      .eq("id", data.caseId)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "case",
      entityId: data.caseId,
      action: "status_change",
      details: { from: current?.status, to: data.status, note: data.note },
    });
    return { case: updated };
  });

/** Załącznik do sprawy/zgłoszenia — plik przesyłany w base64 do prywatnego Storage. */
export const addAmlAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        caseId: z.string().uuid().optional(),
        reportId: z.string().uuid().optional(),
        fileName: z.string().min(1),
        contentType: z.string().default("application/octet-stream"),
        base64: z.string().min(1),
      })
      .refine((v) => v.caseId || v.reportId, { message: "Wskaż sprawę albo zgłoszenie" })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.length > 15 * 1024 * 1024) throw new Error("Załącznik przekracza 15 MB");
    const { createHash } = await import("node:crypto");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const path = `${context.userId}/attachments/${crypto.randomUUID()}-${data.fileName.replace(/[^\w.-]/g, "_")}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upError } = await supabaseAdmin.storage
      .from("aml-private")
      .upload(path, bytes, { contentType: data.contentType });
    if (upError) throw new Error(`Nie udało się zapisać pliku: ${upError.message}`);

    const db = loose(context.supabase);
    const { data: created, error } = await db
      .from("aml_attachments")
      .insert({
        user_id: context.userId,
        case_id: data.caseId ?? null,
        report_id: data.reportId ?? null,
        file_name: data.fileName,
        storage_path: path,
        content_type: data.contentType,
        size_bytes: bytes.length,
        sha256,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: data.caseId ? "case" : "report",
      entityId: data.caseId ?? data.reportId,
      action: "attachment_added",
      details: { fileName: data.fileName, sha256 },
    });
    return { attachment: created };
  });

/** Historia audytu (nieusuwalna) — do ekranów historii. */
export const listAmlAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ entityType: z.string().optional(), entityId: z.string().uuid().optional() })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = loose(context.supabase)
      .from("aml_audit_log")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.entityType) q = q.eq("entity_type", data.entityType);
    if (data.entityId) q = q.eq("entity_id", data.entityId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { audit: rows ?? [] };
  });
