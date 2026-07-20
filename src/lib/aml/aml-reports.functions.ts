/* eslint-disable @typescript-eslint/no-explicit-any -- tabele aml_* nie są jeszcze w wygenerowanych typach Database; luźny dostęp jak w module wind_* */
// Zgłoszenia GIIF — cały przepływ:
//  1) przygotowanie zgłoszenia BEZ podpisu (auto-zbieranie danych inwestora,
//     osoby odpowiedzialnej, klienta, stron, rachunków, kwot, umowy,
//     uzasadnienia i załączników; kompletność; XML + PDF; wersja + hash),
//  2) zatwierdzenie treści i pobranie przygotowanego pakietu,
//  3) „Podpisz i zgłoś do GIIF": dopiero tu pojawia się wymóg kwalifikowanego
//     podpisu elektronicznego — dokument schodzi do inwestora do podpisania
//     LOKALNIE (Finance You nie przechowuje podpisu, PIN-u ani klucza),
//     wraca podpisany plik CMS/PKCS#7, jest weryfikowany, szyfrowany
//     certyfikatem GIIF i wysyłany przez mTLS (kolejka + idempotency),
//  4) kontekstowy kreator rejestracji SI*GIIF (wariant B) — bez porzucania
//     przygotowanego zgłoszenia.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { GiifReportPayload } from "@/lib/aml/aml-types";

type Loose = { from: (t: string) => any; rpc?: any };
const loose = (c: unknown) => c as Loose;

function customerName(c: any): string {
  return c.entity_type === "firma"
    ? (c.company_name ?? "")
    : [c.first_name, c.last_name].filter(Boolean).join(" ");
}

// ── 1. Przygotowanie zgłoszenia (bez podpisu) ────────────────────────
export const prepareGiifReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    let caseRow: any = null;
    let customer: any = null;
    let transactions: any[] = [];
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
            representatives: ((customer.representatives ?? []) as any[]).map((r) => ({
              name: r.name,
              role: r.role ?? undefined,
            })),
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

/** Aktualizacja ładunku (uzasadnienie, strony, korekty) przed wygenerowaniem. */
export const updateGiifReportPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ reportId: z.string().uuid(), payload: z.record(z.string(), z.unknown()) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { checkCompleteness } = await import("@/lib/aml/giif-xml.server");
    const completeness = checkCompleteness(data.payload as unknown as GiifReportPayload);
    const { data: report, error } = await db
      .from("aml_reports")
      .update({ payload: data.payload, completeness, status: "draft" })
      .eq("id", data.reportId)
      .eq("user_id", context.userId)
      .in("status", ["draft", "complete", "content_approved", "correction_required"])
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { report, completeness };
  });

// ── 2. Generowanie XML + PDF, wersja i hash ──────────────────────────
export const generateGiifDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    return {
      ok: true as const,
      report: updated,
      version,
      xmlHash,
      pdfHash,
      xmlPreview: xml.slice(0, 4000),
    };
  });

/** Zatwierdzenie treści zgłoszenia (nadal bez podpisu). */
export const approveGiifReportContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ reportId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: report, error } = await db
      .from("aml_reports")
      .update({
        status: "content_approved",
        content_approved_by: context.userId,
        content_approved_at: new Date().toISOString(),
      })
      .eq("id", data.reportId)
      .eq("user_id", context.userId)
      .eq("status", "complete")
      .select("*")
      .single();
    if (error) throw new Error("Zgłoszenie musi mieć wygenerowane dokumenty (status: kompletne).");

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "report",
      entityId: report.id,
      action: "content_approved",
      details: {},
    });
    if (report.case_id)
      await db.from("aml_cases").update({ status: "ready_for_signature" }).eq("id", report.case_id);
    return { report };
  });

/** Linki do pobrania przygotowanego pakietu (XML, PDF, UPO). */
export const getGiifReportDownloads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ reportId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: report, error } = await db
      .from("aml_reports")
      .select("xml_storage_path, pdf_storage_path, upo_storage_path, signed_storage_path")
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
      signedUrl: await sign(report.signed_storage_path),
    };
  });

