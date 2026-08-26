// Helper do logowania komunikacji w zunifikowanej tabeli lead_communications
// oraz prostego matchowania leada po telefonie/email/loan_application_id/client_id.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function findLeadId(opts: {
  loanApplicationId?: string | null;
  clientId?: string | null;
  metaLeadId?: string | null;
  investorId?: string | null;
  phoneNormalized?: string | null;
  email?: string | null;
}): Promise<string | null> {
  const s = admin();
  const tries: Array<[string, string]> = [];
  if (opts.loanApplicationId) tries.push(["loan_application_id", opts.loanApplicationId]);
  if (opts.clientId) tries.push(["client_id", opts.clientId]);
  if (opts.metaLeadId) tries.push(["meta_lead_id", opts.metaLeadId]);
  if (opts.investorId) tries.push(["investor_id", opts.investorId]);
  for (const [col, val] of tries) {
    const { data } = await s.from("leads").select("id").eq(col, val).maybeSingle();
    if (data?.id) return data.id;
  }
  if (opts.phoneNormalized) {
    const { data } = await s
      .from("leads")
      .select("id")
      .eq("phone_normalized", opts.phoneNormalized)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  if (opts.email) {
    const { data } = await s
      .from("leads")
      .select("id")
      .eq("email", opts.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

export type LogCommArgs = {
  leadId?: string | null;
  loanApplicationId?: string | null;
  clientId?: string | null;
  metaLeadId?: string | null;
  phoneNormalized?: string | null;
  email?: string | null;
  channel:
    | "voicebot_call"
    | "sms"
    | "email"
    | "messenger"
    | "manual_note"
    | "whatsapp"
    | "chat"
    | "chat_inwestor";
  direction?: "inbound" | "outbound";
  status?: string | null;
  subject?: string | null;
  content?: string | null;
  transcript?: any;
  recordingUrl?: string | null;
  durationSeconds?: number | null;
  externalId?: string | null;
  agentId?: string | null;
  metadata?: Record<string, any>;
  errorMessage?: string | null;
  attachments?: any[] | null;
};

export async function logLeadCommunication(args: LogCommArgs): Promise<string | null> {
  const s = admin();
  let leadId = args.leadId ?? null;
  if (!leadId) {
    leadId = await findLeadId({
      loanApplicationId: args.loanApplicationId,
      clientId: args.clientId,
      metaLeadId: args.metaLeadId,
      phoneNormalized: args.phoneNormalized,
      email: args.email,
    });
  }
  const { data, error } = await s
    .from("lead_communications")
    .insert({
      lead_id: leadId,
      phone_normalized: args.phoneNormalized ?? null,
      email: args.email ?? null,
      channel: args.channel,
      direction: args.direction ?? "outbound",
      status: args.status ?? null,
      subject: args.subject ?? null,
      content: args.content ?? null,
      transcript: args.transcript ?? null,
      recording_url: args.recordingUrl ?? null,
      duration_seconds: args.durationSeconds ?? null,
      external_id: args.externalId ?? null,
      agent_id: args.agentId ?? null,
      metadata: args.metadata ?? {},
      error_message: args.errorMessage ?? null,
      // Kolumna `attachments` jest NOT NULL — brak załączników zapisujemy jako pustą tablicę,
      // inaczej cały insert leci 23502 i logi rozmów voicebota/enricha nie trafiają do skrzynki.
      attachments: args.attachments ?? [],
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[lead-comms] insert error", error);
    return null;
  }
  const commId = data?.id ?? null;
  // Push dla operatorów o każdej wiadomości przychodzącej (czat / e-mail /
  // Messenger / SMS / telefon) — z linkiem do właściwej skrzynki w panelu.
  // Best-effort: błąd wysyłki nie może zablokować zalogowania komunikacji.
  if ((args.direction ?? "outbound") === "inbound") {
    try {
      const { pushInboundCommNotification } = await import("./operator-push.server");
      await pushInboundCommNotification({
        commId,
        leadId,
        channel: args.channel,
        subject: args.subject,
        content: args.content,
      });
    } catch (e) {
      console.error("[lead-comms] push notification error", e);
    }
  }
  return commId;
}

/** Upsert leada po telefonie/email — używane przez webhooki źródłowe. */
export async function upsertLeadFromSource(opts: {
  type?: "pozyczkowy" | "inwestorski";
  source: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneRaw?: string | null;
  phoneNormalized?: string | null;
  metaLeadId?: string | null;
  metaFormId?: string | null;
  metaCampaignId?: string | null;
  loanApplicationId?: string | null;
  clientId?: string | null;
  applicationData?: Record<string, any>;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}): Promise<string | null> {
  const s = admin();
  // próba znalezienia istniejącego
  const existingId = await findLeadId({
    loanApplicationId: opts.loanApplicationId,
    clientId: opts.clientId,
    metaLeadId: opts.metaLeadId,
    phoneNormalized: opts.phoneNormalized,
    email: opts.email,
  });
  const payload: Record<string, any> = {
    type: opts.type ?? "pozyczkowy",
    source: opts.source,
    first_name: opts.firstName ?? null,
    last_name: opts.lastName ?? null,
    email: opts.email ?? null,
    phone_raw: opts.phoneRaw ?? null,
    phone_normalized: opts.phoneNormalized ?? null,
    meta_lead_id: opts.metaLeadId ?? null,
    meta_form_id: opts.metaFormId ?? null,
    meta_campaign_id: opts.metaCampaignId ?? null,
    loan_application_id: opts.loanApplicationId ?? null,
    client_id: opts.clientId ?? null,
    utm_source: opts.utmSource ?? null,
    utm_medium: opts.utmMedium ?? null,
    utm_campaign: opts.utmCampaign ?? null,
    application_data: opts.applicationData ?? {},
  };
  if (existingId) {
    // tylko ustawiamy pola które przyszły niepuste (merge nieinwazyjny)
    const upd: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v !== null && v !== undefined && !(typeof v === "object" && Object.keys(v).length === 0))
        upd[k] = v;
    }
    if (Object.keys(upd).length > 0) {
      await s.from("leads").update(upd).eq("id", existingId);
    }
    return existingId;
  }
  const { data, error } = await s.from("leads").insert(payload).select("id").maybeSingle();
  if (error) {
    console.error("[lead-comms] upsert insert error", error);
    return null;
  }
  const leadId = data?.id ?? null;
  if (leadId) {
    try {
      await ensureLoanApplicationForLead(leadId);
    } catch (e) {
      console.error("[lead-comms] ensureLoanApplicationForLead error", e);
    }
    // Push dla operatorów o nowym leadzie — z linkiem do karty leada.
    try {
      const { sendOperatorPush } = await import("./operator-push.server");
      const who =
        [opts.firstName, opts.lastName].filter(Boolean).join(" ").trim() ||
        opts.email ||
        opts.phoneRaw ||
        "bez danych kontaktowych";
      await sendOperatorPush({
        event: "lead:new",
        title: "Nowy lead",
        body: `${who} · źródło: ${opts.source}`,
        url: `/operator/leady/${leadId}`,
        tag: `lead-${leadId}`,
      });
    } catch (e) {
      console.error("[lead-comms] push notification error", e);
    }
  }
  return leadId;
}

/**
 * Zapewnia, że lead ma powiązany `loan_applications` (stub) — dzięki temu
 * sekwencja maili nurture startuje od razu po pojawieniu się leada, jeszcze
 * przed uzupełnieniem wniosku. Idempotentne.
 */
export async function ensureLoanApplicationForLead(leadId: string): Promise<string | null> {
  const s = admin();
  const { data: lead } = await s
    .from("leads")
    .select(
      "id, loan_application_id, client_id, first_name, last_name, email, phone_normalized, phone_raw, source, consent_rodo, consent_marketing, consent_email",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;
  if (lead.loan_application_id) {
    // Samonaprawa: dopnij do wniosku załączniki z wiadomości (Messenger/e-mail),
    // które przyszły zanim wniosek istniał — inaczej listy pokazują „brak plików".
    try {
      const { backfillLeadAttachmentsToDocuments } = await import("./inbound-attachments.server");
      await backfillLeadAttachmentsToDocuments({
        leadId,
        loanApplicationId: lead.loan_application_id as string,
      });
    } catch (e) {
      console.error("[ensureLoanApp] attachments backfill error", e);
    }
    return lead.loan_application_id as string;
  }
  // Sekwencja wychodzi na e-mail — bez e-maila nie ma sensu tworzyć stubu.
  if (!lead.email) return null;

  // Klient: użyj istniejącego lub utwórz z danych leada.
  let clientId: string | null = (lead.client_id as string | null) ?? null;
  if (!clientId) {
    const { data: existingClient } = await s
      .from("clients")
      .select("id")
      .eq("email", lead.email)
      .maybeSingle();
    if (existingClient?.id) {
      clientId = existingClient.id as string;
    } else {
      const { data: newClient, error: cErr } = await s
        .from("clients")
        .insert({
          first_name: lead.first_name ?? "Lead",
          last_name: lead.last_name ?? "—",
          email: lead.email,
          phone: lead.phone_raw ?? null,
          phone_normalized: lead.phone_normalized ?? null,
          source: lead.source ?? "lead",
          consent_rodo: !!lead.consent_rodo,
          consent_marketing: !!lead.consent_marketing,
          consent_email: !!lead.consent_email,
        })
        .select("id")
        .maybeSingle();
      if (cErr) {
        console.error("[ensureLoanApp] client insert error", cErr);
        return null;
      }
      clientId = newClient?.id ?? null;
    }
  }
  if (!clientId) return null;

  const { data: la, error: laErr } = await s
    .from("loan_applications")
    .insert({
      client_id: clientId,
      status: "nowy_lead",
      current_form_step: 1,
      source: lead.source ?? "lead",
    })
    .select("id")
    .maybeSingle();
  if (laErr) {
    console.error("[ensureLoanApp] loan_applications insert error", laErr);
    return null;
  }
  const loanId = la?.id ?? null;
  if (!loanId) return null;

  await s
    .from("leads")
    .update({ loan_application_id: loanId, client_id: clientId })
    .eq("id", leadId);

  // Świeżo utworzony wniosek: przepnij załączniki, które klient przysłał
  // wcześniej (leżały tylko w lead_communications.attachments / Storage).
  try {
    const { backfillLeadAttachmentsToDocuments } = await import("./inbound-attachments.server");
    await backfillLeadAttachmentsToDocuments({ leadId, loanApplicationId: loanId });
  } catch (e) {
    console.error("[ensureLoanApp] attachments backfill error", e);
  }
  return loanId;
}
