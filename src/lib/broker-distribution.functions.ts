import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type DistributionAttachment = { name: string; path?: string | null; url?: string | null };
type DistributionEmail = {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  attachments: DistributionAttachment[];
  brokerName: string;
  brokerEmail: string;
};

/**
 * Buduje treść maila dystrybucyjnego (temat, HTML, tekst, referencje do
 * załączników) na podstawie danych wniosku, dokumentów i profilu nadawcy.
 * Wspólny helper dla draftu (skrzynka) oraz wysyłki śledzonej (admin).
 */
function buildDistributionEmail(app: any, docs: any[] | null, brokerProfile: any): DistributionEmail {
    const p: any = Array.isArray((app as any).properties) ? (app as any).properties[0] : (app as any).properties;
    const photos: string[] = Array.isArray(p?.photos) ? p.photos.filter(Boolean) : [];
    const kw = p?.land_register_number ?? "—";
    const extraKw: string[] = Array.isArray(p?.additional_land_register_numbers)
      ? p.additional_land_register_numbers.filter(Boolean)
      : [];
    const address = [p?.street ?? p?.address, p?.city, p?.voivodeship].filter(Boolean).join(", ") || "—";
    const kwota = app.loan_amount
      ? new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(
          Number(app.loan_amount),
        )
      : "—";
    const okres = app.preferred_period_months ? `${app.preferred_period_months} mies.` : "—";
    const value = p?.estimated_value
      ? new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(
          Number(p.estimated_value),
        )
      : "—";

    const brokerName = [brokerProfile?.first_name, brokerProfile?.last_name].filter(Boolean).join(" ") || "Pośrednik Finance You";
    const brokerPhone = brokerProfile?.phone ?? "";
    const brokerEmail = brokerProfile?.email ?? "";

    const subject = `Nowy temat pożyczkowy pod zabezpieczenie hipoteczne — ${kwota} · KW ${kw}`;

    // Dokumenty i zdjęcia idą jako PRAWDZIWE załączniki maila (pliki), a nie
    // linki w treści — `file_url`/`photos` to zwykle klucze w Storage, więc
    // linki i tak nie działały u odbiorcy. Serwer pobierze pliki przy wysyłce.
    const isHttp = (s: string) => /^https?:\/\//i.test(s);
    const baseName = (p: string) => decodeURIComponent(p.split("/").pop() ?? p).split("?")[0] || "plik";

    const attachments: Array<{ name: string; path?: string | null; url?: string | null }> = [];
    for (const d of docs ?? []) {
      const src = (d as any).file_path ?? (d as any).file_url;
      if (!src) continue;
      const name = (d as any).file_name ?? (d as any).document_type ?? baseName(String(src));
      attachments.push(isHttp(String(src)) ? { name, url: String(src) } : { name, path: String(src) });
    }
    const photoAttachments = photos.map((u) =>
      isHttp(u) ? { name: baseName(u), url: u } : { name: baseName(u), path: u },
    );
    const docsAttachedCount = attachments.length;
    attachments.push(...photoAttachments);
    const photosAttachedCount = photoAttachments.length;

    const attachmentsSentence = attachments.length
      ? `W załączeniu przesyłam ${docsAttachedCount ? `dokumenty (${docsAttachedCount})` : ""}${
          docsAttachedCount && photosAttachedCount ? " oraz " : ""
        }${photosAttachedCount ? `zdjęcia nieruchomości (${photosAttachedCount})` : ""}.`
      : "";

    const attachmentsNote = attachmentsSentence
      ? `<p style="margin:16px 0">${attachmentsSentence}</p>`
      : "";

    const facts = `
      <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b">Wnioskowana kwota</td><td style="padding:6px 0;text-align:right;font-weight:700">${kwota}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Preferowany okres</td><td style="padding:6px 0;text-align:right">${okres}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Numer KW</td><td style="padding:6px 0;text-align:right;font-family:monospace">${kw}</td></tr>
        ${extraKw.length ? `<tr><td style="padding:6px 0;color:#64748b">Dodatkowe KW</td><td style="padding:6px 0;text-align:right;font-family:monospace">${extraKw.join(", ")}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#64748b">Adres nieruchomości</td><td style="padding:6px 0;text-align:right">${address}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Typ nieruchomości</td><td style="padding:6px 0;text-align:right">${p?.property_type ?? "—"}</td></tr>
        ${p?.area_sqm ? `<tr><td style="padding:6px 0;color:#64748b">Powierzchnia</td><td style="padding:6px 0;text-align:right">${p.area_sqm} m²</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#64748b">Szacowana wartość</td><td style="padding:6px 0;text-align:right">${value}</td></tr>
      </table>
    `;

    const opis = p?.description
      ? `<div style="margin:12px 0"><div style="font-weight:600;margin-bottom:6px">Opis</div><div style="white-space:pre-wrap;color:#334155">${String(
          p.description,
        )
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</div></div>`
      : "";

    const signature = `
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;color:#334155">
        <div style="font-weight:600">${brokerName}</div>
        <div>Pośrednik Finance You</div>
        ${brokerPhone ? `<div>tel. ${brokerPhone}</div>` : ""}
        <div>kontakt@financeyou.pl</div>
      </div>
    `;


    const bodyHtml = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;max-width:640px">
        <p>Dzień dobry,</p>
        <p>przesyłam temat pożyczkowy pod zabezpieczenie hipoteczne. Poniżej najważniejsze parametry:</p>
        ${facts}
        ${attachmentsNote}
        ${opis}
        <p>Zapraszam do kontaktu w sprawie oferty finansowania.</p>
        ${signature}
      </div>
    `;

    const bodyText =
      `Dzień dobry,\n\nprzesyłam temat pożyczkowy pod zabezpieczenie hipoteczne.\n\n` +
      `Kwota: ${kwota}\nOkres: ${okres}\nKW: ${kw}${extraKw.length ? ` (dodatkowe: ${extraKw.join(", ")})` : ""}\n` +
      `Adres: ${address}\nTyp: ${p?.property_type ?? "—"}\nSzacowana wartość: ${value}\n\n` +
      (attachmentsSentence ? `${attachmentsSentence}\n\n` : "") +
      `Pozdrawiam,\n${brokerName}${brokerPhone ? `\ntel. ${brokerPhone}` : ""}\nkontakt@financeyou.pl`;

    return { subject, bodyText, bodyHtml, attachments, brokerName, brokerEmail };
}

/** Buduje draft maila (temat + treść) do inwestorów — NIE wysyła. */
export const buildInvestorDistributionDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        applicationId: z.string().uuid(),
        recipients: z.array(z.string().email()).min(1).max(100),
        audience: z.enum(["instytucjonalny", "indywidualny"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Dystrybucja jest dostępna dla personelu wewnętrznego (dowolny wniosek)
    // oraz dla pośrednika — także darmowego — ale wyłącznie dla JEGO ofert.
    const { assertBrokerOrStaff } = await import("@/lib/access/guards.server");
    const { staff } = await assertBrokerOrStaff(context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: app, error: appErr } = await (supabaseAdmin
      .from("loan_applications") as any)
      .select(
        "id, created_by_partner_user_id, deleted_at, loan_amount, preferred_period_months, client:clients(first_name,last_name,city), properties(property_type,street,address,city,voivodeship,land_register_number,additional_land_register_numbers,area_sqm,estimated_value,photos,description)",
      )
      .eq("id", data.applicationId)
      .maybeSingle();
    if (appErr || !app) throw new Error("Nie znaleziono wniosku");
    if ((app as any).deleted_at) throw new Error("Ta oferta została usunięta");
    if (!staff && (app as any).created_by_partner_user_id !== context.userId) {
      throw new Error("Możesz dystrybuować wyłącznie własne oferty");
    }

    const { data: docs } = await supabaseAdmin
      .from("documents")
      .select("file_name, document_type, file_url, file_path")
      .eq("loan_application_id", data.applicationId);

    const { data: brokerProfile } = await supabaseAdmin
      .from("profiles")
      .select("first_name,last_name,phone,email")
      .eq("user_id", context.userId)
      .maybeSingle();

    const email = buildDistributionEmail(app, docs, brokerProfile);
    return {
      subject: email.subject,
      bodyText: email.bodyText,
      bodyHtml: email.bodyHtml,
      recipients: data.recipients,
      brokerName: email.brokerName,
      brokerEmail: email.brokerEmail,
      attachments: email.attachments,
    };
  });

/**
 * Wysyła ofertę do wybranych inwestorów i ZAPISUJE dystrybucję:
 *  - tworzy/aktualizuje wiersze `offer_distributions` (status „wysłane"),
 *  - wysyła sformatowanego maila (KW, kwota, zdjęcia, dokumenty, stopka),
 *  - loguje wychodzącą wiadomość w `lead_communications` z powiązaniem
 *    (loan_application_id / investor_id / offer_distribution_id), dzięki czemu
 *    odpowiedzi inwestorów można przypisać z powrotem do wniosku.
 * Odpowiedzi trafiają na kontakt@financeyou.pl → webhook inbound je złapie.
 */
export const sendInvestorDistribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        applicationId: z.string().uuid(),
        investorIds: z.array(z.string().uuid()).min(1).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertBrokerOrStaff } = await import("@/lib/access/guards.server");
    const { staff } = await assertBrokerOrStaff(context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: app, error: appErr } = await (supabaseAdmin
      .from("loan_applications") as any)
      .select(
        "id, created_by_partner_user_id, deleted_at, status, loan_amount, preferred_period_months, client:clients(first_name,last_name,city), properties(property_type,street,address,city,voivodeship,land_register_number,additional_land_register_numbers,area_sqm,estimated_value,photos,description)",
      )
      .eq("id", data.applicationId)
      .maybeSingle();
    if (appErr || !app) throw new Error("Nie znaleziono wniosku");
    if ((app as any).deleted_at) throw new Error("Ta oferta została usunięta");
    if (!staff && (app as any).created_by_partner_user_id !== context.userId) {
      throw new Error("Możesz dystrybuować wyłącznie własne oferty");
    }

    const { data: investors } = await supabaseAdmin
      .from("investors")
      .select("id, email, company_name, first_name, last_name, investor_type, is_active")
      .in("id", data.investorIds);
    const recipients = (investors ?? []).filter((i: any) => i.is_active && i.email);
    if (recipients.length === 0) throw new Error("Wybrani inwestorzy nie mają adresu e-mail.");

    const { data: docs } = await supabaseAdmin
      .from("documents")
      .select("file_name, document_type, file_url, file_path")
      .eq("loan_application_id", data.applicationId);

    const { data: brokerProfile } = await supabaseAdmin
      .from("profiles")
      .select("first_name,last_name,phone,email")
      .eq("user_id", context.userId)
      .maybeSingle();

    const email = buildDistributionEmail(app, docs, brokerProfile);

    // Załączniki pobieramy RAZ (Storage/URL → base64) i dołączamy do każdego maila.
    let resolvedAttachments: Array<{ filename: string; content: string; contentType?: string }> = [];
    if (email.attachments.length) {
      const { resolveOutboundAttachments } = await import("./outbound-attachments.server");
      const { attachments } = await resolveOutboundAttachments(
        email.attachments.map((a) => ({ name: a.name, path: a.path ?? null, url: a.url ?? null })),
      );
      resolvedAttachments = attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      }));
    }
    const attachmentRefs = email.attachments.map((a) => ({
      name: a.name,
      path: a.path ?? null,
      url: a.url ?? null,
    }));

    const { sendResendEmail } = await import("./resend-send.server");

    const results: Array<{ investorId: string; email: string; ok: boolean; error?: string }> = [];
    for (const inv of recipients as any[]) {
      // 1) Upsert wiersza dystrybucji (bez duplikatów per wniosek+inwestor).
      const { data: existing } = await supabaseAdmin
        .from("offer_distributions")
        .select("id")
        .eq("loan_application_id", data.applicationId)
        .eq("investor_id", inv.id)
        .maybeSingle();
      let distributionId = existing?.id ?? null;
      const nowIso = new Date().toISOString();
      if (distributionId) {
        await (supabaseAdmin.from("offer_distributions") as any)
          .update({ distribution_status: "wyslane", sent_at: nowIso })
          .eq("id", distributionId);
      } else {
        const { data: ins } = await (supabaseAdmin.from("offer_distributions") as any)
          .insert({
            loan_application_id: data.applicationId,
            investor_id: inv.id,
            distribution_status: "wyslane",
            sent_at: nowIso,
          })
          .select("id")
          .maybeSingle();
        distributionId = ins?.id ?? null;
      }

      // 2) Wyślij maila (odpowiedzi → kontakt@financeyou.pl → webhook inbound).
      const res = await sendResendEmail({
        to: inv.email,
        subject: email.subject,
        text: email.bodyText,
        html: email.bodyHtml,
        replyTo: "kontakt@financeyou.pl",
        attachments: resolvedAttachments.length ? resolvedAttachments : undefined,
      });
      results.push({ investorId: inv.id, email: inv.email, ok: res.ok, error: res.error });

      // 3) Zaloguj wychodzącą wiadomość z powiązaniem do wniosku/inwestora.
      try {
        await (supabaseAdmin.from("lead_communications") as any).insert({
          lead_id: null,
          email: inv.email,
          channel: "email",
          direction: "outbound",
          status: res.ok ? "sent" : "failed",
          subject: email.subject,
          content: email.bodyText,
          external_id: res.id ?? null,
          thread_external_id: res.id ?? null,
          error_message: res.ok ? null : res.error ?? null,
          metadata: {
            kind: "investor_distribution",
            source: "admin_distribution",
            loan_application_id: data.applicationId,
            investor_id: inv.id,
            offer_distribution_id: distributionId,
            sent_by: context.userId,
          },
          attachments: attachmentRefs,
        });
      } catch (e) {
        console.error("[sendInvestorDistribution] log comm error", e);
      }
    }

    // Oznacz wniosek jako dostępny dla inwestorów (i przenieś na etap poszukiwań).
    const sentOk = results.filter((r) => r.ok).length;
    if (sentOk > 0) {
      const patch: Record<string, any> = { available_to_investors: true };
      const earlyStages = ["nowy_lead", "kompletowanie_danych", "do_analizy", "analiza"];
      if (!app.status || earlyStages.includes(String(app.status))) {
        patch.status = "szukamy_inwestora";
      }
      await (supabaseAdmin.from("loan_applications") as any)
        .update(patch)
        .eq("id", data.applicationId);
    }

    return {
      total: recipients.length,
      sent: sentOk,
      failed: results.length - sentOk,
      results,
    };
  });

