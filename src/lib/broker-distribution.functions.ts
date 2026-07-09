import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Wysyła temat pożyczkowy (KW + zdjęcia + dokumenty + kwota) do wybranych inwestorów. */
export const sendApplicationToInvestors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        applicationId: z.string().uuid(),
        recipients: z.array(z.string().email()).min(1).max(100),
        audience: z.enum(["instytucjonalny", "prywatny"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isOperator }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "administrator" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operator" }),
    ]);
    if (!isAdmin && !isOperator) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: app, error: appErr } = await supabaseAdmin
      .from("loan_applications")
      .select(
        "id, loan_amount, preferred_period_months, client:clients(first_name,last_name,city), properties(property_type,street,address,city,voivodeship,land_register_number,additional_land_register_numbers,area_sqm,estimated_value,photos,description)",
      )
      .eq("id", data.applicationId)
      .maybeSingle();
    if (appErr || !app) throw new Error("Nie znaleziono wniosku");

    const { data: docs } = await supabaseAdmin
      .from("documents")
      .select("file_name, document_type, file_url")
      .eq("loan_application_id", data.applicationId);

    const { data: brokerProfile } = await supabaseAdmin
      .from("profiles")
      .select("first_name,last_name,phone,email")
      .eq("user_id", context.userId)
      .maybeSingle();

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

    const photosHtml = photos.length
      ? `<div style="margin:16px 0"><div style="font-weight:600;margin-bottom:8px">Zdjęcia nieruchomości (${photos.length})</div><div style="display:flex;flex-wrap:wrap;gap:8px">${photos
          .map(
            (u) =>
              `<a href="${u}" style="display:inline-block"><img src="${u}" alt="" style="width:140px;height:100px;object-fit:cover;border-radius:8px;border:1px solid #e2e8f0" /></a>`,
          )
          .join("")}</div></div>`
      : "";

    const docsHtml = docs && docs.length
      ? `<div style="margin:16px 0"><div style="font-weight:600;margin-bottom:8px">Dokumenty (${docs.length})</div><ul style="padding-left:18px;margin:0">${docs
          .map(
            (d: any) =>
              `<li style="margin:4px 0"><a href="${d.file_url ?? "#"}">${d.file_name ?? d.document_type ?? "Dokument"}</a>${
                d.document_type ? ` <span style="color:#64748b">· ${d.document_type}</span>` : ""
              }</li>`,
          )
          .join("")}</ul></div>`
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
        ${brokerEmail ? `<div>${brokerEmail}</div>` : ""}
      </div>
    `;

    const bodyHtml = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;max-width:640px">
        <p>Dzień dobry,</p>
        <p>przesyłam temat pożyczkowy pod zabezpieczenie hipoteczne. Poniżej najważniejsze parametry:</p>
        ${facts}
        ${photosHtml}
        ${docsHtml}
        ${opis}
        <p>Zapraszam do kontaktu w sprawie oferty finansowania.</p>
        ${signature}
      </div>
    `;

    const bodyText =
      `Dzień dobry,\n\nprzesyłam temat pożyczkowy pod zabezpieczenie hipoteczne.\n\n` +
      `Kwota: ${kwota}\nOkres: ${okres}\nKW: ${kw}${extraKw.length ? ` (dodatkowe: ${extraKw.join(", ")})` : ""}\n` +
      `Adres: ${address}\nTyp: ${p?.property_type ?? "—"}\nSzacowana wartość: ${value}\n\n` +
      (photos.length ? `Zdjęcia (${photos.length}):\n${photos.join("\n")}\n\n` : "") +
      (docs && docs.length
        ? `Dokumenty:\n${docs.map((d: any) => `- ${d.file_name ?? d.document_type ?? "Dokument"}: ${d.file_url ?? ""}`).join("\n")}\n\n`
        : "") +
      `Pozdrawiam,\n${brokerName}${brokerPhone ? `\ntel. ${brokerPhone}` : ""}${brokerEmail ? `\n${brokerEmail}` : ""}`;

    const { sendResendEmail } = await import("./resend-send.server");
    const { logLeadCommunication } = await import("./lead-comms.server");

    const results: Array<{ email: string; ok: boolean; error?: string }> = [];
    for (const to of data.recipients) {
      const res = await sendResendEmail({
        to,
        subject,
        text: bodyText,
        html: bodyHtml,
        fromName: brokerName,
        replyTo: brokerEmail || undefined,
        showReplyHint: true,
      });
      results.push({ email: to, ok: res.ok, error: res.error });
      try {
        await logLeadCommunication({
          leadId: null,
          email: to,
          channel: "email",
          direction: "outbound",
          status: res.ok ? "sent" : "failed",
          subject,
          content: bodyText,
          externalId: res.id ?? null,
          metadata: {
            source: "broker_distribution",
            audience: data.audience,
            application_id: data.applicationId,
            sent_by: context.userId,
          },
        });
      } catch (e) {
        console.error("[broker-distribution] log error", e);
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return { ok: okCount > 0, sent: okCount, total: results.length, results };
  });
