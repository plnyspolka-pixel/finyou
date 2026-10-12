// Decyzja o propozycji inwestora (model 1:1). Uprawnione strony:
// administrator / operator (zespół), pożyczkobiorca (właściciel wniosku)
// i pośrednik, który wniosek utworzył. Akceptacja odblokowuje weryfikację,
// kompletowanie danych i przygotowanie dokumentów umowy.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  decidableFrom,
  statusAfterDecision,
  type OfferDecider,
} from "@/lib/investor-offers/acceptance";

async function resolveDecider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  offer: { loan_application_id: string },
): Promise<OfferDecider | null> {
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roleSet = new Set(((roles ?? []) as { role: string }[]).map((r) => r.role));
  if (roleSet.has("administrator")) return "administrator";
  if (roleSet.has("operator") || roleSet.has("operator_wewnetrzny")) {
    const { data: isStaff } = await db.rpc("is_internal_staff", { _user_id: userId });
    if (isStaff) return "operator";
  }

  const { data: app } = await db
    .from("loan_applications")
    .select("id, created_by_partner_user_id, client:clients(user_id)")
    .eq("id", offer.loan_application_id)
    .maybeSingle();
  if (!app) return null;
  if (app.client?.user_id === userId) return "pozyczkobiorca";
  if (roleSet.has("posrednik") && app.created_by_partner_user_id === userId) return "posrednik";
  return null;
}

export const decideOfferProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        offerId: z.string().uuid(),
        decision: z.enum(["accept", "reject"]),
        note: z.string().max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const { data: offer, error } = await db
      .from("investor_offers")
      .select("id, offer_status, loan_application_id, investor_id")
      .eq("id", data.offerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!offer) throw new Error("Nie znaleziono propozycji.");

    const decider = await resolveDecider(db, userId, offer);
    if (!decider) throw new Error("Brak uprawnień do decyzji o tej propozycji.");

    const allowedFrom = decidableFrom(decider);
    if (!allowedFrom.includes(offer.offer_status)) {
      throw new Error("O tej propozycji nie można już zdecydować.");
    }

    const nextStatus = statusAfterDecision(decider, data.decision);
    const nowIso = new Date().toISOString();
    const staff = decider === "administrator" || decider === "operator";
    const patch: Record<string, unknown> = {
      offer_status: nextStatus,
      decided_by_user_id: userId,
      decided_by_role: decider,
      ...(staff ? { admin_verified_at: nowIso } : { client_decision_at: nowIso }),
      ...(staff && data.note !== undefined ? { admin_note: data.note } : {}),
    };

    // Warunek na status chroni przed wyścigiem dwóch równoległych decyzji.
    const { data: updated, error: updErr } = await db
      .from("investor_offers")
      .update(patch)
      .eq("id", offer.id)
      .in("offer_status", allowedFrom)
      .select("id, offer_status")
      .maybeSingle();
    if (updErr) throw new Error(updErr.message);
    if (!updated) throw new Error("Propozycja zmieniła status w międzyczasie — odśwież widok.");

    await db.from("audit_logs").insert({
      user_id: userId,
      action: data.decision === "accept" ? "offer_proposal_accepted" : "offer_proposal_rejected",
      object_type: "investor_offer",
      object_id: offer.id,
      previous_value: { offer_status: offer.offer_status },
      new_value: { offer_status: nextStatus, decided_by_role: decider, note: data.note ?? null },
    });

    return { ok: true as const, status: nextStatus, decider };
  });
