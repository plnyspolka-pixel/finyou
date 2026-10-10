// Dane zalogowanego inwestora jako strony „Pożyczkodawca / Wierzyciel" —
// do wstępnego wypełnienia wzorów w Kreatorze dokumentów panelu inwestora.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildCreditorParty, type CreditorParty } from "@/lib/investor-party";
import { loadInvestorPartyRow } from "@/lib/windykacja-creditor.server";

/** Profil inwestora bieżącego użytkownika jako strona; null — brak profilu. */
export const getMyCreditorParty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreditorParty | null> => {
    // RLS: inwestor czyta własny wiersz investors.
    const row = await loadInvestorPartyRow(
      context.supabase as unknown as Parameters<typeof loadInvestorPartyRow>[0],
      context.userId,
    );
    return row ? buildCreditorParty(row) : null;
  });
