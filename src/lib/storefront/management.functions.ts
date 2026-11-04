import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Stan modułów sklepu dla UI (bramka panelu, sklep): Centrum Zarządzania i
 *  HIT „mapa szans” (kalkulator). Twarde sprawdzenie: requireInvestorManagement. */
export const getMyManagementModuleState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { managementModuleActiveUntilFor, calculatorUnlockActiveUntilFor } =
      await import("./management.server");
    const [until, calcUntil] = await Promise.all([
      managementModuleActiveUntilFor(context.userId),
      calculatorUnlockActiveUntilFor(context.userId),
    ]);
    const now = Date.now();
    return {
      active: Boolean(until && until.getTime() > now),
      activeUntil: until ? until.toISOString() : null,
      calculatorActive: Boolean(calcUntil && calcUntil.getTime() > now),
      calculatorActiveUntil: calcUntil ? calcUntil.toISOString() : null,
    };
  });
