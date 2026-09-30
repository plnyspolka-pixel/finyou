// Middleware modułów panelu inwestora (Akademia, kalkulator compliance, AML,
// windykacja AI, raporty bez limitu).
//
// Od 2026-09-30 moduły wymagają aktywnego abonamentu inwestora (Umowa ramowa
// v7 § 7): przepuszcza personel wewnętrzny oraz inwestora, dla którego SQL
// `investor_has_full_access` zwraca true (abonament albo dostęp modułowy
// nadany przez zespół — ta sama funkcja stoi za RLS). Składa się z
// requireSupabaseAuth, więc kontekst (supabase, userId, claims) zostaje ten sam.
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
    const { investorHasFullAccess } = await import("@/lib/access/guards.server");
    if (!(await investorHasFullAccess(context.userId))) {
      throw new Error(
        "Ten moduł jest dostępny w abonamencie inwestora — wykup go w zakładce Dostęp i płatności.",
      );
    }
    return next();
  });
