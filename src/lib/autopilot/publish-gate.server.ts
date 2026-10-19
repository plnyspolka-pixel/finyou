// Strona serwerowa ostatniej bramki przed publikacją (decyzja: publish-gate.ts).
// Wołana przez ticki kolejek tuż po przejęciu wpisu, przed wywołaniem API
// platformy. Zapisuje audyt (ai_compliance_checks) i stan bramki na wpisie.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { COMPLIANCE_RULES_VERSION } from "./compliance-rules";
import { captionKindFor, decidePublishGate, type GateDecision } from "./publish-gate";
import { COMPLIANCE_MODULE, loadAutopilotSettings, logAutopilotAction } from "./state.server";

type QueueTable = "social_publish_queue" | "youtube_publish_queue";

export type GateRow = {
  id: string;
  platform: string;
  title: string | null;
  message: string | null;
  track?: string | null;
  autopilot?: boolean | null;
  compliance_status?: string | null;
};

/**
 * Bramka dla jednego wpisu. Zwraca decyzję; przy `publish` wpis ma już
 * zapisany ostateczny opis (z elementami obowiązkowymi), przy `block` /
 * `disabled` — status `failed` z opisem w `last_error`, przy `defer` —
 * status `pending` (wraca przy kolejnym ticku po zwolnieniu wyłącznika).
 */
export async function runPublishGate(table: QueueTable, row: GateRow): Promise<GateDecision> {
  const settings = await loadAutopilotSettings();
  const decision = decidePublishGate(
    {
      platform: row.platform,
      title: row.title,
      message: row.message,
      track: row.track ?? null,
      autopilot: !!row.autopilot,
    },
    settings,
  );
  const now = new Date().toISOString();
  const messageColumn = table === "youtube_publish_queue" ? "description" : "message";

  if (decision.action === "publish") {
    const patch: Record<string, unknown> = {
      compliance_status: "passed",
      compliance_checked_at: now,
      track: decision.track,
    };
    if (decision.changed) patch[messageColumn] = decision.message;
    // Wpis wracający po odroczeniu (kompresja, limit API) przeszedł już
    // bramkę z tym samym tekstem — bez kolejnego wiersza audytu.
    const alreadyPassed = row.compliance_status === "passed" && !decision.changed;
    if (!alreadyPassed) {
      await safeUpdate(table, row.id, patch, [messageColumn]);
      await audit(table, row, "passed", decision.track, [], decision.added, decision.message);
    }
    return decision;
  }

  if (decision.action === "defer") {
    await safeUpdate(table, row.id, { status: "pending", last_error: decision.reason }, [
      "status",
      "last_error",
    ]);
    return decision;
  }

  const blockedTrack = decision.action === "block" ? decision.track : "oba";
  await safeUpdate(
    table,
    row.id,
    {
      status: "failed",
      last_error: decision.reason,
      compliance_status: decision.action === "block" ? "blocked" : null,
      compliance_checked_at: now,
    },
    ["status", "last_error"],
  );
  if (decision.action === "block") {
    await audit(table, row, "blocked", blockedTrack, decision.violations, [], null);
    await logAutopilotAction({
      module: COMPLIANCE_MODULE,
      action: "publish_blocked",
      status: "blocked",
      summary: `${row.platform}: ${decision.reason}`,
      payload: { table, id: row.id, violations: decision.violations },
    });
  }
  return decision;
}

/**
 * Zapis z zapasem: gdy kolumny bramki jeszcze nie istnieją (kod wdrożony
 * przed migracją), powtarzamy zapis tylko z kolumnami, które są na pewno —
 * wpis nie może zostać w „publishing”.
 */
async function safeUpdate(
  table: QueueTable,
  id: string,
  patch: Record<string, unknown>,
  essentialKeys: string[],
): Promise<void> {
  const { error } = await supabaseAdmin
    .from(table)
    .update(patch as never)
    .eq("id", id);
  if (!error) return;
  const essential = Object.fromEntries(
    Object.entries(patch).filter(([k]) => essentialKeys.includes(k)),
  );
  if (!Object.keys(essential).length) return;
  await supabaseAdmin
    .from(table)
    .update(essential as never)
    .eq("id", id);
}

async function audit(
  table: QueueTable,
  row: GateRow,
  result: "passed" | "blocked",
  track: string,
  violations: unknown[],
  added: string[],
  finalText: string | null,
): Promise<void> {
  const { error } = await supabaseAdmin.from("ai_compliance_checks").insert({
    content_kind: captionKindFor(row.platform),
    track,
    ref_table: table,
    ref_id: row.id,
    rules_version: COMPLIANCE_RULES_VERSION,
    result,
    iterations: 0,
    hard_violations: violations as never,
    reviewer: [] as never,
    mandatory_added: added,
    original_text: `${row.title ?? ""}\n\n${row.message ?? ""}`.slice(0, 20000),
    final_text: finalText,
  });
  if (error) console.warn(`[compliance] audit: ${error.message}`);
}

export type ClaimedGateResult =
  | { proceed: true; title: string; message: string }
  | { proceed: false; deferred: boolean; error: string };

/**
 * Skrót dla ticków: bramka na przejętym wpisie. Błąd samej bramki (np. baza)
 * zatrzymuje publikację tego wpisu — lepiej opóźnić niż opublikować bez kontroli.
 */
export async function gateClaimedItem(table: QueueTable, row: GateRow): Promise<ClaimedGateResult> {
  try {
    const d = await runPublishGate(table, row);
    if (d.action === "publish") return { proceed: true, title: d.title, message: d.message };
    return { proceed: false, deferred: d.action === "defer", error: d.reason };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from(table)
      .update({ status: "pending", last_error: `Bramka compliance niedostępna: ${msg}` } as never)
      .eq("id", row.id);
    return { proceed: false, deferred: true, error: msg };
  }
}
