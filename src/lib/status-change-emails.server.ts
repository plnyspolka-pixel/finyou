// E-mail do klienta przy zmianie statusu wniosku — zasilany historią
// loan_status_history (trigger łapie każdą zmianę, także z automatów).
// Wysyłamy tylko, gdy zmienia się ETYKIETA KLIENCKA (przetasowania
// operacyjne między statusami braków nie generują maila) i zgodnie z
// zasadą komunikacji: bez obietnic kontaktu z naszej strony.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { clientLoanStatusView } from "./loan-status";
import { resolveAppBaseUrl } from "./access/urls.server";

const BATCH_LIMIT = 50;
/** Wpisy starsze niż to okno oznaczamy jako obsłużone bez wysyłki. */
const MAX_AGE_DAYS = 3;

export interface StatusEmailTickResult {
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
}

export async function processStatusChangeEmails(): Promise<StatusEmailTickResult> {
  const result: StatusEmailTickResult = { processed: 0, sent: 0, skipped: 0, errors: 0 };

  const { data: rows, error } = await (supabaseAdmin as any)
    .from("loan_status_history")
    .select("id, loan_application_id, old_status, new_status, changed_at")
    .is("notified_at", null)
    .order("changed_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) throw new Error(error.message);
  if (!rows?.length) return result;

  const now = Date.now();
  const maxAgeMs = MAX_AGE_DAYS * 24 * 3600 * 1000;

  for (const row of rows as any[]) {
    result.processed += 1;
    let outcome: "sent" | "skipped" | "error" = "skipped";
    try {
      outcome = await handleRow(row, now - maxAgeMs);
    } catch (e: any) {
      console.error("[status-email] row error", row.id, e?.message);
      outcome = "error";
    }
    if (outcome === "sent") result.sent += 1;
    else if (outcome === "error") result.errors += 1;
    else result.skipped += 1;

    // Oznaczamy jako obsłużone również skip (żeby nie mielić w kółko);
    // błędy zostają do ponowienia w kolejnym ticku.
    if (outcome !== "error") {
      await (supabaseAdmin as any)
        .from("loan_status_history")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }
  return result;
}

async function handleRow(
  row: { id: string; loan_application_id: string; old_status: string | null; new_status: string; changed_at: string },
  oldestAllowedMs: number,
): Promise<"sent" | "skipped"> {
  // Wpis startowy (założenie wniosku) i stare zaległości — bez maila.
  if (!row.old_status) return "skipped";
  if (new Date(row.changed_at).getTime() < oldestAllowedMs) return "skipped";

  const next = clientLoanStatusView(row.new_status);
  const prev = clientLoanStatusView(row.old_status);
  // Przetasowanie operacyjne — klient widzi tę samą etykietę, nie spamujemy.
  if (next.label === prev.label) return "skipped";

  const { data: loan } = await supabaseAdmin
    .from("loan_applications")
    .select("id, client_id")
    .eq("id", row.loan_application_id)
    .maybeSingle();
  if (!loan?.client_id) return "skipped";

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, first_name, email, do_not_email, user_id")
    .eq("id", loan.client_id)
    .maybeSingle();
  if (!client?.email || client.do_not_email) return "skipped";
  // Mail o statusie w panelu ma sens tylko dla klienta z kontem.
  if (!client.user_id) return "skipped";

  const panelUrl = `${resolveAppBaseUrl()}/klient`;
  const hello = client.first_name ? `Dzień dobry, ${client.first_name}!` : "Dzień dobry!";
  const text = [
    hello,
    "",
    `Status Twojego wniosku zmienił się na: ${next.label}.`,
    "",
    next.description,
    "",
    `Szczegóły i pełna historia: ${panelUrl}`,
  ].join("\n");

  const { sendResendEmail } = await import("./resend-send.server");
  const sent = await sendResendEmail({
    to: client.email,
    subject: `Status Twojego wniosku: ${next.label}`,
    text,
  });
  if (!sent.ok) {
    console.warn("[status-email] send failed", client.email, sent.error);
    // Trwałe przyczyny (suppression, brak tematu/konfiguracji) — skip bez
    // ponowień; wszystko inne (np. chwilowa awaria Resend) → błąd, wpis
    // zostaje bez notified_at i następny tick ponowi (okno MAX_AGE_DAYS
    // ogranicza ponowienia w czasie).
    const permanent = ["recipient_suppressed", "missing_subject"].includes(sent.error ?? "");
    if (permanent) return "skipped";
    throw new Error(sent.error ?? "send failed");
  }

  // Ślad w skrzynce panelu — wiadomość widoczna jak każda inna wysyłka.
  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("email", client.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lead?.id) {
      const { logLeadCommunication } = await import("./lead-comms.server");
      await logLeadCommunication({
        leadId: lead.id,
        channel: "email",
        direction: "outbound",
        content: text,
        status: "sent",
        metadata: { source: "status_change_email", loan_status: next.status },
      });
    }
  } catch (e) {
    console.error("[status-email] log error", e);
  }
  return "sent";
}
