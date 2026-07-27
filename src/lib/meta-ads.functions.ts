import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH = "https://graph.facebook.com/v21.0";

function getToken() {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN nie jest ustawiony");
  return t;
}

async function metaFetch(path: string, params: Record<string, string> = {}) {
  const token = getToken();
  const qs = new URLSearchParams({ access_token: token, ...params });
  const res = await fetch(`${GRAPH}${path}?${qs.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta API ${res.status}: ${text}`);
  }
  return res.json();
}

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("administrator") && !roles.includes("operator")) {
    throw new Error("Brak uprawnień");
  }
}

export const syncMetaAdAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: logRow } = await supabaseAdmin
      .from("meta_sync_log")
      .insert({
        sync_type: "ad_accounts",
        status: "running",
      })
      .select("id")
      .single();

    try {
      const me = await metaFetch("/me/adaccounts", {
        fields: "id,account_id,name,currency,account_status,business_name,amount_spent,balance",
        limit: "100",
      });
      const rows = (me.data ?? []).map((a: any) => ({
        meta_account_id: a.account_id ?? a.id?.replace("act_", ""),
        name: a.name,
        currency: a.currency,
        account_status: a.account_status,
        business_name: a.business_name,
        amount_spent: Number(a.amount_spent ?? 0) / 100,
        balance: Number(a.balance ?? 0) / 100,
        last_synced_at: new Date().toISOString(),
      }));

      for (const r of rows) {
        await supabaseAdmin.from("meta_ad_accounts").upsert(r, { onConflict: "meta_account_id" });
      }

      await supabaseAdmin
        .from("meta_sync_log")
        .update({
          status: "success",
          items_synced: rows.length,
          finished_at: new Date().toISOString(),
        })
        .eq("id", logRow!.id);

      return { count: rows.length };
    } catch (e: any) {
      await supabaseAdmin
        .from("meta_sync_log")
        .update({
          status: "error",
          error_message: String(e.message),
          finished_at: new Date().toISOString(),
        })
        .eq("id", logRow!.id);
      throw e;
    }
  });

export const syncMetaCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { accountId: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { data: acc } = await supabaseAdmin
      .from("meta_ad_accounts")
      .select("id, meta_account_id")
      .eq("id", data.accountId)
      .single();
    if (!acc) throw new Error("Konto nie znalezione");

    const { data: logRow } = await supabaseAdmin
      .from("meta_sync_log")
      .insert({
        sync_type: "campaigns",
        status: "running",
      })
      .select("id")
      .single();

    try {
      const camps = await metaFetch(`/act_${acc.meta_account_id}/campaigns`, {
        fields:
          "id,name,objective,status,daily_budget,lifetime_budget,start_time,stop_time,insights.date_preset(maximum){spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type}",
        limit: "200",
      });

      let count = 0;
      for (const c of camps.data ?? []) {
        const ins = c.insights?.data?.[0] ?? {};
        const leadAction = (ins.actions ?? []).find((a: any) => a.action_type === "lead");
        const cplAction = (ins.cost_per_action_type ?? []).find(
          (a: any) => a.action_type === "lead",
        );
        await supabaseAdmin.from("meta_campaigns").upsert(
          {
            meta_campaign_id: c.id,
            ad_account_id: acc.id,
            name: c.name,
            objective: c.objective,
            status: c.status,
            daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
            lifetime_budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
            start_time: c.start_time,
            stop_time: c.stop_time,
            spend: Number(ins.spend ?? 0),
            impressions: Number(ins.impressions ?? 0),
            clicks: Number(ins.clicks ?? 0),
            ctr: Number(ins.ctr ?? 0),
            cpc: Number(ins.cpc ?? 0),
            leads_count: Number(leadAction?.value ?? 0),
            cost_per_lead: Number(cplAction?.value ?? 0),
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "meta_campaign_id" },
        );
        count++;
      }

      await supabaseAdmin
        .from("meta_sync_log")
        .update({
          status: "success",
          items_synced: count,
          finished_at: new Date().toISOString(),
        })
        .eq("id", logRow!.id);

      return { count };
    } catch (e: any) {
      await supabaseAdmin
        .from("meta_sync_log")
        .update({
          status: "error",
          error_message: String(e.message),
          finished_at: new Date().toISOString(),
        })
        .eq("id", logRow!.id);
      throw e;
    }
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