export const listGiifReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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

// ── 3. „Podpisz i zgłoś do GIIF" ─────────────────────────────────────
/**
 * Krok 1 klikniętego „Podpisz i zgłoś": sprawdzenie połączenia z SI*GIIF.
 * Wariant A (aktywny certyfikat) → zwracamy dokument do podpisu.
 * Wariant B (brak połączenia) → sygnał do uruchomienia kreatora rejestracji
 * KONTEKSTOWO, bez porzucania zgłoszenia.
 */
export const startGiifSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    if (!["content_approved", "correction_required", "error"].includes(report.status)) {
      throw new Error("Najpierw wygeneruj dokumenty i zatwierdź treść zgłoszenia.");
    }

    const { data: settings } = await db
      .from("aml_settings")
      .select("giif_connection_status, giif_institution_id, giif_environment")
      .eq("user_id", context.userId)
      .maybeSingle();

    const connected = settings?.giif_connection_status === "active";
    if (!connected) {
      return {
        variant: "B" as const,
        message:
          "Aby wysłać pierwsze zgłoszenie, musisz jednorazowo zarejestrować instytucję w SI*GIIF i uzyskać certyfikat komunikacyjny. Potrzebny jest kwalifikowany podpis elektroniczny.",
        connectionStatus: settings?.giif_connection_status ?? "not_connected",
      };
    }

    // Wariant A: dokument do podpisania kwalifikowanym podpisem — LOKALNIE.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: url } = await supabaseAdmin.storage
      .from("aml-private")
      .createSignedUrl(report.xml_storage_path, 900);

    await db.from("aml_reports").update({ status: "awaiting_signature" }).eq("id", report.id);
    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "report",
      entityId: report.id,
      action: "signature_requested",
      details: { xmlHash: report.xml_sha256 },
    });
    return {
      variant: "A" as const,
      documentUrl: url?.signedUrl ?? null,
      xmlSha256: report.xml_sha256,
      instructions:
        "Podpisz plik XML kwalifikowanym podpisem elektronicznym (format CAdES/PKCS#7, np. w aplikacji dostawcy podpisu), a następnie wgraj podpisany plik. Finance You nie pobiera i nie zapisuje PIN-u ani klucza podpisu.",
    };
  });

/**
 * Krok 2: odbiór podpisanego pliku → weryfikacja podpisu → zaszyfrowanie
 * certyfikatem GIIF → kolejka wysyłki mTLS (idempotency, ponowienia).
 */
