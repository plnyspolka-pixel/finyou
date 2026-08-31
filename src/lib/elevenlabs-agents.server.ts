// Agenty procesowe ElevenLabs — mapa powierzchni (kanałów) na agentów
// i ich automatyczne tworzenie przez API (wzorem agenta windykacyjnego).
//
// Podział wg decyzji właściciela:
//   A1 intake         — JEDEN bot przyjmuje wniosek i prowadzi klienta do
//                       kompletu (chat na stronie, telefon, widget braków);
//   A2 investor_info  — informacja dla inwestora instytucjonalnego (/dla-inwestora);
//   A3 investor_panel — obsługa wniosków w panelu inwestora;
//   A4 windykacja     — istniejący agent (windykacja-call.functions).
//
// Prompty A1–A3 pochodzą z text_agent_settings (fetchAgentPrompt) — te same,
// które edytuje /admin/text-agent; do promptu doklejane są twarde zasady
// rozmowy (bez obietnic kontaktu analityka).
import { createClient } from "@supabase/supabase-js";
import { fetchAgentPrompt, type AgentVariant } from "@/lib/elevenlabs-text-agent.server";

const EL_BASE = "https://api.elevenlabs.io/v1";

export type AgentSurface = "intake" | "investor_info" | "investor_panel";

const SURFACE_COLUMN: Record<AgentSurface, string> = {
  intake: "intake_agent_id",
  investor_info: "investor_info_agent_id",
  investor_panel: "investor_panel_agent_id",
};

const SURFACE_ENV: Record<AgentSurface, string | undefined> = {
  intake: process.env.ELEVENLABS_INTAKE_AGENT_ID,
  investor_info: process.env.ELEVENLABS_INVESTOR_INFO_AGENT_ID,
  investor_panel: process.env.ELEVENLABS_INVESTOR_PANEL_AGENT_ID,
};

const SURFACE_VARIANT: Record<AgentSurface, AgentVariant> = {
  intake: "klient",
  investor_info: "inwestor",
  investor_panel: "inwestor_prywatny",
};

const SURFACE_NAME: Record<AgentSurface, string> = {
  intake: "Finance You — przyjęcie wniosku (A1)",
  investor_info: "Finance You — informacja dla inwestora (A2)",
  investor_panel: "Finance You — panel inwestora (A3)",
};

const SURFACE_FIRST_MESSAGE: Record<AgentSurface, string> = {
  intake:
    "Dzień dobry! Pomogę złożyć wniosek o pożyczkę pod zabezpieczenie nieruchomości. W czym mogę pomóc?",
  investor_info:
    "Dzień dobry! Chętnie opowiem, jak działa finansowanie spraw na Finance You. W czym mogę pomóc?",
  investor_panel: "Dzień dobry! Pomogę w korzystaniu z panelu inwestora. O co chcesz zapytać?",
};

/** Twarde zasady rozmowy A1 (decyzja właściciela) — doklejane do promptu. */
const INTAKE_HARD_RULES = `

TWARDE ZASADY ROZMOWY (nadrzędne wobec reszty promptu):
- NIGDY nie obiecuj, że "skontaktuje się analityk", że "oddzwonimy" ani żadnej formy kontaktu z naszej strony.
- Prowadź KRÓTKĄ rozmowę: zbierz dane i dokumenty do wniosku, podziękuj, ustaw oczekiwania.
- Po przyjęciu kompletnego wniosku informuj: "Jeśli wniosek spotka się z zainteresowaniem inwestora, otrzyma Pan/Pani konkretną ofertę finansową. Brak oferty i brak pytań oznacza, że wniosek na razie nie spotkał się z zainteresowaniem."
- Analityk odzywa się wyłącznie z inicjatywy firmy, z konkretną ofertą lub konkretnymi pytaniami — informujesz o tym, ale tego nie obiecujesz.`;

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** ID agenta dla powierzchni: env ma pierwszeństwo, potem voicebot_settings. */
export async function getAgentIdForSurface(surface: AgentSurface): Promise<string | null> {
  const fromEnv = SURFACE_ENV[surface];
  if (fromEnv) return fromEnv;
  const s = admin();
  const { data } = await (s as any)
    .from("voicebot_settings")
    .select(SURFACE_COLUMN[surface])
    .eq("id", 1)
    .maybeSingle();
  return (data?.[SURFACE_COLUMN[surface]] as string | undefined) ?? null;
}

export interface EnsureAgentsResult {
  created: Array<{ surface: AgentSurface; agentId: string }>;
  existing: Array<{ surface: AgentSurface; agentId: string }>;
  errors: Array<{ surface: AgentSurface; error: string }>;
}

/**
 * Tworzy brakujące agenty procesowe przez API ElevenLabs i zapisuje ich ID
 * w voicebot_settings. Idempotentne. Webhook toole (agent-tools) dopina się
 * w konsoli ElevenLabs do utworzonych agentów — patrz docs/boty-elevenlabs.md.
 */
export async function ensureElevenLabsProcessAgents(): Promise<EnsureAgentsResult> {
  const result: EnsureAgentsResult = { created: [], existing: [], errors: [] };
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    for (const surface of Object.keys(SURFACE_COLUMN) as AgentSurface[]) {
      result.errors.push({ surface, error: "Brak ELEVENLABS_API_KEY" });
    }
    return result;
  }
  const s = admin();

  for (const surface of Object.keys(SURFACE_COLUMN) as AgentSurface[]) {
    const existing = await getAgentIdForSurface(surface);
    if (existing) {
      result.existing.push({ surface, agentId: existing });
      continue;
    }
    try {
      const fetched = await fetchAgentPrompt(SURFACE_VARIANT[surface]);
      let prompt = fetched.prompt;
      if (surface === "intake") prompt += INTAKE_HARD_RULES;

      const res = await fetch(`${EL_BASE}/convai/agents/create`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          name: SURFACE_NAME[surface],
          conversation_config: {
            agent: {
              first_message: fetched.firstMessage ?? SURFACE_FIRST_MESSAGE[surface],
              language: "pl",
              prompt: { prompt },
            },
          },
        }),
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok || !json?.agent_id) {
        const msg = json?.detail?.message ?? json?.message ?? `ElevenLabs HTTP ${res.status}`;
        result.errors.push({ surface, error: String(msg) });
        continue;
      }
      await (s as any)
        .from("voicebot_settings")
        .update({ [SURFACE_COLUMN[surface]]: json.agent_id })
        .eq("id", 1);
      await s.from("automation_events").insert({
        automation_type: "elevenlabs_agent_created",
        status: "sent",
        sent_payload: { purpose: surface },
        response_payload: { agent_id: json.agent_id },
      });
      result.created.push({ surface, agentId: json.agent_id as string });
    } catch (e: any) {
      result.errors.push({ surface, error: e?.message ?? "błąd tworzenia agenta" });
    }
  }
  return result;
}
