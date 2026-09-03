// Rdzeń dystrybucji ofert do inwestorów instytucjonalnych — wydzielony z
// sendOfferDistribution, żeby ręczna wysyłka z panelu i auto-dystrybucja
// (src/lib/auto-distribution/) szły DOKŁADNIE tą samą ścieżką: dedup per
// instytucja, alias zwrotny, log wątku, przejście wniosku w „szukamy_inwestora".
// Bez autoryzacji — wywołujący (server fn po assertAdminOrOperator albo
// silnik cron) odpowiada za uprawnienia.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

export interface DistributionSendResult {
  sent: string[];
  failed: Array<{ investorId: string; error: string }>;
  skipped: string[];
  cardUrl: string;
}

export async function distributeOfferToInvestors(input: {
  applicationId: string;
  /** Puste/nieprzekazane => wysyłka do WSZYSTKICH aktywnych instytucji. */
  investorIds?: string[];
  note?: string;
}): Promise<DistributionSendResult> {
  const { sendResendEmail } = await import("@/lib/resend-send.server");
  const { offerReplyAddress, offerCardUrl } = await import("@/lib/offer-replies.server");

  // 1) Wniosek + nieruchomość + klient
  const { data: app, error: appErr } = await supabaseAdmin
    .from("loan_applications")
    .select(
      "id, status, deleted_at, loan_amount, preferred_period_months, offer_card_token, client:clients(first_name,last_name), properties(property_type,street,address,city,voivodeship,land_register_number,area_sqm,estimated_value)",
    )
    .eq("id", input.applicationId)
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
      .eq("id", input.applicationId);
    if (tokErr) throw new Error(`Nie udało się utworzyć linku Karty oferty: ${tokErr.message}`);
  }
  const cardUrl = offerCardUrl(cardToken);

  // 3) Odbiorcy — wszystkie aktywne instytucje lub tylko zaznaczone
  let invQuery = supabaseAdmin
    .from("investors")
    .select("id, company_name, first_name, last_name, email")
    .eq("investor_type", "instytucjonalny")
    .eq("is_active", true);
  if (input.investorIds?.length) invQuery = invQuery.in("id", input.investorIds);
  const { data: investors, error: invErr } = await invQuery;
  if (invErr) throw new Error(invErr.message);
  if (!investors?.length) throw new Error("Brak aktywnych inwestorów instytucjonalnych do wysyłki");

  // Nie wysyłaj drugi raz do instytucji, która już dostała ten temat
  const { data: existing } = await supabaseAdmin
    .from("offer_distributions")
    .select("investor_id, distribution_status")
    .eq("loan_application_id", input.applicationId);
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
  const noteHtml = input.note
    ? `<p style="margin:16px 0;white-space:pre-wrap">${escapeHtml(input.note)}</p>`
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
    (input.note ? `\n${input.note}\n` : "") +
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
        loan_application_id: input.applicationId,
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
      loan_application_id: input.applicationId,
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
      .eq("id", input.applicationId);
  }

  return { sent, failed, skipped, cardUrl };
}
