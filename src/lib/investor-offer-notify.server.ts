// Powiadomienie o złożonej ofercie inwestora — do autora wniosku.
//
// Autor = kto dodał wniosek: pośrednik/operator (created_by_partner_user_id,
// rola z user_roles) albo — gdy wniosek przyszedł sam — klient.
// Kanały:
//   1) e-mail (zawsze, jeśli jest adres) — parametry oferty + link do panelu,
//   2) Messenger/Instagram — tylko gdy autor pisał z nami tym kanałem
//      (lead z PSID/IGSID dopasowany po wniosku/kliencie albo e-mailu/telefonie),
//   3) krótki telefon (Twilio <Say>): „jest oferta dla Ciebie na mailu" —
//      tylko gdy mail wyszedł, w godzinach 8–20 czasu warszawskiego.
// Best-effort: błąd kanału nie cofa złożenia oferty. Jedno powiadomienie na
// ofertę (dedup po automation_events).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const NOTIFY_TYPE = "investor_offer_notify";
const CALL_HOURS = { from: 8, to: 20 };

const db = supabaseAdmin as any;

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

type Role = "klient" | "operator" | "posrednik";

interface Recipient {
  role: Role;
  name: string | null;
  email: string | null;
  phone: string | null;
  panelPath: string;
  clientId: string | null;
}

export interface OfferNotifyResult {
  skipped?: string;
  role?: Role;
  email?: { ok: boolean; error?: string };
  messenger?: { ok: boolean; error?: string; platform?: string };
  call?: { ok: boolean; error?: string; sid?: string };
}

async function resolveRecipient(app: any): Promise<Recipient | null> {
  const authorId = app.created_by_partner_user_id as string | null;
  if (authorId) {
    const [{ data: profile }, { data: roles }] = await Promise.all([
      db
        .from("profiles")
        .select("email, phone, first_name, last_name")
        .eq("user_id", authorId)
        .maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", authorId),
    ]);
    const isOperator = (roles ?? []).some(
      (r: { role: string }) => r.role === "operator" || r.role === "administrator",
    );
    const role: Role = isOperator ? "operator" : "posrednik";
    return {
      role,
      name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      panelPath: `/${role}/wnioski/${app.id}`,
      clientId: null,
    };
  }
  const client = app.client;
  if (!client) return null;
  return {
    role: "klient",
    name: client.first_name ?? null,
    email: client.do_not_email ? null : (client.email ?? null),
    phone: client.phone_normalized ?? client.phone ?? null,
    panelPath: "/klient",
    clientId: app.client_id ?? null,
  };
}

/** Lead z PSID/IGSID tej osoby — czyli „korzystała z Messengera/IG". */
async function findMetaRecipient(
  r: Recipient,
  applicationId: string,
  phone: string | null,
): Promise<{ id: string; platform: "messenger" | "instagram"; leadId: string } | null> {
  const ors: string[] = [];
  if (r.role === "klient") {
    ors.push(`loan_application_id.eq.${applicationId}`);
    if (r.clientId) ors.push(`client_id.eq.${r.clientId}`);
  }
  if (r.email) ors.push(`email.ilike.${r.email.replace(/[,()]/g, "")}`);
  if (phone) ors.push(`phone_normalized.eq.${phone}`);
  if (!ors.length) return null;
  const { data: leads } = await db
    .from("leads")
    .select("id, messenger_psid, instagram_igsid")
    .or(ors.join(","))
    .order("updated_at", { ascending: false })
    .limit(20);
  const lead = (leads ?? []).find((l: any) => l.messenger_psid || l.instagram_igsid);
  if (!lead) return null;
  if (lead.messenger_psid)
    return { id: lead.messenger_psid, platform: "messenger", leadId: lead.id };
  if (lead.instagram_igsid)
    return { id: lead.instagram_igsid, platform: "instagram", leadId: lead.id };
  return null;
}