export const uploadSignedGiifReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ reportId: z.string().uuid(), signedBase64: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: report, error } = await db
      .from("aml_reports")
      .select("*")
      .eq("id", data.reportId)
      .eq("user_id", context.userId)
      .single();
    if (error || !report) throw new Error("Nie znaleziono zgłoszenia");

    const signedBytes = new Uint8Array(Buffer.from(data.signedBase64, "base64"));

    // Weryfikacja podpisu kwalifikowanego (CMS/PKCS#7).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: xmlFile } = await supabaseAdmin.storage
      .from("aml-private")
      .download(report.xml_storage_path);
    const xmlBytes = xmlFile ? new Uint8Array(await xmlFile.arrayBuffer()) : undefined;

    const { verifyCmsSignature, sha256Hex } = await Promise.all([
      import("@/lib/aml/crypto.server"),
      import("@/lib/aml/giif-xml.server"),
    ]).then(([c, x]) => ({ verifyCmsSignature: c.verifyCmsSignature, sha256Hex: x.sha256Hex }));

    const verification = verifyCmsSignature(signedBytes, xmlBytes);
    const { amlAudit } = await import("@/lib/aml/audit.server");
    if (!verification.valid) {
      await amlAudit({
        userId: context.userId,
        entityType: "report",
        entityId: report.id,
        action: "signature_rejected",
        details: { errors: verification.errors },
      });
      return { ok: false as const, errors: verification.errors };
    }

    const signedPath = `${context.userId}/reports/${report.id}/v${report.current_version}/zgloszenie-podpisane.p7s`;
    const signedCopy = new Uint8Array(signedBytes);
    await supabaseAdmin.storage
      .from("aml-private")
      .upload(signedPath, new Blob([signedCopy.buffer as ArrayBuffer]), { upsert: true });

    // Szyfrowanie certyfikatem GIIF (env GIIF_ENCRYPTION_CERT_PEM).
    const giifCert = process.env.GIIF_ENCRYPTION_CERT_PEM;
    if (!giifCert)
      throw new Error("Brak certyfikatu szyfrowania GIIF (GIIF_ENCRYPTION_CERT_PEM) w sekretach.");
    const { encryptForGiif } = await import("@/lib/aml/crypto.server");
    const encrypted = encryptForGiif(signedBytes, giifCert);
    const encryptedCopy = new Uint8Array(encrypted);
    await supabaseAdmin.storage
      .from("aml-private")
      .upload(`${signedPath}.enc`, new Blob([encryptedCopy.buffer as ArrayBuffer]), {
        upsert: true,
      });

    // Kolejka z kluczem idempotency: report + wersja + hash — ponowienie
    // nigdy nie wyśle drugi raz tej samej treści.
    const idempotencyKey = `giif-${report.id}-v${report.current_version}-${sha256Hex(signedBytes).slice(0, 16)}`;
    await db.from("aml_submission_queue").upsert(
      {
        user_id: context.userId,
        report_id: report.id,
        idempotency_key: idempotencyKey,
        state: "pending",
        next_attempt_at: new Date().toISOString(),
      },
      { onConflict: "idempotency_key" },
    );

    await db
      .from("aml_reports")
      .update({
        status: "queued",
        signed_storage_path: signedPath,
        signed_sha256: sha256Hex(signedBytes),
        signature_verified_at: new Date().toISOString(),
        signer_subject: verification.signerSubject ?? null,
      })
      .eq("id", report.id);
    if (report.case_id)
      await db.from("aml_cases").update({ status: "signed" }).eq("id", report.case_id);

    await amlAudit({
      userId: context.userId,
      entityType: "report",
      entityId: report.id,
      action: "signed_and_queued",
      details: { signer: verification.signerSubject, idempotencyKey },
    });

    // Natychmiastowa próba wysyłki (kolejka obsłuży ewentualne ponowienia).
    const { processSubmissionQueue } = await import("@/lib/aml/giif-connector.server");
    await processSubmissionQueue(3);

    const { data: fresh } = await db.from("aml_reports").select("*").eq("id", report.id).single();
    return { ok: true as const, report: fresh, signer: verification.signerSubject };
  });

/** Ręczne odświeżenie statusów + pobranie UPO. */
export const refreshGiifStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { processSubmissionQueue, pollSubmittedReports } =
      await import("@/lib/aml/giif-connector.server");
    const q = await processSubmissionQueue(10);
    const s = await pollSubmittedReports(20);
    return { queueProcessed: q.processed, statusesChecked: s.checked };
  });

// ── 4. Kreator rejestracji SI*GIIF (wariant B — kontekstowy) ─────────
/**
 * Krok kreatora: przygotowanie dokumentu rejestracji instytucji z danych
 * profilu + bezpieczne wygenerowanie klucza i CSR (klucz od razu do "KMS",
 * nigdy do frontendu).
 */
