// Dystrybucja ofert do inwestorów instytucjonalnych — realna wysyłka e-mail.
//
// Z panelu admina wysyłamy temat pożyczkowy do WSZYSTKICH aktywnych inwestorów
// instytucjonalnych albo do zaznaczonych. Każdy mail:
//   - zawiera link do publicznej Karty oferty (/karta/<token>),
//   - wychodzi z Reply-To: oferta+<distribution_id>@<domena> (dedykowany alias),
//     dzięki czemu odpowiedź instytucji wraca inbound webhookiem prosto na
//     kartę wniosku (offer_distribution_messages) — patrz offer-replies.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SupabaseLike = { from: (t: string) => any };

async function assertAdminOrOperator(supabase: SupabaseLike, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some(
    (r: { role: string }) => r.role === "administrator" || r.role === "operator",
  );
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");
}

function fmtPln(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(Number(v));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Aktywni inwestorzy instytucjonalni (odbiorcy dystrybucji). */
export const listInstitutionalInvestors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await assertAdminOrOperator(supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("investors")
      .select("id, company_name, first_name, last_name, email, subscription_status")
      .eq("investor_type", "instytucjonalny")
      .eq("is_active", true)
      .order("company_name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Wysyła ofertę e-mailem do inwestorów instytucjonalnych.
 * investorIds puste/nieprzekazane => wysyłka do WSZYSTKICH aktywnych instytucji.
 */
export const sendOfferDistribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        applicationId: z.string().uuid(),
        investorIds: z.array(z.string().uuid()).max(500).optional(),
        note: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await assertAdminOrOperator(supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendResendEmail } = await import("@/lib/resend-send.server");
    const { offerReplyAddress, offerCardUrl } = await import("@/lib/offer-replies.server");

    // 1) Wniosek + nieruchomość + klient
    const { data: app, error: appErr } = await supabaseAdmin
      .from("loan_applications")
      .select(
        "id, status, deleted_at, loan_amount, preferred_period_months, offer_card_token, client:clients(first_name,last_name), properties(property_type,street,address,city,voivodeship,land_register_number,area_sqm,estimated_value)",
      )
      .eq("id", data.applicationId)
      .maybeSingle();
    if (appErr || !app) throw new Error("Nie znaleziono wniosku");
    if ((app as any).deleted_at) throw new Error("Ten wniosek został usunięty");

    // 2) Publiczna Karta oferty — token generowany przy pierwszej wysyłce
    let cardToken = (app as any).offer_card_token as string | null;
    if (!cardToken) {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      cardToken = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      const { error: tokErr } = await supabaseAdmin
        .from("loan_applications")
        .update({ offer_card_token: cardToken })
        .eq("id", data.applicationId);
      if (tokErr) throw new Error(`Nie udało się utworzyć linku Karty oferty: ${tokErr.message}`);
    }
    const cardUrl = offerCardUrl(cardToken);

    // 3) Odbiorcy — wszystkie aktywne instytucje lub tylko zaznaczone
    let invQuery = supabaseAdmin
      .from("investors")
      .select("id, company_name, first_name, last_name, email")
      .eq("investor_type", "instytucjonalny")
      .eq("is_active", true);
    if (data.investorIds?.length) invQuery = invQuery.in("id", data.investorIds);
    const { data: investors, error: invErr } = await invQuery;
    if (invErr) throw new Error(invErr.message);
    if (!investors?.length)
      throw new Error("Brak aktywnych inwestorów instytucjonalnych do wysyłki");

    // Nie wysyłaj drugi raz do instytucji, która już dostała ten temat
    const { data: existing } = await supabaseAdmin
      .from("offer_distributions")
      .select("investor_id, distribution_status")
      .eq("loan_application_id", data.applicationId);
    const alreadySent = new Set(
      (existing ?? [])
        .filter((d: any) => !["szkic", "gotowe_do_wysylki"].includes(d.distribution_status))
        .map((d: any) => d.investor_id),
    );

    // 4) Treść maila
    const p: any = Array.isArray((app as any).properties)
      ? (app as any).properties[0]
      : (app as any).properties;
    const kw = p?.land_register_number ?? "—";
    const address =
      [p?.street ?? p?.address, p?.city, p?.voivodeship].filter(Boolean).join(", ") || "—";
    const kwota = fmtPln((app as any).loan_amount);
    const okres = (app as any).preferred_period_months
      ? `${(app as any).preferred_period_months} mies.`
      : "—";
    const value = fmtPln(p?.estimated_value);

    const subject = `Temat pożyczkowy pod zabezpieczenie hipoteczne — ${kwota} · KW ${kw}`;
    const noteHtml = data.note
      ? `<p style="margin:16px 0;white-space:pre-wrap">${escapeHtml(data.note)}</p>`
      : "";
    const bodyHtml = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;max-width:640px">
        <p>Dzień dobry,</p>
        <p>przesyłamy temat pożyczkowy pod zabezpieczenie hipoteczne. Najważniejsze parametry:</p>
        <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
          <tr><td style="padding:6px 0;color:#64748b">Wnioskowana kwota</td><td style="padding:6px 0;text-align:right;font-weight:700">${kwota}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Preferowany okres</td><td style="padding:6px 0;text-align:right">${okres}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Numer KW</td><td style="padding:6px 0;text-align:right;font-family:monospace">${kw}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Adres nieruchomości</td><td style="padding:6px 0;text-align:right">${escapeHtml(address)}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Typ nieruchomości</td><td style="padding:6px 0;text-align:right">${p?.property_type ?? "—"}</td></tr>
          ${p?.area_sqm ? `<tr><td style="padding:6px 0;color:#64748b">Powierzchnia</td><td style="padding:6px 0;text-align:right">${p.area_sqm} m²</td></tr>` : ""}
          <tr><td style="padding:6px 0;color:#64748b">Szacowana wartość</td><td style="padding:6px 0;text-align:right">${value}</td></tr>
        </table>
        ${noteHtml}
        <p style="margin:20px 0">
          <a href="${cardUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">
            Zobacz pełną Kartę oferty
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">Karta oferty zawiera pełną treść księgi wieczystej, lokalizację z mapą, dane o okolicy i wycenę z analizy ryzyka.</p>
        <p>Aby złożyć ofertę finansowania lub zadać pytanie, wystarczy <b>odpowiedzieć na tego maila</b> — odpowiedź trafi bezpośrednio do opiekuna tematu.</p>
      </div>
    `;
    const bodyText =
      `Dzień dobry,\n\nprzesyłamy temat pożyczkowy pod zabezpieczenie hipoteczne.\n\n` +
      `Kwota: ${kwota}\nOkres: ${okres}\nKW: ${kw}\nAdres: ${address}\nTyp: ${p?.property_type ?? "—"}\nSzacowana wartość: ${value}\n` +
      (data.note ? `\n${data.note}\n` : "") +
      `\nPełna Karta oferty: ${cardUrl}\n\n` +
      `Aby złożyć ofertę finansowania lub zadać pytanie, wystarczy odpowiedzieć na tego maila.`;

    // 5) Wysyłka per inwestor: dystrybucja -> mail (Reply-To: alias) -> log wątku
    const sent: string[] = [];
    const failed: Array<{ investorId: string; error: string }> = [];
    const skipped: string[] = [];

    for (const inv of investors) {
      const invName =
        inv.company_name || [inv.first_name, inv.last_name].filter(Boolean).join(" ") || inv.id;
      if (alreadySent.has(inv.id)) {
        skipped.push(invName);
        continue;
      }
      if (!inv.email) {
        failed.push({ investorId: inv.id, error: `${invName}: brak adresu e-mail` });
        continue;
      }

      const { data: dist, error: distErr } = await supabaseAdmin
        .from("offer_distributions")
        .insert({
          loan_application_id: data.applicationId,
          investor_id: inv.id,
          distribution_status: "wyslane" as any,
          sent_at: new Date().toISOString(),
          email_status: "sending",
        })
        .select("id")
        .single();
      if (distErr || !dist) {
        failed.push({ investorId: inv.id, error: `${invName}: ${distErr?.message ?? "błąd"}` });
        continue;
      }

      const replyTo = offerReplyAddress(dist.id);
      const send = await sendResendEmail({
        to: inv.email,
        subject,
        text: bodyText,
        html: bodyHtml,
        replyTo,
        showReplyHint: true,
      });

      await supabaseAdmin
        .from("offer_distributions")
        .update({
          email_status: send.ok ? "sent" : "error",
          email_message_id: send.id ?? null,
          email_error: send.ok ? null : (send.error ?? "błąd wysyłki"),
        })
        .eq("id", dist.id);

      await supabaseAdmin.from("offer_distribution_messages").insert({
        distribution_id: dist.id,
        loan_application_id: data.applicationId,
        investor_id: inv.id,
        direction: "outbound",
        subject,
        content: bodyText,
        html: bodyHtml,
        from_email: replyTo,
        to_email: inv.email,
        message_id: send.id ?? null,
      });

      if (send.ok) sent.push(invName);
      else failed.push({ investorId: inv.id, error: `${invName}: ${send.error ?? "błąd"}` });
    }

    // 6) Wniosek przechodzi w „szukamy inwestora" po pierwszej realnej wysyłce
    if (sent.length > 0) {
      await supabaseAdmin
        .from("loan_applications")
        .update({ status: "szukamy_inwestora" as any })
        .eq("id", data.applicationId);
    }

    return { sent, failed, skipped, cardUrl };
  });

/**
 * Odpowiedź admina/operatora na wiadomość inwestora — mail wychodzi w tym samym
 * wątku (Re: + In-Reply-To/References) i z Reply-To na alias oferta+<uuid>@,
 * więc kolejna odpowiedź instytucji również wróci na kartę wniosku.
 */
export const sendDistributionReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        distributionId: z.string().uuid(),
        content: z.string().trim().min(1).max(10000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await assertAdminOrOperator(supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendResendEmail } = await import("@/lib/resend-send.server");
    const { offerReplyAddress } = await import("@/lib/offer-replies.server");

    const { data: dist, error: distErr } = await supabaseAdmin
      .from("offer_distributions")
      .select("id, loan_application_id, investor_id, investor:investors(email)")
      .eq("id", data.distributionId)
      .maybeSingle();
    if (distErr || !dist) throw new Error("Nie znaleziono dystrybucji");
    const investor: any = Array.isArray((dist as any).investor)
      ? (dist as any).investor[0]
      : (dist as any).investor;
    if (!investor?.email) throw new Error("Inwestor nie ma adresu e-mail");

    // Wątek: temat i nagłówki z dotychczasowej korespondencji tej dystrybucji
    const { data: msgs } = await supabaseAdmin
      .from("offer_distribution_messages")
      .select("direction, subject, message_id, created_at")
      .eq("distribution_id", dist.id)
      .order("created_at", { ascending: true });
    const lastInbound = [...(msgs ?? [])].reverse().find((m: any) => m.direction === "inbound");
    const baseSubject =
      (lastInbound?.subject as string | null) ||
      (msgs?.[0]?.subject as string | null) ||
      "Temat pożyczkowy";
    const subject = /^\s*re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`;
    // In-Reply-To/References tylko z prawdziwych Message-ID (zawierają "@") —
    // wychodzące wpisy trzymają ID z API Resend, które nie nadaje się do wątku.
    const inReplyTo =
      lastInbound?.message_id && String(lastInbound.message_id).includes("@")
        ? (lastInbound.message_id as string)
        : null;
    const references =
      (msgs ?? [])
        .map((m: any) => m.message_id)
        .filter((mid: any): mid is string => typeof mid === "string" && mid.includes("@"))
        .join(" ") || null;

    const replyTo = offerReplyAddress(dist.id);
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;max-width:640px;white-space:pre-wrap">${escapeHtml(
        data.content,
      )}</div>
    `;
    const send = await sendResendEmail({
      to: investor.email,
      subject,
      text: data.content,
      html,
      replyTo,
      inReplyTo,
      references,
      showReplyHint: true,
    });
    if (!send.ok) throw new Error(send.error ?? "Wysyłka nie powiodła się");

    await supabaseAdmin.from("offer_distribution_messages").insert({
      distribution_id: dist.id,
      loan_application_id: dist.loan_application_id,
      investor_id: dist.investor_id,
      direction: "outbound",
      subject,
      content: data.content,
      html,
      from_email: replyTo,
      to_email: investor.email,
      message_id: send.id ?? null,
      in_reply_to: inReplyTo,
    });

    return { ok: true as const };
  });

/** Dystrybucje wniosku wraz z wątkami korespondencji (odpowiedzi instytucji). */
export const getDistributionThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await assertAdminOrOperator(supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: distributions }, { data: messages }] = await Promise.all([
      supabaseAdmin
        .from("offer_distributions")
        .select(
          "id, distribution_status, sent_at, responded_at, response_summary, email_status, email_error, created_at, investor:investors(id, company_name, first_name, last_name, email)",
        )
        .eq("loan_application_id", data.applicationId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("offer_distribution_messages")
        .select(
          "id, distribution_id, direction, subject, content, from_email, to_email, attachments, created_at",
        )
        .eq("loan_application_id", data.applicationId)
        .order("created_at", { ascending: true }),
    ]);

    return {
      distributions: distributions ?? [],
      messages: messages ?? [],
    };
  });
