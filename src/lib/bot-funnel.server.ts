// Lejek bota + warianty promptu (A/B).
//
// Wpięcie w elevenlabs-text-agent.server.ts (runAgentTurn):
//   1. Po pobraniu promptu z text_agent_settings:
//        const v = await getAssignedVariant(leadId, variant);
//        if (v?.prompt_suffix) prompt += "\n\n" + v.prompt_suffix;
//   2. Po wykonaniu toola update_lead_data({ patch }):
//        await logStepsFromPatch(leadId, patch);
//   3. Po toolu send_application_link():
//        await logFunnelStep(leadId, "application_link_sent");
//   4. Przy pierwszej wiadomości bota w rozmowie:
//        await logFunnelStep(leadId, "greeting");
//
// Krok "qualified" loguje się sam, gdy lead-quality nada tier A/B — wywołaj
// logQualifiedIfTier() z rescoreAndSend() albo zostaw cronowi sędziego.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

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

export type FunnelStep =
  | "greeting"
  | "intent"
  | "property_declared"
  | "amount_declared"
  | "contact_collected"
  | "application_link_sent"
  | "qualified";

/** Kolejność kroków — do liczenia drop-offu i "najdalszego kroku". */
export const FUNNEL_ORDER: FunnelStep[] = [
  "greeting",
  "intent",
  "property_declared",
  "amount_declared",
  "contact_collected",
  "application_link_sent",
  "qualified",
];

export async function logFunnelStep(
  leadId: string | null | undefined,
  step: FunnelStep,
  meta: Record<string, unknown> = {},
): Promise<void> {
  if (!leadId) return;
  const supa = admin();
  // UNIQUE(lead_id, step) → ignoruj duplikaty
  await supa
    .from("bot_funnel_events")
    .upsert(
      { lead_id: leadId, step, meta },
      { onConflict: "lead_id,step", ignoreDuplicates: true },
    );
}

/** Mapuje patch z toola update_lead_data na kroki lejka. */
export async function logStepsFromPatch(
  leadId: string | null | undefined,
  patch: Record<string, unknown> | null | undefined,
): Promise<void> {
  if (!leadId || !patch) return;
  const keys = Object.keys(patch).map((k) => k.toLowerCase());
  const has = (...names: string[]) => names.some((n) => keys.some((k) => k.includes(n)));

  if (has("cel", "purpose", "intent")) await logFunnelStep(leadId, "intent");
  if (has("nieruchomo", "property", "kw_number", "mieszkanie", "dzialka", "dom"))
    await logFunnelStep(leadId, "property_declared");
  if (has("kwota", "amount", "loan")) await logFunnelStep(leadId, "amount_declared");
  if (has("phone", "telefon", "email")) await logFunnelStep(leadId, "contact_collected");
}

// ---------- Warianty promptu (A/B) ----------

export async function getAssignedVariant(
  leadId: string | null | undefined,
  agentVariant: string = "klient",
): Promise<{ id: string; variant_key: string; prompt_suffix: string } | null> {
  if (!leadId) return null;
  const supa = admin();

  const { data: existing } = await supa
    .from("bot_prompt_assignments")
    .select("variant_id, bot_prompt_variants(id, variant_key, prompt_suffix)")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (existing?.bot_prompt_variants) {
    return existing.bot_prompt_variants as any;
  }

  // Losowanie ważone spośród aktywnych wariantów danego agenta
  const { data: variants } = await supa
    .from("bot_prompt_variants")
    .select("id, variant_key, prompt_suffix, weight")
    .eq("agent_variant", agentVariant)
    .eq("active", true);
  if (!variants || variants.length === 0) return null;

  const total = variants.reduce((s, v) => s + Math.max(1, v.weight), 0);
  let roll = Math.random() * total;
  let chosen = variants[0];
  for (const v of variants) {
    roll -= Math.max(1, v.weight);
    if (roll <= 0) {
      chosen = v;
      break;
    }
  }

  await supa
    .from("bot_prompt_assignments")
    .upsert({ lead_id: leadId, variant_id: chosen.id }, { onConflict: "lead_id" });
  return { id: chosen.id, variant_key: chosen.variant_key, prompt_suffix: chosen.prompt_suffix };
}

/** Wyniki A/B: konwersja do "qualified" per wariant (do panelu / decyzji o promocji). */
export async function variantResults(): Promise<
  { variant_key: string; leads: number; qualified: number; cr: number }[]
> {
  const supa = admin();
  // Stronicowanie: bez `range` PostgREST zwraca max 1000 wierszy, a wynik A/B
  // liczony z obciętego zbioru wskazałby zwycięzcę na podstawie szumu.
  const assigns = await selectAll<any>((from, to) =>
    supa
      .from("bot_prompt_assignments")
      .select("lead_id, bot_prompt_variants(variant_key)")
      .order("lead_id", { ascending: true })
      .range(from, to),
  );
  const quals = await selectAll<any>((from, to) =>
    supa
      .from("bot_funnel_events")
      .select("lead_id")
      .eq("step", "qualified")
      .order("lead_id", { ascending: true })
      .range(from, to),
  );
  const qualified = new Set(quals.map((q) => q.lead_id));

  const agg = new Map<string, { leads: number; qualified: number }>();
  for (const a of assigns) {
    const key = (a.bot_prompt_variants as any)?.variant_key ?? "?";
    const cur = agg.get(key) ?? { leads: 0, qualified: 0 };
    cur.leads++;
    if (qualified.has(a.lead_id)) cur.qualified++;
    agg.set(key, cur);
  }
  return [...agg.entries()].map(([variant_key, v]) => ({
    variant_key,
    leads: v.leads,
    qualified: v.qualified,
    cr: v.leads > 0 ? Math.round((v.qualified / v.leads) * 1000) / 10 : 0,
  }));
}