export const giifRegistrationPrepare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = loose(context.supabase);
    const { data: settings } = await db
      .from("aml_settings")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!settings) throw new Error("Brak ustawień AML — wejdź na Przegląd AML.");

    const inst = settings.institution ?? {};
    const person = settings.responsible_person ?? {};
    if (!inst.name || !inst.nip) {
      return {
        ok: false as const,
        missing: [
          !inst.name ? "Nazwa organizacji" : null,
          !inst.nip ? "NIP organizacji" : null,
        ].filter(Boolean),
      };
    }

    // Dokument rejestracyjny (do podpisu kwalifikowanego przez inwestora).
    const registrationDoc = [
      "ZGŁOSZENIE INSTYTUCJI OBOWIĄZANEJ DO SI*GIIF",
      `Instytucja: ${inst.name}`,
      `NIP: ${inst.nip}`,
      `Adres: ${inst.address ?? ""} ${inst.postalCode ?? ""} ${inst.city ?? ""}`.trim(),
      `Osoba odpowiedzialna (art. 8): ${person.firstName ?? ""} ${person.lastName ?? ""}`,
      `E-mail: ${person.email ?? ""}  Telefon: ${person.phone ?? ""}`,
      `Data przygotowania: ${new Date().toISOString()}`,
    ].join("\n");

    // Bezpieczne wygenerowanie klucza + CSR.
    const { generateCsr } = await import("@/lib/aml/crypto.server");
    const csr = generateCsr({
      commonName: `SI*GIIF ${inst.name}`.slice(0, 64),
      organization: inst.name,
      country: (inst.country ?? "PL").slice(0, 2).toUpperCase(),
      serialNumber: String(inst.nip).replace(/\D/g, ""),
    });

    // Koperta KMS do prywatnego Storage; w tabeli tylko kms_key_ref.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const envPath = `${context.userId}/kms/${csr.kmsKeyRef.replace(/[^\w-]/g, "_")}.enc`;
    await supabaseAdmin.storage
      .from("aml-private")
      .upload(envPath, new Blob([csr.privateKeyEnvelope], { type: "text/plain" }), {
        upsert: true,
      });

    const environment = settings.giif_environment ?? "test";
    const { data: cert, error } = await db
      .from("aml_certificates")
      .insert({
        user_id: context.userId,
        environment,
        status: "csr_generated",
        kms_key_ref: csr.kmsKeyRef,
        csr_pem: csr.csrPem,
        subject_dn: csr.subjectDn,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await db
      .from("aml_settings")
      .update({ giif_connection_status: "csr_generated" })
      .eq("user_id", context.userId);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "certificate",
      entityId: cert.id,
      action: "csr_generated",
      details: { subjectDn: csr.subjectDn, kmsKeyRef: csr.kmsKeyRef },
    });

    return {
      ok: true as const,
      certificateId: cert.id,
      registrationDocument: registrationDoc,
      csrPem: csr.csrPem,
      subjectDn: csr.subjectDn,
      note: "Podpisz dokument rejestracyjny kwalifikowanym podpisem elektronicznym lokalnie i wgraj podpisany plik. Profil Zaufany ani podpis zaufany nie zastępują kwalifikowanego podpisu elektronicznego wymaganego przez SI*GIIF.",
    };
  });

/** Krok kreatora: odbiór podpisanych dokumentów rejestracyjnych + wysyłka do SI*GIIF. */
export const giifRegistrationSubmit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        certificateId: z.string().uuid(),
        signedRegistrationBase64: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: cert } = await db
      .from("aml_certificates")
      .select("*")
      .eq("id", data.certificateId)
      .eq("user_id", context.userId)
      .single();
    if (!cert) throw new Error("Nie znaleziono wniosku certyfikacyjnego");

    const signedBytes = new Uint8Array(Buffer.from(data.signedRegistrationBase64, "base64"));
    const { verifyCmsSignature } = await import("@/lib/aml/crypto.server");
    const verification = verifyCmsSignature(signedBytes);
    if (!verification.valid) {
      return { ok: false as const, errors: verification.errors };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signedCopy = new Uint8Array(signedBytes);
    await supabaseAdmin.storage
      .from("aml-private")
      .upload(
        `${context.userId}/giif-registration/${cert.id}.p7s`,
        new Blob([signedCopy.buffer as ArrayBuffer]),
        {
          upsert: true,
        },
      );
    await db
      .from("aml_settings")
      .update({ giif_connection_status: "documents_signed" })
      .eq("user_id", context.userId);

    const environment = (cert.environment ?? "test") as "test" | "production";
    const { giifRegisterInstitution, giifSubmitCsr } =
      await import("@/lib/aml/giif-connector.server");
    const reg = await giifRegisterInstitution(environment, signedBytes);
    if (!reg.ok) {
      await db
        .from("aml_settings")
        .update({ giif_connection_status: "error" })
        .eq("user_id", context.userId);
      return {
        ok: false as const,
        errors: [reg.error ?? "Rejestracja w SI*GIIF nie powiodła się"],
      };
    }

    const csrRes = await giifSubmitCsr(environment, reg.institutionId ?? "", cert.csr_pem);
    await db
      .from("aml_certificates")
      .update({ status: "requested", serial_number: csrRes.requestId ?? null })
      .eq("id", cert.id);
    await db
      .from("aml_settings")
      .update({
        giif_connection_status: "submitted_to_giif",
        giif_institution_id: reg.institutionId ?? null,
      })
      .eq("user_id", context.userId);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "certificate",
      entityId: cert.id,
      action: "registration_submitted",
      details: { institutionId: reg.institutionId, signer: verification.signerSubject },
    });
    return { ok: true as const, institutionId: reg.institutionId, csrRequestId: csrRes.requestId };
  });

