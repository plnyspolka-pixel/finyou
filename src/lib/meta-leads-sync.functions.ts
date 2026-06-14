import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin trigger – ręczne uruchomienie pull-a Meta leadów z panelu.
 * Logika żyje w `meta-leads-sync.server.ts`, ten sam helper wywołuje cron
 * (`/api/public/hooks/meta-leads-pull`) co minutę.
 */
export const syncAndPullMetaLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "administrator",
    });
    if (!isAdmin) throw new Error("Tylko administrator");

    const { runMetaLeadsSync } = await import("@/lib/meta-leads-sync.server");
    return await runMetaLeadsSync();
  });
