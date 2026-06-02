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
    const { data } = await s.from("leads").select("id").eq("phone_normalized", opts.phoneNormalized).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.id) return data.id;
  }
  if (opts.email) {
    const { data } = await s.from("leads").select("id").eq("email", opts.email).order("created_at", { ascending: false }).limit(1).maybeSingle();
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
  channel: "voicebot_call" | "sms" | "email" | "messenger" | "manual_note" | "whatsapp";
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
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[lead-comms] insert error", error);
    return null;
  }
  return data?.id ?? null;
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
      if (v !== null && v !== undefined && !(typeof v === "object" && Object.keys(v).length === 0)) upd[k] = v;
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
  return data?.id ?? null;
}