/**
 * Krok kreatora: pobranie/wgranie certyfikatu komunikacyjnego, kontrola
 * zgodności z CSR i test mTLS. Po sukcesie połączenie = 'active' i kreator
 * wraca do przygotowanego zgłoszenia.
 */
export const giifRegistrationFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        certificateId: z.string().uuid(),
        certificatePem: z.string().optional(), // ręczne wgranie, gdy GIIF wydał plik
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: cert } = await db
      .from("aml_certificates")
      .select("*")
      .eq("id", data.certificateId)
      .eq("user_id", context.userId)
      .single();
    if (!cert) throw new Error("Nie znaleziono wniosku certyfikacyjnego");
    const environment = (cert.environment ?? "test") as "test" | "production";

    // 1. Certyfikat: z wejścia albo pobrany z SI*GIIF.
    let certificatePem = data.certificatePem ?? null;
    if (!certificatePem) {
      const { data: settings } = await db
        .from("aml_settings")
        .select("giif_institution_id")
        .eq("user_id", context.userId)
        .maybeSingle();
      const { giifFetchCertificate } = await import("@/lib/aml/giif-connector.server");
      const fetched = await giifFetchCertificate(
        environment,
        settings?.giif_institution_id ?? "",
        cert.serial_number ?? "",
      );
      if (!fetched.ok)
        return { ok: false as const, step: "fetch_certificate", error: fetched.error };
      certificatePem = fetched.certificatePem ?? null;
    }
    if (!certificatePem)
      return { ok: false as const, step: "fetch_certificate", error: "Brak certyfikatu" };

    // 2. Zgodność z CSR.
    const { certificateMatchesCsr } = await import("@/lib/aml/crypto.server");
    const matches = certificateMatchesCsr(certificatePem, cert.csr_pem);
    if (!matches) {
      await db
        .from("aml_certificates")
        .update({ status: "error", matches_csr: false })
        .eq("id", cert.id);
      return {
        ok: false as const,
        step: "csr_match",
        error: "Certyfikat nie odpowiada kluczowi z CSR.",
      };
    }

    // 3. Test mTLS.
    const { giifTestMtls } = await import("@/lib/aml/giif-connector.server");
    const mtls = await giifTestMtls(environment);
    const now = new Date().toISOString();
    await db
      .from("aml_certificates")
      .update({
        status: mtls.ok ? "active" : "issued",
        certificate_pem: certificatePem,
        matches_csr: true,
        mtls_tested_at: mtls.ok ? now : null,
      })
      .eq("id", cert.id);
    await db
      .from("aml_settings")
      .update({ giif_connection_status: mtls.ok ? "active" : "certificate_issued" })
      .eq("user_id", context.userId);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "certificate",
      entityId: cert.id,
      action: mtls.ok ? "connection_active" : "certificate_stored",
      details: { environment, mtlsOk: mtls.ok, mtlsError: mtls.error },
    });
    return { ok: true as const, mtlsOk: mtls.ok, mtlsError: mtls.error ?? null };
  });
