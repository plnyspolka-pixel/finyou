// Server fn dla ścieżki, w której oferta jest zapisywana z przeglądarki
// (/inwestor/wniosek/$id) — po insercie front prosi o powiadomienie autora
// wniosku. Tylko właściciel oferty i tylko oferta złożona (dedup w rdzeniu).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const notifyMyOfferSubmitted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ offerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: offer } = await db
      .from("investor_offers")
      .select("id, investor:investors(user_id)")
      .eq("id", data.offerId)
      .maybeSingle();
    if (!offer || offer.investor?.user_id !== context.userId) {
      throw new Error("Nie znaleziono oferty.");
    }
    const { notifyInvestorOfferSubmitted } = await import("@/lib/investor-offer-notify.server");
    return notifyInvestorOfferSubmitted(data.offerId);
  });
