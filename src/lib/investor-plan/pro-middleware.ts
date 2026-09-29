// Middleware dawnych modułów „PRO" (Akademia, kalkulator compliance, AML,
// windykacja AI, raporty bez limitu).
//
// Od 2026-09 (Umowa ramowa v7) usługa dla Inwestora jest NIEODPŁATNA i nie ma
// paywalla: middleware przepuszcza każdego zalogowanego inwestora oraz
// personel wewnętrzny. Zostaje jako jedno miejsce bramkowania — abonament za
// dostęp do systemu w przyszłości wróci właśnie tutaj (wtedy dojdzie odczyt
// access_entitlements). Składa się z requireSupabaseAuth, więc kontekst
// (supabase, userId, claims) pozostaje ten sam.
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireInvestorPro = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await (supabaseAdmin as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const ok = ((roles ?? []) as { role: string }[]).some((r) =>
      ["inwestor", "administrator", "operator"].includes(r.role),
    );
    if (!ok) {
      throw new Error("Ten moduł jest dostępny dla zweryfikowanych inwestorów i personelu.");
    }
    // abonament w przyszłości — tu wróci sprawdzenie uprawnień płatnych
    return next();
  });