export async function notifyInvestorOfferSubmitted(offerId: string): Promise<OfferNotifyResult> {
  const { data: already } = await db
    .from("automation_events")
    .select("id")
    .eq("automation_type", NOTIFY_TYPE)
    .filter("sent_payload->>offer_id", "eq", offerId)
    .limit(1);
  if (already?.length) return { skipped: "already_notified" };

  const { data: offer } = await db
    .from("investor_offers")
    .select(
      "id, offer_status, loan_application_id, proposed_amount, period_months, expected_yearly_yield, estimated_monthly_payment, estimated_total_cost, balloon_amount",
    )
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) return { skipped: "offer_not_found" };
  if (offer.offer_status !== "zlozona") return { skipped: "not_submitted" };

  const { data: app } = await db
    .from("loan_applications")
    .select(
      "id, client_id, created_by_partner_user_id, client:clients(first_name, email, phone, phone_normalized, do_not_email)",
    )
    .eq("id", offer.loan_application_id)
    .maybeSingle();
  if (!app) return { skipped: "application_not_found" };

  const r = await resolveRecipient(app);
  if (!r) return { skipped: "no_recipient" };

  const { normalizePolishPhone } = await import("@/lib/phone");
  const phone = r.phone ? normalizePolishPhone(r.phone) : { normalized: null, valid: false };
  const phoneE164 = phone.valid ? phone.normalized : null;

  const { resolveAppBaseUrl } = await import("@/lib/access/urls.server");
  const panelUrl = `${resolveAppBaseUrl()}${r.panelPath}`;
  const result: OfferNotifyResult = { role: r.role };
  const { logLeadCommunication } = await import("@/lib/lead-comms.server");

  // Parametry oferty — to samo w mailu i w Messengerze.
  const rows: Array<[string, string]> = [
    ["Kwota", fmtPln(offer.proposed_amount)],
    ["Okres", offer.period_months ? `${offer.period_months} mies.` : "—"],
    [
      "Oprocentowanie roczne",
      offer.expected_yearly_yield != null ? `${Number(offer.expected_yearly_yield)}%` : "—",
    ],
    ["Rata miesięczna", fmtPln(offer.estimated_monthly_payment)],
    ["Łącznie do spłaty", fmtPln(offer.estimated_total_cost)],
  ];
  if (Number(offer.balloon_amount) > 0) rows.push(["Rata balonowa", fmtPln(offer.balloon_amount)]);
  const forWhom = r.role === "klient" ? "na Twój wniosek" : "do wniosku, który dodałeś(-aś)";
  const greeting = r.name ? `Dzień dobry ${r.name},` : "Dzień dobry,";

  // 1) E-mail
  if (r.email) {
    const { sendResendEmail } = await import("@/lib/resend-send.server");
    const subject = "Finance You — masz nową ofertę finansowania";
    const text = [
      greeting,
      "",
      `Inwestor złożył ofertę finansowania ${forWhom}:`,
      ...rows.map(([k, v]) => `• ${k}: ${v}`),
      "",
      `Szczegóły w panelu: ${panelUrl}`,
    ].join("\n");
    const html = `<p>${escapeHtml(greeting)}</p>
<p>Inwestor złożył ofertę finansowania ${escapeHtml(forWhom)}:</p>
<table cellpadding="6" style="border-collapse:collapse">${rows
      .map(
        ([k, v]) =>
          `<tr><td style="color:#64748b">${escapeHtml(k)}</td><td><b>${escapeHtml(v)}</b></td></tr>`,
      )
      .join("")}</table>
<p><a href="${escapeHtml(panelUrl)}">Zobacz szczegóły w panelu</a></p>`;
    const send = await sendResendEmail({
      to: r.email,
      subject,
      text,
      html,
      category: "transactional",
    });
    result.email = { ok: send.ok, error: send.error };
    await logLeadCommunication({
      loanApplicationId: app.id,
      clientId: r.clientId,
      email: r.email,
      channel: "email",
      direction: "outbound",
      subject,
      content: text,
      externalId: send.id ?? null,
      metadata: { source: NOTIFY_TYPE, offer_id: offer.id, role: r.role },
      status: send.ok ? "sent" : "error",
      errorMessage: send.ok ? null : (send.error ?? null),
    });
  }

  // 2) Messenger / Instagram — tylko jeśli ta osoba z nami tam pisała.
  try {
    const meta = await findMetaRecipient(r, app.id, phoneE164);
    if (meta) {
      const { sendMetaMessage } = await import("@/lib/meta-send.server");
      const body = [
        `Inwestor złożył ofertę finansowania ${forWhom}:`,
        ...rows.map(([k, v]) => `• ${k}: ${v}`),
        "",
        `Szczegóły: ${panelUrl}`,
      ].join("\n");
      const send = await sendMetaMessage({
        recipientId: meta.id,
        text: body,
        platform: meta.platform,
        proactive: true,
      });
      result.messenger = { ok: send.ok, error: send.error, platform: meta.platform };
      await logLeadCommunication({
        leadId: meta.leadId,
        channel: "messenger",
        direction: "outbound",
        content: body,
        externalId: send.messageId ?? null,
        metadata: { platform: meta.platform, source: NOTIFY_TYPE, offer_id: offer.id },
        status: send.ok ? "sent" : "error",
        errorMessage: send.ok ? null : (send.error ?? null),
      });
    }
  } catch (e) {
    result.messenger = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // 3) Krótki telefon: „oferta czeka na mailu" — ma sens tylko, gdy mail wyszedł.
  try {
    if (result.email?.ok && phoneE164) {
      const { warsawHourAndWeekday } = await import("@/lib/sms-guard.server");
      const { hour } = warsawHourAndWeekday(new Date());
      const { data: settings } = await db
        .from("voicebot_settings")
        .select("sms_from")
        .eq("id", 1)
        .maybeSingle();
      const from = settings?.sms_from as string | undefined;
      const tw = await import("@/lib/twilio-api.server");
      if (hour < CALL_HOURS.from || hour >= CALL_HOURS.to) {
        result.call = { ok: false, error: "poza godzinami 8–20" };
      } else if (!tw.hasTwilioKeys() || !from) {
        result.call = { ok: false, error: "brak konfiguracji Twilio / numeru nadawcy" };
      } else {
        const message =
          "Dzień dobry, tu Finance You. Mamy dla Ciebie nową ofertę finansowania od inwestora. " +
          "Szczegóły wysłaliśmy na Twój adres e-mail. Dziękujemy, do usłyszenia.";
        const call = await tw.placeCall({ to: phoneE164, from, twiml: tw.sayTwiml(message) });
        result.call = { ok: true, sid: call?.sid };
        await logLeadCommunication({
          loanApplicationId: app.id,
          clientId: r.clientId,
          phoneNormalized: phoneE164,
          channel: "voicebot_call",
          direction: "outbound",
          content: message,
          externalId: call?.sid ?? null,
          metadata: { source: NOTIFY_TYPE, offer_id: offer.id, role: r.role },
          status: "sent",
        });
      }
    }
  } catch (e) {
    result.call = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  await db.from("automation_events").insert({
    automation_type: NOTIFY_TYPE,
    loan_application_id: app.id,
    status: result.email?.ok || result.messenger?.ok || result.call?.ok ? "sent" : "error",
    sent_payload: { offer_id: offer.id, role: r.role, email: r.email, phone: phoneE164 },
    response_payload: result,
  });
  return result;
}
