import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("administrator") && !roles.includes("operator")) {
    throw new Error("Brak uprawnień");
  }
}

/**
 * Admin trigger – ręczna synchronizacja kont reklamowych z panelu.
 * Logika żyje w `meta-ads.server.ts`, ten sam helper wywołuje cron
 * (`/api/public/hooks/meta-ads-sync-tick`).
 */
export const syncMetaAdAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { syncMetaAdAccountsCore } = await import("@/lib/meta-ads.server");
    return await syncMetaAdAccountsCore();
  });

/** Admin trigger – ręczna synchronizacja kampanii wybranego konta. */
export const syncMetaCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { syncMetaCampaignsCore } = await import("@/lib/meta-ads.server");
    return await syncMetaCampaignsCore(data.accountId);
  });

export const listMetaOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [{ data: accounts }, { data: campaigns }, { data: logs }] = await Promise.all([
      supabaseAdmin.from("meta_ad_accounts").select("*").order("name"),
      supabaseAdmin
        .from("meta_campaigns")
        .select("*")
        .order("spend", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("meta_sync_log")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10),
    ]);
    return { accounts: accounts ?? [], campaigns: campaigns ?? [], logs: logs ?? [] };
  });
