// Middleware bramkujące moduły pakietu PRO (Akademia, kalkulator compliance,
// AML, windykacja AI, raporty bez limitu, pierwszeństwo ofert).
//
// Składa się z requireSupabaseAuth, więc zamienia je 1:1 w server functions —
// kontekst (supabase, userId, claims) pozostaje ten sam. Personel wewnętrzny
// przechodzi, bo SQL `investor_tier` zwraca dla niego 'pro'.
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireInvestorPro = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).rpc("investor_tier", {
      _user_id: context.userId,
    });
    if (data !== "pro") {
      throw new Error(
        "PAYWALL_INVESTOR_PRO: Ten moduł jest dostępny w pakiecie PRO (3 000 zł / 6 miesięcy + 5% od udzielonej pożyczki).",
      );
    }
    return next();
  });
