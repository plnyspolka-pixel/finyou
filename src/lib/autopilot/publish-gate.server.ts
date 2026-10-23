// Strona serwerowa kontroli końcowej (decyzja: publish-gate.ts). Ticki kolejek
// wołają `gateClaimedItem` zaraz po przejęciu wpisu, przed wywołaniem API
// platformy. Blokada = status `failed` z powodem w `last_error` + wpis
// w dzienniku (module = compliance_gate), bez wysyłki.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { COMPLIANCE_RULES_VERSION } from "./compliance-rules";
import { decideFinalGate } from "./publish-gate";
import { COMPLIANCE_LOG_MODULE } from "./types";

type QueueTable = "social_publish_queue" | "youtube_publish_queue";

export type ClaimedRow = {
  id: string;
  platform: string;
  title: string | null;
  message: string | null;
  track?: string | null;
};

export type ClaimedGateResult =
  | { proceed: true; message: string }
  | { proceed: false; error: string };

const db = supabaseAdmin as unknown as { from: (t: string) => any };

export async function gateClaimedItem(
  table: QueueTable,
  row: ClaimedRow,
): Promise<ClaimedGateResult> {
  const messageColumn = table === "youtube_publish_queue" ? "description" : "message";
  try {
    const d = decideFinalGate(
      { platform: row.platform, title: row.title, message: row.message, track: row.track ?? null },
      COMPLIANCE_RULES_VERSION,
    );
    if (d.action === "publish") {
      if (d.changed) {
        await db
          .from(table)
          .update({ [messageColumn]: d.message })
          .eq("id", row.id);
      }
      return { proceed: true, message: d.message };
    }
    await db.from(table).update({ status: "failed", last_error: d.reason }).eq("id", row.id);
    await db.from("ai_growth_action_log").insert({
      module: COMPLIANCE_LOG_MODULE,
      action: "gate_publish_final",
      status: "blocked",
      summary: `${row.platform}: ${d.reason}`.slice(0, 1000),
      payload: {
        rules_version: COMPLIANCE_RULES_VERSION,
        ref: { table, id: row.id },
        blocks: d.blocks.map((b) => ({ code: b.code, match: b.match ?? null })),
        original_text: `${row.title ?? ""}\n\n${row.message ?? ""}`.slice(0, 20000),
      },
    });
    return { proceed: false, error: d.reason };
  } catch (e) {
    // Błąd samej kontroli = nie publikujemy teraz (wpis wraca do kolejki).
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .from(table)
      .update({ status: "pending", last_error: `Kontrola compliance niedostępna: ${msg}` })
      .eq("id", row.id);
    return { proceed: false, error: msg };
  }
}
