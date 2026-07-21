// Nieusuwalny audit log AML — każda zmiana statusu, decyzja, podpis,
// wysyłka i odpowiedź GIIF trafia tutaj. Tabela jest append-only
// (trigger blokuje UPDATE/DELETE nawet dla właściciela).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AmlAuditEntity =
  | "settings"
  | "customer"
  | "screening"
  | "risk_assessment"
  | "transaction"
  | "threshold_entry"
  | "case"
  | "report"
  | "certificate"
  | "submission";

export async function amlAudit(entry: {
  userId: string;
  actorId?: string;
  entityType: AmlAuditEntity;
  entityId?: string | null;
  action: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("aml_audit_log").insert({
    user_id: entry.userId,
    actor_id: entry.actorId ?? entry.userId,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    action: entry.action,
    details: (entry.details ?? {}) as never,
  });
  if (error) {
    // Audyt nie może wywrócić operacji biznesowej, ale brak wpisu logujemy głośno.
    console.error("[AML audit] nie zapisano wpisu:", error.message, entry);
  }
}
