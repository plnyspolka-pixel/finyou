// Zapis znacznika "wniosek rozpoczęty" na leadzie. Od tego momentu lead
// znika z puli sprzedażowej pośredników/operatorów-partnerów (RLS:
// leads_partner_pool_select) i pozostaje widoczny tylko dla personelu
// wewnętrznego oraz samego klienta.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Idempotentnie oznacza rozpoczęcie wniosku na leadzie. */
export async function markLeadApplicationStarted(
  leadId: string | null | undefined,
  source: string,
): Promise<void> {
  if (!leadId) return;
  const { error } = await admin()
    .from("leads")
    .update({
      application_started_at: new Date().toISOString(),
      application_started_source: source,
    })
    .eq("id", leadId)
    .is("application_started_at", null);
  if (error) console.error("[leads-split] markLeadApplicationStarted", leadId, error.message);
}

/** Jak wyżej, ale adresuje leady po powiązanym wniosku pożyczkowym. */
export async function markLeadApplicationStartedByLoan(
  loanApplicationId: string | null | undefined,
  source: string,
): Promise<void> {
  if (!loanApplicationId) return;
  const { error } = await admin()
    .from("leads")
    .update({
      application_started_at: new Date().toISOString(),
      application_started_source: source,
    })
    .eq("loan_application_id", loanApplicationId)
    .is("application_started_at", null);
  if (error) {
    console.error(
      "[leads-split] markLeadApplicationStartedByLoan",
      loanApplicationId,
      error.message,
    );
  }
}

/**
 * Czy lead prowadził już dwustronną rozmowę (jakikolwiek nasz outbound)?
 * Chroni pulę przed znikaniem leadów z samego pierwszego inboundu
 * (np. wiadomość powitalna z reklamy Meta z danymi formularza).
 */
export async function leadHasOutboundCommunication(leadId: string): Promise<boolean> {
  const { count } = await admin()
    .from("lead_communications")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("direction", "outbound")
    .in("channel", ["messenger", "instagram", "chat", "email", "sms", "voicebot_call", "call"]);
  return (count ?? 0) > 0;
}
