// Sync Insights na poziomie REKLAMY (level=ad, time_increment=1) do
// meta_ad_insights_daily. Uzupełnienie istniejącego meta-ads.functions.ts,
// który syncuje tylko poziom kampanii — do liczenia kosztu kwalifikowanego
// leada per KREACJA potrzebujemy spend per ad per dzień.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const GRAPH = "https://graph.facebook.com/v21.0";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function getToken(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN nie jest ustawiony");
  return t;
}

export async function syncAdLevelInsights(opts?: {
  /** ile dni wstecz (domyślnie 8 — okno 7 dni + bufor na korekty Mety) */
  days?: number;
}): Promise<{ accounts: number; rows: number; errors: string[] }> {
  const token = getToken();
  const supa = admin();
  const days = opts?.days ?? 8;
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const errors: string[] = [];
  let rows = 0;

  const { data: accounts } = await supa
    .from("meta_ad_accounts")
    .select("meta_account_id")
    .eq("account_status", 1); // tylko aktywne

  for (const acc of accounts ?? []) {
    let url =
      `${GRAPH}/act_${acc.meta_account_id}/insights?` +
      new URLSearchParams({
        access_token: token,
        level: "ad",
        time_increment: "1",
        time_range: JSON.stringify({ since, until }),
        fields: "ad_id,ad_name,adset_id,campaign_id,spend,impressions,clicks,ctr,frequency,actions",
        limit: "200",
      }).toString();

    // paginacja
    while (url) {
      let json: any;
      try {
        const res = await fetch(url);
        json = await res.json().catch(() => ({}));
        if (!res.ok || json.error) {
          errors.push(
            `act_${acc.meta_account_id}: ${JSON.stringify(json.error ?? json).slice(0, 200)}`,
          );
          break;
        }
      } catch (e: any) {
        errors.push(`act_${acc.meta_account_id}: ${String(e?.message ?? e).slice(0, 200)}`);
        break;
      }

      for (const r of json.data ?? []) {
        const { error } = await supa.from("meta_ad_insights_daily").upsert(
          {
            ad_id: r.ad_id,
            adset_id: r.adset_id ?? null,
            campaign_id: r.campaign_id ?? null,
            ad_name: r.ad_name ?? null,
            day: r.date_start,
            spend: Number(r.spend ?? 0),
            impressions: Number(r.impressions ?? 0),
            clicks: Number(r.clicks ?? 0),
            ctr: r.ctr != null ? Number(r.ctr) : null,
            frequency: r.frequency != null ? Number(r.frequency) : null,
            actions: r.actions ?? null,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "ad_id,day" },
        );
        if (error) errors.push(`upsert ${r.ad_id}/${r.date_start}: ${error.message}`);
        else rows++;
      }
      url = json.paging?.next ?? null;
    }
  }
  return { accounts: (accounts ?? []).length, rows, errors };
}
