// Silnik reguł optymalizatora. Ponieważ w EOG nie możemy karmić algorytmu Mety
// zdarzeniami messaging-CAPI, decyzje podejmujemy sami:
//   spend per reklama (meta_ad_insights_daily)
//   + kwalifikowane leady per reklama (messenger_ad_attributions ⋈ leads.quality_tier)
//   → CPQL (koszt kwalifikowanego leada) → pauza / skalowanie / flaga zmęczenia.
//
// BEZPIECZNIKI:
//   - dry_run=true po instalacji: loguje decyzje, NICZEGO nie zmienia w Meta.
//   - pauza tylko przy spend >= min_spend_pln (żeby nie ubijać reklam bez danych).
//   - skalowanie tylko adsetów z CBO wyłączonym (adset ma własny daily_budget),
//     krokiem scale_step_pct, do sufitu max_budget_pln, max 1×/przebieg.
//   - każda decyzja z pełnymi metrykami w ad_optimizer_actions (audyt).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const GRAPH = "https://graph.facebook.com/v21.0";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

type Config = {
  enabled: boolean;
  dry_run: boolean;
  window_days: number;
  min_spend_pln: number;
  max_cpql_pln: number;
  target_cpql_pln: number;
  max_frequency: number;
  scale_step_pct: number;
  max_budget_pln: number;
  qualified_tiers: string[];
};

// PostgREST tnie zapytania bez `range` na 1000 wierszach. Optymalizator liczy
// z tych zbiorów CPQL i pauzuje reklamy — ciche obcięcie = "zero kwalifikowanych
// leadów" i wyłączona zdrowa kreacja. Dlatego czytamy stronami.
const PAGE_SIZE = 1000;
async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error || !data?.length) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

async function graphPost(path: string, params: Record<string, string>) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN missing");
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: token, ...params }).toString(),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(JSON.stringify(json.error ?? json).slice(0, 300));
  }
  return json;
}

