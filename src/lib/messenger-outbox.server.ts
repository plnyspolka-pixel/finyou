// Kolejka wiadomości wychodzących Messenger/IG (tabela messenger_outbox).
// Wiersze wstawia system lub operator (service role); wysyła je
// follow-up-tick (pg_cron co 15 min). Dzięki temu wiadomość jako Strona
// można zakolejkować z dowolnego miejsca, które ma dostęp do bazy,
// bez dostępu do META_PAGE_ACCESS_TOKEN.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMetaMessage } from "@/lib/meta-send.server";
import { logLeadCommunication } from "@/lib/lead-comms.server";

export async function processMessengerOutbox(): Promise<{ sent: number; errors: number }> {
  let sent = 0;
  let errors = 0;
  // Tabela spoza wygenerowanych typów Supabase (do czasu regeneracji types.ts).
  const sb = supabaseAdmin as any;

  const { data: pending } = await sb
    .from("messenger_outbox")
    .select("id, lead_id, body")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(20);

  for (const row of pending ?? []) {
    // Atomowe przejęcie wiersza — dwa równoległe ticki nie wyślą tej samej
    // wiadomości dwa razy (update warunkowy pending → sending).
    const { data: claimed } = await sb
      .from("messenger_outbox")
      .update({ status: "sending" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed?.length) continue;

    const { data: lead } = await sb
      .from("leads")
      .select("messenger_psid, instagram_igsid")
      .eq("id", row.lead_id)
      .maybeSingle();

    const recipientId = lead?.messenger_psid ?? lead?.instagram_igsid;
    if (!recipientId) {
      await sb
        .from("messenger_outbox")
        .update({ status: "skipped", error_message: "lead bez PSID/IGSID" })
        .eq("id", row.id);
      continue;
    }
    const platform: "messenger" | "instagram" = lead?.messenger_psid ? "messenger" : "instagram";

    const res = await sendMetaMessage({ recipientId, text: row.body, platform });

    await sb
      .from("messenger_outbox")
      .update({
        status: res.ok ? "sent" : "error",
        error_message: res.ok ? null : (res.error ?? "send_failed"),
        sent_at: res.ok ? new Date().toISOString() : null,
      })
      .eq("id", row.id);

    await logLeadCommunication({
      leadId: row.lead_id,
      channel: "messenger",
      direction: "outbound",
      content: row.body,
      externalId: res.messageId ?? null,
      metadata: { platform, source: "outbox" },
      status: res.ok ? "sent" : "error",
      errorMessage: res.ok ? null : res.error,
    });

    if (res.ok) sent += 1;
    else errors += 1;
  }

  return { sent, errors };
}
