// Server function odpalająca sprawdzenie automatycznej analizy ryzyka z UI
// (panel admina / panel klienta) po akcjach, które mogą domknąć wniosek —
// np. „oznacz jako kompletny". Sama logika (kompletność, dociągnięcie
// imienia i nazwiska z KW, idempotencja) siedzi w maybeAutoRunRiskAssessment.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maybeAutoRunRiskAssessment } from "./auto-risk.server";

export const pokeAutoRiskAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    // Fire-and-forget: sprawdzenie kompletności jest tanie, a analiza
    // idempotentna — nie blokujemy odpowiedzi na kilkuminutowy pipeline.
    void maybeAutoRunRiskAssessment(data.applicationId).catch((e) => {
      console.error("[auto-risk] poke failed", data.applicationId, e);
    });
    return { queued: true };
  });
