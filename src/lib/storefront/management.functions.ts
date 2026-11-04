import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Stan Centrum Zarządzania dla UI (bramka panelu, sklep). Twarde sprawdzenie: requireInvestorManagement. */
export const getMyManagementModuleState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { managementModuleActiveUntilFor } = await import("./management.server");
    const until = await managementModuleActiveUntilFor(context.userId);
    const active = Boolean(until && until.getTime() > Date.now());
    return { active, activeUntil: until ? until.toISOString() : null };
  });
