// Pełna logika synchronizacji kont reklamowych i kampanii Meta (Graph API) –
// wywoływana z:
// - createServerFn (przyciski „Synchronizuj" w panelu /admin/meta)
// - cron hooka /api/public/hooks/meta-ads-sync-tick (co godzinę)
//
// Bez ticka tabele `meta_ad_accounts` / `meta_campaigns` aktualizowały się
// wyłącznie po ręcznym kliknięciu w panelu, więc budżety i statusy kampanii
// potrafiły być nieaktualne miesiącami.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH = "https://graph.facebook.com/v21.0";

function getToken() {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN nie jest ustawiony");
  return t;
}

export async function metaFetch(path: string, params: Record<string, string> = {}) {
  const token = getToken();
  const qs = new URLSearchParams({ access_token: token, ...params });
  const res = await fetch(`${GRAPH}${path}?${qs.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta API ${res.status}: ${text}`);
  }
  return res.json();
}

async function startSyncLog(syncType: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("meta_sync_log")
    .insert({ sync_type: syncType, status: "running" })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function finishSyncLog(
  logId: string | null,
  patch: { status: string; items_synced?: number; error_message?: string },
) {
  if (!logId) return;
  await supabaseAdmin
    .from("meta_sync_log")
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq("id", logId);
}

/** Pobiera z Meta listę kont reklamowych i zapisuje je w `meta_ad_accounts`. */
export async function syncMetaAdAccountsCore(): Promise<{ count: number }> {
  const logId = await startSyncLog("ad_accounts");

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

    await finishSyncLog(logId, { status: "success", items_synced: rows.length });
    return { count: rows.length };
  } catch (e: any) {
    await finishSyncLog(logId, { status: "error", error_message: String(e.message) });
    throw e;
  }
}

/**
 * Pobiera kampanie jednego konta reklamowego wraz z insightami (lifetime)
 * i zapisuje je w `meta_campaigns`.
 *
 * @param accountId UUID wiersza w `meta_ad_accounts` (nie ID konta w Meta).
 */
export async function syncMetaCampaignsCore(accountId: string): Promise<{ count: number }> {
  const { data: acc } = await supabaseAdmin
    .from("meta_ad_accounts")
    .select("id, meta_account_id")
    .eq("id", accountId)
    .single();
  if (!acc) throw new Error("Konto nie znalezione");

  const logId = await startSyncLog("campaigns");

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
      const cplAction = (ins.cost_per_action_type ?? []).find((a: any) => a.action_type === "lead");
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

    await finishSyncLog(logId, { status: "success", items_synced: count });
    return { count };
  } catch (e: any) {
    await finishSyncLog(logId, { status: "error", error_message: String(e.message) });
    throw e;
  }
}

/**
 * Pełny przebieg dla crona: konta + kampanie każdego aktywnego konta.
 * Nie rzuca wyjątkiem przy błędzie pojedynczego konta – tick ma dowieźć tyle,
 * ile się da, a błędy zwraca w `errors` (i zapisuje w `meta_sync_log`).
 */
export async function runMetaAdsSync(): Promise<{
  accounts: number;
  campaigns: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let accounts = 0;

  try {
    const r = await syncMetaAdAccountsCore();
    accounts = r.count;
  } catch (e: any) {
    // Konta mogły się nie odświeżyć (np. wygasły token), ale kampanie i tak
    // próbujemy pobrać dla kont już zapisanych w bazie.
    errors.push(`ad_accounts: ${e?.message ?? String(e)}`);
  }

  const { data: rows } = await supabaseAdmin
    .from("meta_ad_accounts")
    .select("id, name, is_active")
    .neq("is_active", false);

  let campaigns = 0;
  for (const acc of rows ?? []) {
    try {
      const r = await syncMetaCampaignsCore(acc.id);
      campaigns += r.count;
    } catch (e: any) {
      errors.push(`campaigns[${acc.name ?? acc.id}]: ${e?.message ?? String(e)}`);
    }
  }

  return { accounts, campaigns, errors };
}
