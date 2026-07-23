// Nieusuwalny log audytowy modułu projektów — każda decyzja, przypisanie
// i zmiana statusu zostawia wpis (tabela append-only, trigger blokuje
// UPDATE/DELETE). Wzorzec: src/lib/aml/audit.server.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ProjectAuditEntity =
  | "access"
  | "application"
  | "screening"
  | "kyc"
  | "project"
  | "assignment"
  | "proposal"
  | "document"
  | "info_request"
  | "settings";

export async function projectAudit(entry: {
  actorId?: string | null;
  subjectUserId?: string | null;
  entityType: ProjectAuditEntity;
  entityId?: string | null;
  action: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await (
    supabaseAdmin as never as {
      from: (t: string) => {
        insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from("project_module_audit_log")
    .insert({
      actor_id: entry.actorId ?? null,
      subject_user_id: entry.subjectUserId ?? null,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      action: entry.action,
      previous_status: entry.previousStatus ?? null,
      new_status: entry.newStatus ?? null,
      reason: entry.reason ?? null,
      details: (entry.details ?? {}) as never,
    });
  if (error) {
    // Audyt nie może wywrócić operacji biznesowej, ale brak wpisu logujemy głośno.
    console.error("[projects audit] nie zapisano wpisu:", error.message, entry);
  }
}
