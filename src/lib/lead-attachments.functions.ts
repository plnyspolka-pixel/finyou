import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Domyka załączniki leadów do tabeli `documents` (dedup po file_path) —
 * wołane z listy wniosków, gdy UI wykryje załączniki z wiadomości
 * (lead_communications.attachments), które nie mają jeszcze rekordu
 * w documents. Dzięki temu „Pliki" i kompletność wniosku przestają
 * pokazywać „brak" mimo plików przysłanych przez klienta.
 */
export const backfillCommAttachmentDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ leadIds: z.array(z.string().uuid()).min(1).max(300) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isOperator }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "administrator" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operator" }),
    ]);
    if (!isAdmin && !isOperator) throw new Error("Forbidden");

    const { backfillLeadAttachmentsToDocuments } = await import("./inbound-attachments.server");
    let inserted = 0;
    let relinked = 0;
    for (const leadId of data.leadIds) {
      try {
        const r = await backfillLeadAttachmentsToDocuments({ leadId });
        inserted += r.inserted;
        relinked += r.relinked;
      } catch (e) {
        console.error("[backfillCommAttachmentDocuments]", leadId, e);
      }
    }
    return { inserted, relinked };
  });
