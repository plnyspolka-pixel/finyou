// Weryfikacja tożsamości SAMEGO INWESTORA (Didit KYC/KYB) — na potrzeby
// pakietu umów inwestora (komparycja z danymi potwierdzonymi, nie ze słuchu).
// Dotąd Didit weryfikował klientów inwestora (moduł AML) i uczestników modułu
// projektów; tu sesja wiąże się bezpośrednio z kontem: vendor_data =
// "investor:<user_id>", wiersz w didit_verifications z user_id (webhook
// aktualizuje po session_id — bez zmian po jego stronie).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const loose = (c: unknown) => c as any;

export const startInvestorSelfVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        entityType: z.enum(["osoba", "firma"]).default("osoba"),
        callbackBase: z.string().url().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const {
      hasDiditConfig,
      createDiditSession,
      selectWorkflowId,
      diditAppUrl,
    } = await import("@/lib/didit.server");
    if (!hasDiditConfig()) return { status: "not_configured" as const };

    const kind = data.entityType === "firma" ? "kyb" : "kyc";
    const workflowId = selectWorkflowId(kind as any);
    if (!workflowId) return { status: "not_configured" as const, missingWorkflow: kind };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const vendorData = `investor:${userId}`;

    // Jedna aktywna/zatwierdzona sesja wystarczy — nie mnożymy weryfikacji.
    const { data: existing } = await loose(supabaseAdmin)
      .from("didit_verifications")
      .select("id, status, verification_url, session_id")
      .eq("vendor_data", vendorData)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing && existing.status === "Approved") {
      return { status: "already_approved" as const, sessionId: existing.session_id };
    }
    if (existing && ["Not Started", "In Progress", "In Review"].includes(existing.status)) {
      return {
        status: "ok" as const,
        sessionId: existing.session_id,
        url: existing.verification_url,
        reused: true,
      };
    }

    const base = (data.callbackBase ?? diditAppUrl()).replace(/\/+$/, "");
    const session = await createDiditSession({
      workflowId,
      vendorData,
      callback: `${base}/inwestor/umowy?didit=return`,
      language: "pl",
      metadata: { purpose: "investor_agreements", user_id: userId, app: "finance-you" },
    });

    const { error: insErr } = await loose(supabaseAdmin).from("didit_verifications").insert({
      user_id: userId,
      aml_customer_id: null,
      vendor_data: vendorData,
      session_id: session.sessionId,
      session_number: session.sessionNumber,
      workflow_id: session.workflowId,
      workflow_type: kind,
      status: session.status,
      verification_url: session.url,
      metadata: { purpose: "investor_agreements" },
    });
    if (insErr) throw new Error(insErr.message);

    return { status: "ok" as const, sessionId: session.sessionId, url: session.url };
  });

/** Najnowsza samodzielna weryfikacja inwestora + wyciągnięte dane osobowe. */
export const getMyInvestorVerification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { extractDiditPersonalData } = await import("@/lib/didit.server");

    const { data: row } = await loose(supabaseAdmin)
      .from("didit_verifications")
      .select("id, status, decision, workflow_type, decided_at, verification_url, session_id")
      .eq("vendor_data", `investor:${userId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) return { found: false as const };

    return {
      found: true as const,
      status: row.status as string,
      workflowType: row.workflow_type as string,
      decidedAt: row.decided_at as string | null,
      url: row.verification_url as string | null,
      personal: row.status === "Approved" ? extractDiditPersonalData(row.decision) : null,
    };
  });
