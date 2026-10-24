import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getConversation } from "./elevenlabs-api.server";
import { normalizePolishPhone } from "./phone";

export function verifiedCallerPhone(conversation: any): string | null {
  // Never accept model-supplied phone, user_id or dynamic variables as identity.
  const raw = conversation?.metadata?.phone_call?.external_number;
  if (typeof raw !== "string") return null;
  const p = normalizePolishPhone(raw);
  return p.valid ? p.normalized : null;
}

export async function saveLoanPurpose(conversationId: string, args: { purpose?: unknown; is_business?: unknown; notes?: unknown; needs?: any }) {
  const purpose = typeof args.purpose === "string" ? args.purpose.trim().slice(0, 4000) : "";
  if (!conversationId || !purpose) return { ok: false, error: "missing_purpose_or_conversation" };
  const conversation = await getConversation(conversationId);
  const phone = verifiedCallerPhone(conversation);
  const db: any = supabaseAdmin;
  // Browser A0 sessions may bind only by a conversation ID already recorded by a trusted hook.
  let query = db.from("leads").select("id, application_data, loan_application_id");
  query = phone ? query.eq("phone_normalized", phone) : query.eq("application_data->>elevenlabs_conversation_id", conversationId);
  const { data: leads, error } = await query.order("created_at", { ascending: false }).limit(2);
  if (error) throw error;
  if (!leads?.length) return { ok: false, error: "no_bound_lead" };
  if (leads.length > 1 && leads[0].loan_application_id !== leads[1].loan_application_id) return { ok: false, error: "ambiguous_lead" };
  const lead = leads[0];
  const applicationData = { ...(lead.application_data ?? {}), purpose,
    ...(typeof args.is_business === "boolean" ? { is_business: args.is_business } : {}),
    ...(typeof args.notes === "string" ? { purpose_notes: args.notes.slice(0, 4000) } : {}),
    ...(args.needs && typeof args.needs === "object" ? { needs: { ...(lead.application_data?.needs ?? {}), ...args.needs, purpose } } : {}),
  };
  const saved = await db.from("leads").update({ application_data: applicationData }).eq("id", lead.id);
  if (saved.error) throw saved.error;
  if (lead.loan_application_id) {
    const savedApp = await db.from("loan_applications").update({ situation_description: purpose }).eq("id", lead.loan_application_id);
    if (savedApp.error) throw savedApp.error;
  }
  await db.from("automation_events").insert({ automation_type: "ania_loan_purpose_saved", status: "sent", sent_payload: { conversation_id: conversationId, lead_id: lead.id, application_id: lead.loan_application_id ?? null } });
  return { ok: true, saved: true };
}