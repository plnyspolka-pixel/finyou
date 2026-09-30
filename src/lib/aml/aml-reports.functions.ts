// Zgłoszenia GIIF — przepływ uproszczony:
//  1) przygotowanie zgłoszenia (auto-zbieranie danych instytucji, osoby
//     odpowiedzialnej, klienta, stron, rachunków, kwot, umowy, uzasadnienia),
//  2) generowanie XML + PDF (wersja + SHA-256) do pobrania,
//  3) wysyłka poza platformą jedną z dwóch ścieżek i jej zarejestrowanie:
//     - elektronicznie w SI*GIIF (ścieżka ustawowa; kwalifikowany podpis
//       inwestora — Finance You nie przechowuje podpisu, PIN-u ani klucza),
//     - papierowo (awaryjnie, bez podpisu kwalifikowanego) — generujemy
//       zawiadomienie do wydruku, podpisu własnoręcznego i wysyłki poleconym,
//  4) potwierdzenie: UPO z SI*GIIF albo dowód nadania / ZPO.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInvestorPro } from "@/lib/investor-plan/pro-middleware";
import type { GiifReportPayload } from "@/lib/aml/aml-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
type Loose = { from: (t: string) => any; rpc?: any };
const loose = (c: unknown) => c as Loose;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
function customerName(c: any): string {
  return c.entity_type === "firma"
    ? (c.company_name ?? "")
    : [c.first_name, c.last_name].filter(Boolean).join(" ");
}