export async function runAdOptimizer(): Promise<{
  runId: string;
  dryRun: boolean;
  analyzed: number;
  actions: { pause: number; scale: number; fatigue: number };
  errors: string[];
}> {
  const supa = admin();
  const runId = randomUUID();
  const errors: string[] = [];
  const counts = { pause: 0, scale: 0, fatigue: 0 };

  const { data: cfg } = await supa
    .from("ad_optimizer_config")
    .select("*")
    .eq("id", 1)
    .single<Config>();
  if (!cfg || !cfg.enabled) {
    return { runId, dryRun: true, analyzed: 0, actions: counts, errors: ["optimizer disabled"] };
  }

  const sinceDay = new Date(Date.now() - cfg.window_days * 86_400_000).toISOString().slice(0, 10);
  const sinceTs = new Date(Date.now() - cfg.window_days * 86_400_000).toISOString();

  // 1) Spend + frequency per ad (okno)
  const insights = await selectAll<any>((from, to) =>
    supa
      .from("meta_ad_insights_daily")
      .select("ad_id, adset_id, campaign_id, ad_name, spend, frequency, day")
      .gte("day", sinceDay)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const perAd = new Map<
    string,
    { adsetId: string | null; name: string | null; spend: number; freq: number }
  >();
  for (const r of insights ?? []) {
    const cur = perAd.get(r.ad_id) ?? {
      adsetId: r.adset_id,
      name: r.ad_name,
      spend: 0,
      freq: 0,
    };
    cur.spend += Number(r.spend ?? 0);
    cur.freq = Math.max(cur.freq, Number(r.frequency ?? 0));
    perAd.set(r.ad_id, cur);
  }

  // 2) Kwalifikowane leady per ad (atrybucja ⋈ leads).
  //    Klucz mapy zawiera platformę: PSID Messengera i IGSID Instagrama żyją
  //    w osobnych przestrzeniach i lądują w innych kolumnach `leads`.
  const attrs = await selectAll<any>((from, to) =>
    supa
      .from("messenger_ad_attributions")
      .select("ad_id, psid, platform")
      .not("ad_id", "is", null)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const psidToAd = new Map<string, string>(
    attrs.map((a: any) => [`${a.platform ?? "messenger"}:${a.psid}`, String(a.ad_id)]),
  );

  const leads = await selectAll<any>((from, to) =>
    supa
      .from("leads")
      .select("id, messenger_psid, instagram_igsid, quality_tier, created_at")
      .or("messenger_psid.not.is.null,instagram_igsid.not.is.null")
      .gte("created_at", sinceTs)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const qualifiedPerAd = new Map<string, number>();
  for (const l of leads) {
    const adId =
      (l.messenger_psid ? psidToAd.get(`messenger:${l.messenger_psid}`) : undefined) ??
      (l.instagram_igsid ? psidToAd.get(`instagram:${l.instagram_igsid}`) : undefined);
    if (!adId) continue;
    if (cfg.qualified_tiers.includes(l.quality_tier as string)) {
      qualifiedPerAd.set(adId, (qualifiedPerAd.get(adId) ?? 0) + 1);
    }
  }

  // 3) Reguły per reklama
  const scaledAdsets = new Set<string>(); // max 1 podbicie budżetu per adset per przebieg
  for (const [adId, m] of perAd) {
    const qualified = qualifiedPerAd.get(adId) ?? 0;
    const cpql = qualified > 0 ? m.spend / qualified : null;
    const metrics = {
      spend: Math.round(m.spend * 100) / 100,
      qualified,
      cpql: cpql != null ? Math.round(cpql * 100) / 100 : null,
      frequency: m.freq,
      window_days: cfg.window_days,
    };

    const log = async (action: string, reason: string, ok?: boolean, error?: string) => {
      await supa.from("ad_optimizer_actions").insert({
        run_id: runId,
        ad_id: adId,
        adset_id: m.adsetId,
        action,
        reason,
        metrics,
        dry_run: cfg.dry_run,
        ok: ok ?? null,
        error: error ?? null,
      });
    };

    try {
      // REGUŁA A: pauza — wydano dużo, zero kwalifikowanych LUB CPQL ponad próg
      if (
        m.spend >= cfg.min_spend_pln &&
        (qualified === 0 || (cpql != null && cpql > cfg.max_cpql_pln))
      ) {
        const reason =
          qualified === 0
            ? `Wydano ${metrics.spend} zł bez kwalifikowanego leada (min próg ${cfg.min_spend_pln} zł)`
            : `CPQL ${metrics.cpql} zł > próg ${cfg.max_cpql_pln} zł`;
        if (!cfg.dry_run) await graphPost(`/${adId}`, { status: "PAUSED" });
        await log("pause_ad", reason, true);
        counts.pause++;
        continue;
      }

      // REGUŁA B: zmęczenie kreacji — flaga (celowo nie pauzujemy automatycznie,
      // wysoka frequency przy dobrym CPQL bywa OK; operator dostaje sygnał)
      if (m.freq > cfg.max_frequency) {
        await log(
          "flag_fatigue",
          `Frequency ${m.freq} > ${cfg.max_frequency} — kreacja do wymiany`,
          true,
        );
        counts.fatigue++;
      }

      // REGUŁA C: skalowanie — CPQL poniżej celu → podbij daily_budget adsetu
      if (
        cpql != null &&
        cpql < cfg.target_cpql_pln &&
        qualified >= 2 && // min 2 kwalifikowane, żeby nie skalować szumu
        m.adsetId &&
        !scaledAdsets.has(m.adsetId)
      ) {
        scaledAdsets.add(m.adsetId);
        if (cfg.dry_run) {
          await log(
            "scale_adset",
            `CPQL ${metrics.cpql} zł < cel ${cfg.target_cpql_pln} zł → +${cfg.scale_step_pct}% budżetu (dry run)`,
            true,
          );
          counts.scale++;
        } else {
          // pobierz aktualny budżet adsetu; jeśli CBO (brak daily_budget) → tylko flaga
          const token = process.env.META_ACCESS_TOKEN!;
          const res = await fetch(
            `${GRAPH}/${m.adsetId}?fields=daily_budget&access_token=${encodeURIComponent(token)}`,
          );
          const j: any = await res.json().catch(() => ({}));
          const daily = Number(j.daily_budget ?? 0); // grosze
          if (!daily) {
            await log(
              "scale_adset",
              "Adset pod CBO (brak daily_budget) — skaluj budżet KAMPANII ręcznie",
              true,
            );
          } else {
            const next = Math.min(
              Math.round(daily * (1 + cfg.scale_step_pct / 100)),
              Math.round(cfg.max_budget_pln * 100),
            );
            if (next > daily) {
              await graphPost(`/${m.adsetId}`, { daily_budget: String(next) });
              await log(
                "scale_adset",
                `CPQL ${metrics.cpql} zł < cel → budżet ${daily / 100} → ${next / 100} zł/dzień`,
                true,
              );
              counts.scale++;
            }
          }
        }
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 300);
      errors.push(`${adId}: ${msg}`);
      await log("error", "Wyjątek podczas wykonywania akcji", false, msg);
    }
  }

  return { runId, dryRun: cfg.dry_run, analyzed: perAd.size, actions: counts, errors };
}
