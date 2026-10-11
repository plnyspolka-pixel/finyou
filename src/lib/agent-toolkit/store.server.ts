// Pamięć i dziennik agentów na ISTNIEJĄCEJ tabeli ai_growth_action_log
// (module / action / status / summary / payload / cost_pln). Świadomie bez
// nowych tabel: agent ma działać od pierwszego wdrożenia kodu, bez czekania
// na migrację, a wpisy od razu widać w panelu silnika wzrostu.
//
// Konwencja:
//   module = "agent_state"        action = <klucz>        — stan (ostatni wpis wygrywa)
//   module = "agent_tools"        action = <narzędzie>    — audyt wywołań narzędzi
//   module = "agent_capabilities" action = <klucz>        — prośby o możliwości
//   module = "agent_insights"     action = <rodzaj>       — obserwacje z rozmów
//   module = "growth_agent"       action = item|run|...   — agent social media
//
// status w tabeli ma CHECK (ok|blocked|error) — etap życia wpisu trzymamy
// w payload.stage.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ActionStatus = "ok" | "blocked" | "error";

export interface ActionRow {
  id: string;
  module: string;
  action: string;
  status: ActionStatus;
  summary: string | null;
  payload: Record<string, any> | null;
  cost_pln: number | null;
  created_at: string;
}

/** Klient serwisowy bez typów tabel — ai_growth_action_log trzyma dowolny payload. */
export function agentDb(): SupabaseClient {
  return supabaseAdmin as unknown as SupabaseClient;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (s: string | null | undefined, n = 500) => (s ? String(s).slice(0, n) : null);

export async function logAgentAction(row: {
  module: string;
  action: string;
  status?: ActionStatus;
  summary?: string | null;
  payload?: Record<string, unknown> | null;
  costPln?: number | null;
  actor?: string | null;
}): Promise<string | null> {
  try {
    const { data, error } = await (agentDb() as any)
      .from("ai_growth_action_log")
      .insert({
        module: row.module,
        action: row.action.slice(0, 120),
        status: row.status ?? "ok",
        summary: clip(row.summary),
        payload: row.payload ?? null,
        cost_pln: row.costPln ?? null,
        // Kolumna actor jest typu uuid (id użytkownika panelu) — wpisy agentów
        // zostawiają ją pustą, a autora trzymają w module/payload.
        actor: row.actor && UUID_RE.test(row.actor) ? row.actor : null,
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return (data?.id as string) ?? null;
  } catch (e) {
    console.error("[agent-store] log failed", row.module, row.action, e);
    return null;
  }
}

export async function updateAgentAction(
  id: string,
  patch: {
    status?: ActionStatus;
    summary?: string | null;
    payload?: Record<string, unknown>;
    costPln?: number | null;
  },
): Promise<boolean> {
  const update: Record<string, unknown> = {};
  if (patch.status) update.status = patch.status;
  if (patch.summary !== undefined) update.summary = clip(patch.summary);
  if (patch.payload !== undefined) update.payload = patch.payload;
  if (patch.costPln !== undefined) update.cost_pln = patch.costPln;
  const { error } = await (agentDb() as any)
    .from("ai_growth_action_log")
    .update(update)
    .eq("id", id);
  if (error) console.error("[agent-store] update failed", id, error);
  return !error;
}

export async function listAgentActions(opts: {
  module: string;
  action?: string | string[];
  sinceIso?: string;
  limit?: number;
  stage?: string | string[];
  ascending?: boolean;
}): Promise<ActionRow[]> {
  let q = (agentDb() as any)
    .from("ai_growth_action_log")
    .select("id, module, action, status, summary, payload, cost_pln, created_at")
    .eq("module", opts.module)
    .order("created_at", { ascending: opts.ascending ?? false })
    .limit(opts.limit ?? 100);
  if (Array.isArray(opts.action)) q = q.in("action", opts.action);
  else if (opts.action) q = q.eq("action", opts.action);
  if (opts.sinceIso) q = q.gte("created_at", opts.sinceIso);
  if (Array.isArray(opts.stage)) q = q.in("payload->>stage", opts.stage);
  else if (opts.stage) q = q.eq("payload->>stage", opts.stage);
  const { data, error } = await q;
  if (error) {
    console.error("[agent-store] list failed", opts.module, error);
    return [];
  }
  return (data ?? []) as ActionRow[];
}

export async function countAgentActions(opts: {
  module: string;
  action: string;
  sinceIso: string;
  payloadEq?: Record<string, string>;
}): Promise<number> {
  let q = (agentDb() as any)
    .from("ai_growth_action_log")
    .select("id", { count: "exact", head: true })
    .eq("module", opts.module)
    .eq("action", opts.action)
    .gte("created_at", opts.sinceIso);
  for (const [k, v] of Object.entries(opts.payloadEq ?? {})) q = q.eq(`payload->>${k}`, v);
  const { count, error } = await q;
  if (error) {
    console.error("[agent-store] count failed", error);
    return 0;
  }
  return count ?? 0;
}

// ── stan klucz → wartość ───────────────────────────────────────────────────

export async function getAgentState<T>(key: string, fallback: T): Promise<T> {
  const rows = await listAgentActions({ module: "agent_state", action: key, limit: 1 });
  const v = rows[0]?.payload?.value;
  return v === undefined || v === null ? fallback : (v as T);
}

/** Zapis stanu: aktualizuje ostatni wpis klucza albo tworzy nowy. */
export async function setAgentState<T>(key: string, value: T, summary?: string): Promise<void> {
  const rows = await listAgentActions({ module: "agent_state", action: key, limit: 1 });
  const payload = { value, updated_at: new Date().toISOString() };
  if (rows[0]) await updateAgentAction(rows[0].id, { payload, summary: summary ?? null });
  else
    await logAgentAction({ module: "agent_state", action: key, payload, summary: summary ?? null });
}

export const hoursAgoIso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