// ── 1. Przygotowanie zgłoszenia (bez podpisu) ────────────────────────
export const prepareGiifReport = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((data) =>
    z
      .object({
        reportType: z.enum([
          "transakcja_ponadprogowa",
          "okolicznosci_podejrzane",
          "planowana_transakcja_podejrzana",
          "transakcja_przeprowadzona",
        ]),
        caseId: z.string().uuid().optional(),
        thresholdEntryId: z.string().uuid().optional(),
        justification: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { amlAudit } = await import("@/lib/aml/audit.server");

    // Ustawienia (dane instytucji + osoba odpowiedzialna z profilu inwestora).
    const { data: settings } = await db
      .from("aml_settings")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!settings)
      throw new Error("Wejdź najpierw na Przegląd AML — ustawienia utworzą się automatycznie.");

    // Kontekst: sprawa i/lub wpis ponadprogowy.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
    let caseRow: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
    let customer: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
    let transactions: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
    let thresholdEntry: any = null;

    if (data.caseId) {
      const { data: c } = await db
        .from("aml_cases")
        .select("*, aml_customers(*)")
        .eq("id", data.caseId)
        .eq("user_id", context.userId)
        .single();
      caseRow = c;
      customer = c?.aml_customers ?? null;
      const { data: links } = await db
        .from("aml_case_transactions")
        .select("aml_transactions(*)")
        .eq("case_id", data.caseId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      transactions = (links ?? []).map((l: any) => l.aml_transactions).filter(Boolean);
    }
    if (data.thresholdEntryId) {
      const { data: te } = await db
        .from("aml_threshold_entries")
        .select("*, aml_transactions(*, aml_customers(*))")
        .eq("id", data.thresholdEntryId)
        .eq("user_id", context.userId)
        .single();
      thresholdEntry = te;
      if (te?.aml_transactions) {
        transactions = [...transactions, te.aml_transactions];
        customer = customer ?? te.aml_transactions.aml_customers ?? null;
      }
    }

    // Automatyczne zbudowanie ładunku zgłoszenia.
    const parties: GiifReportPayload["parties"] = [];
    if (customer) {
      parties.push({
        role: "klient",
        name: customerName(customer),
        entityType: customer.entity_type,
        pesel: customer.pesel ?? undefined,
        nip: customer.nip ?? undefined,
        dob: customer.dob ?? undefined,
        address: customer.address ?? undefined,
        country: customer.country_residence ?? "PL",
      });
    }
    for (const p of (caseRow?.parties ?? []) as {
      role: string;
      name: string;
      account?: string;
    }[]) {
      parties.push({ role: p.role, name: p.name, account: p.account });
    }
    const instName: string = settings.institution?.name ?? "";
    if (instName)
      parties.push({
        role: "instytucja_obowiazana",
        name: instName,
        nip: settings.institution?.nip,
      });

    const payload: GiifReportPayload = {
      reportType: data.reportType,
      institution: settings.institution ?? {},
      responsiblePerson: settings.responsible_person ?? {},
      signerPerson: settings.signer_person ?? undefined,
      customer: customer
        ? {
            name: customerName(customer),
            entityType: customer.entity_type,
            pesel: customer.pesel ?? undefined,
            nip: customer.nip ?? undefined,
            dob: customer.dob ?? undefined,
            address: customer.address ?? undefined,
            countryResidence: customer.country_residence ?? "PL",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
            representatives: ((customer.representatives ?? []) as any[]).map((r) => ({
              name: r.name,
              role: r.role ?? undefined,
            })),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
            beneficialOwners: ((customer.beneficial_owners ?? []) as any[]).map((b) => ({
              name: b.name,
              sharePct: b.sharePct ?? undefined,
            })),
          }
        : undefined,
      parties,
      transactions: transactions.map((t) => ({
        date: t.transaction_date,
        type: t.transaction_type,
        amount: Number(t.amount),
        currency: t.currency,
        eurEquivalent: t.eur_equivalent != null ? Number(t.eur_equivalent) : undefined,
        nbpRate: t.nbp_rate != null ? Number(t.nbp_rate) : undefined,
        nbpTableNo: t.nbp_table_no ?? undefined,
        senderAccount: t.sender_account ?? undefined,
        receiverAccount: t.receiver_account ?? undefined,
        description: t.description ?? undefined,
      })),
      contract: caseRow?.contract_ref ? { ref: caseRow.contract_ref } : undefined,
      justification: data.justification ?? caseRow?.justification ?? undefined,
    };

    const { checkCompleteness } = await import("@/lib/aml/giif-xml.server");
    const completeness = checkCompleteness(payload);

    const { data: report, error } = await db
      .from("aml_reports")
      .insert({
        user_id: context.userId,
        case_id: data.caseId ?? null,
        threshold_entry_id: data.thresholdEntryId ?? null,
        report_type: data.reportType,
        status: "draft",
        payload,
        completeness,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (data.caseId) {
      await db.from("aml_cases").update({ status: "report_in_preparation" }).eq("id", data.caseId);
    }
    if (data.thresholdEntryId) {
      await db
        .from("aml_threshold_entries")
        .update({ decision: "report_prepared", report_id: report.id })
        .eq("id", data.thresholdEntryId);
    }
    await amlAudit({
      userId: context.userId,
      entityType: "report",
      entityId: report.id,
      action: "report_prepared",
      details: { reportType: data.reportType, complete: completeness.complete },
    });
    return { report, completeness };
  });

// ── 2. Generowanie XML + PDF, wersja i hash ──────────────────────────
export const generateGiifDocuments = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((data) => z.object({ reportId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: report, error } = await db
      .from("aml_reports")
      .select("*")
      .eq("id", data.reportId)
      .eq("user_id", context.userId)
      .single();
    if (error || !report) throw new Error("Nie znaleziono zgłoszenia");

    const payload = report.payload as GiifReportPayload;
    // Dołącz metadane załączników do ładunku.
    const { data: atts } = await db
      .from("aml_attachments")
      .select("file_name, sha256")
      .eq("report_id", report.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
    payload.attachments = (atts ?? []).map((a: any) => ({
      fileName: a.file_name,
      sha256: a.sha256,
    }));

    const { checkCompleteness, buildGiifXml, validateGiifXml, sha256Hex } =
      await import("@/lib/aml/giif-xml.server");
    const completeness = checkCompleteness(payload);
    if (!completeness.complete) {
      return {
        ok: false as const,
        completeness,
        message: "Uzupełnij brakujące dane przed wygenerowaniem.",
      };
    }

    const version = (report.current_version ?? 0) + 1;
    const xml = buildGiifXml(payload, { reportId: report.id, version });
    const validation = validateGiifXml(xml);
    if (!validation.valid) {
      return {
        ok: false as const,
        completeness,
        xsdErrors: validation.errors,
        message: "XML nie przechodzi walidacji schematu.",
      };
    }

    const { buildGiifReportPdf } = await import("@/lib/aml/giif-pdf.server");
    const pdf = buildGiifReportPdf(payload, {
      reportId: report.id,
      version,
      generatedAt: new Date().toISOString(),
    });

    const xmlHash = sha256Hex(xml);
    const pdfHash = sha256Hex(pdf);
    const base = `${context.userId}/reports/${report.id}/v${version}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up1 = await supabaseAdmin.storage
      .from("aml-private")
      .upload(`${base}/zgloszenie.xml`, new Blob([xml], { type: "application/xml" }), {
        upsert: true,
      });
    const pdfCopy = new Uint8Array(pdf);
    const up2 = await supabaseAdmin.storage
      .from("aml-private")
      .upload(
        `${base}/zgloszenie.pdf`,
        new Blob([pdfCopy.buffer as ArrayBuffer], { type: "application/pdf" }),
        { upsert: true },
      );
    if (up1.error || up2.error)
      throw new Error(`Zapis dokumentów nie powiódł się: ${(up1.error ?? up2.error)?.message}`);

    await db.from("aml_report_versions").insert({
      user_id: context.userId,
      report_id: report.id,
      version,
      payload,
      xml_sha256: xmlHash,
      pdf_sha256: pdfHash,
      xml_storage_path: `${base}/zgloszenie.xml`,
      pdf_storage_path: `${base}/zgloszenie.pdf`,
      created_by: context.userId,
    });

    const { data: updated } = await db
      .from("aml_reports")
      .update({
        status: "complete",
        payload,
        completeness,
        current_version: version,
        xml_storage_path: `${base}/zgloszenie.xml`,
        pdf_storage_path: `${base}/zgloszenie.pdf`,
        xml_sha256: xmlHash,
        pdf_sha256: pdfHash,
      })
      .eq("id", report.id)
      .select("*")
      .single();

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "report",
      entityId: report.id,
      action: "documents_generated",
      details: { version, xmlHash, pdfHash },
    });
    if (report.case_id)
      await db.from("aml_cases").update({ status: "ready_for_signature" }).eq("id", report.case_id);
    return {
      ok: true as const,
      report: updated,
      version,
      xmlHash,
      pdfHash,
      xmlPreview: xml.slice(0, 4000),
    };
  });

/** Linki do pobrania: XML, PDF i potwierdzenie (UPO / dowód nadania). */
export const getGiifReportDownloads = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((data) => z.object({ reportId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: report, error } = await db
      .from("aml_reports")
      .select("xml_storage_path, pdf_storage_path, upo_storage_path")
      .eq("id", data.reportId)
      .eq("user_id", context.userId)
      .single();
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sign = async (path: string | null) => {
      if (!path) return null;
      const { data: url } = await supabaseAdmin.storage
        .from("aml-private")
        .createSignedUrl(path, 600);
      return url?.signedUrl ?? null;
    };
    return {
      xmlUrl: await sign(report.xml_storage_path),
      pdfUrl: await sign(report.pdf_storage_path),
      upoUrl: await sign(report.upo_storage_path),
    };
  });

export const listGiifReports = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .handler(async ({ context }) => {
    const { data, error } = await loose(context.supabase)
      .from("aml_reports")
      .select("*, aml_cases(id, case_no, title)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { reports: data ?? [] };
  });

// ── 3. Wysyłka: SI*GIIF (elektronicznie) albo papier (awaryjnie) ─────
export type GiifSubmissionChannel = "si_giif" | "paper";

/** Statusy, z których można wysłać / zarejestrować wysyłkę. */
const SENDABLE_STATUSES = ["complete", "content_approved", "correction_required", "error"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
async function loadOwnReport(db: Loose, userId: string, reportId: string): Promise<any> {
  const { data: report, error } = await db
    .from("aml_reports")
    .select("*")
    .eq("id", reportId)
    .eq("user_id", userId)
    .single();
  if (error || !report) throw new Error("Nie znaleziono zgłoszenia");
  return report;
}

function safeFileName(name: string): string {
  const ext = (name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "").toLowerCase();
  return `potwierdzenie-${Date.now()}${ext}`;
}

async function storeConfirmation(
  userId: string,
  reportId: string,
  file: { base64: string; fileName: string },
): Promise<{ path: string; sha256: string }> {
  const bytes = new Uint8Array(Buffer.from(file.base64, "base64"));
  if (bytes.length === 0) throw new Error("Pusty plik potwierdzenia");
  if (bytes.length > 15 * 1024 * 1024)
    throw new Error("Plik potwierdzenia jest za duży (maks. 15 MB)");
  const path = `${userId}/reports/${reportId}/${safeFileName(file.fileName)}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.storage
    .from("aml-private")
    .upload(path, new Blob([bytes.buffer as ArrayBuffer]), { upsert: true });
  if (error) throw new Error(`Zapis potwierdzenia nie powiódł się: ${error.message}`);
  const { sha256Hex } = await import("@/lib/aml/giif-xml.server");
  return { path, sha256: sha256Hex(bytes) };
}

const ConfirmationFile = z.object({
  base64: z.string().min(1),
  fileName: z.string().min(1).max(200),
});

/**
 * Zawiadomienie papierowe (bez podpisu kwalifikowanego) — HTML do wydruku,
 * podpisu własnoręcznego i wysyłki listem poleconym za ZPO. Kopia + hash
 * trafiają do archiwum zgłoszenia.
 */
export const buildGiifPaperNotice = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((data) =>
    z
      .object({
        reportId: z.string().uuid(),
        reason: z.string().trim().min(5, "Podaj przyczynę wysyłki papierowej"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const report = await loadOwnReport(db, context.userId, data.reportId);
    if (!report.current_version) throw new Error("Najpierw wygeneruj dokumenty zgłoszenia.");

    const { buildGiifPaperNoticeHtml, paperAllowedFor } = await import("@/lib/aml/giif-paper");
    const payload = report.payload as GiifReportPayload;
    if (!paperAllowedFor(payload.reportType)) {
      throw new Error(
        "Informacje o transakcjach ponadprogowych (art. 72) przekazuje się wyłącznie elektronicznie przez SI*GIIF — papier nie wykonuje tego obowiązku.",
      );
    }

    const html = buildGiifPaperNoticeHtml(payload, {
      reportId: report.id,
      version: report.current_version,
      reason: data.reason,
      date: new Date().toLocaleDateString("pl-PL"),
    });
    const { sha256Hex } = await import("@/lib/aml/giif-xml.server");
    const sha256 = sha256Hex(html);
    const path = `${context.userId}/reports/${report.id}/v${report.current_version}/zawiadomienie-papierowe.html`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage
      .from("aml-private")
      .upload(path, new Blob([html], { type: "text/html;charset=utf-8" }), { upsert: true });

    await db
      .from("aml_reports")
      .update({
        giif_response: {
          ...(report.giif_response ?? {}),
          paperNotice: { path, sha256, reason: data.reason, generatedAt: new Date().toISOString() },
        },
      })
      .eq("id", report.id);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "report",
      entityId: report.id,
      action: "paper_notice_generated",
      details: { sha256, reason: data.reason, version: report.current_version },
    });
    return { html, sha256 };
  });

/**
 * Rejestracja wysyłki wykonanej poza platformą: w SI*GIIF (identyfikator
 * zgłoszenia, opcjonalnie UPO) albo papierowo (data i numer nadania,
 * opcjonalnie skan dowodu nadania).
 */
export const recordGiifSubmission = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((data) =>
    z
      .object({
        reportId: z.string().uuid(),
        channel: z.enum(["si_giif", "paper"]),
        submittedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reference: z.string().trim().max(200).optional(),
        confirmation: ConfirmationFile.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const report = await loadOwnReport(db, context.userId, data.reportId);
    if (!SENDABLE_STATUSES.includes(report.status))
      throw new Error("Najpierw wygeneruj dokumenty zgłoszenia (XML + PDF).");
    if (data.channel === "paper") {
      const { paperAllowedFor } = await import("@/lib/aml/giif-paper");
      if (!paperAllowedFor((report.payload as GiifReportPayload).reportType))
        throw new Error(
          "Transakcje ponadprogowe (art. 72) zgłasza się wyłącznie elektronicznie przez SI*GIIF.",
        );
      if (!report.giif_response?.paperNotice)
        throw new Error("Najpierw wygeneruj i wydrukuj zawiadomienie papierowe.");
    }

    const stored = data.confirmation
      ? await storeConfirmation(context.userId, report.id, data.confirmation)
      : null;
    const now = new Date().toISOString();
    const status = stored ? "upo_received" : "submitted";
    const { error } = await db
      .from("aml_reports")
      .update({
        status,
        giif_submission_id: data.reference || null,
        submitted_at: new Date(`${data.submittedAt}T12:00:00Z`).toISOString(),
        giif_status: data.channel,
        giif_status_checked_at: now,
        upo_storage_path: stored?.path ?? null,
        upo_received_at: stored ? now : null,
        giif_response: {
          ...(report.giif_response ?? {}),
          channel: data.channel,
          reference: data.reference ?? null,
          confirmationSha256: stored?.sha256 ?? null,
        },
      })
      .eq("id", report.id);
    if (error) throw new Error(error.message);

    if (report.case_id) await db.from("aml_cases").update({ status }).eq("id", report.case_id);
    if (report.threshold_entry_id)
      await db
        .from("aml_threshold_entries")
        .update({ decision: "submitted" })
        .eq("id", report.threshold_entry_id);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "report",
      entityId: report.id,
      action: data.channel === "paper" ? "submitted_on_paper" : "submitted_via_si_giif",
      details: {
        submittedAt: data.submittedAt,
        reference: data.reference ?? null,
        confirmationSha256: stored?.sha256 ?? null,
      },
    });
    return { ok: true as const, status };
  });

/** Dołączenie potwierdzenia po fakcie: UPO z SI*GIIF albo dowód nadania / ZPO. */
export const uploadGiifConfirmation = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((data) =>
    z.object({ reportId: z.string().uuid(), confirmation: ConfirmationFile }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const report = await loadOwnReport(db, context.userId, data.reportId);
    if (!["submitted", "upo_received"].includes(report.status))
      throw new Error("Najpierw zarejestruj wysyłkę zgłoszenia.");

    const stored = await storeConfirmation(context.userId, report.id, data.confirmation);
    await db
      .from("aml_reports")
      .update({
        status: "upo_received",
        upo_storage_path: stored.path,
        upo_received_at: new Date().toISOString(),
        giif_response: { ...(report.giif_response ?? {}), confirmationSha256: stored.sha256 },
      })
      .eq("id", report.id);
    if (report.case_id)
      await db.from("aml_cases").update({ status: "upo_received" }).eq("id", report.case_id);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "report",
      entityId: report.id,
      action: "confirmation_uploaded",
      details: { sha256: stored.sha256 },
    });
    return { ok: true as const };
  });
