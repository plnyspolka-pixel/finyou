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
import {
  AGENT_DYNAMIC_VARIABLE_DEFAULTS,
  RAPPORT_RULES,
  buildChannelRulesSection,
} from "@/lib/agent-channel-rules";

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
- Nie przeciągaj rozmowy bez potrzeby, ale też nie zaczynaj od żądania danych — prowadź ją tak, jak opisuje sekcja "JAK PROWADZISZ ROZMOWĘ", i dopiero potem kompletuj wniosek.
- Po przyjęciu kompletnego wniosku informuj: "Jeśli wniosek spotka się z zainteresowaniem inwestora, otrzyma Pan/Pani konkretną ofertę finansową. Brak oferty i brak pytań oznacza, że wniosek na razie nie spotkał się z zainteresowaniem."
- Analityk odzywa się wyłącznie z inicjatywy firmy, z konkretną ofertą lub konkretnymi pytaniami — informujesz o tym, ale tego nie obiecujesz.`;

/**
 * Prompt agenta dla powierzchni: prompt z /admin/text-agent + wspólne zasady
 * prowadzenia rozmowy + rozdzielenie kanałów (A1 obsługuje telefon, czat na
 * stronie, widget głosowy i wiadomości, więc zasady kanałów dostaje wszystkie
 * i wybiera po zmiennej {{channel}}) + twarde zasady A1.
 */
function buildAgentPrompt(surface: AgentSurface, basePrompt: string): string {
  if (surface !== "intake") return basePrompt;
  return basePrompt + RAPPORT_RULES + buildChannelRulesSection() + INTAKE_HARD_RULES;
}

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * POST do API ElevenLabs z domyślnymi wartościami zmiennych dynamicznych,
 * a gdy API tego pola nie przyjmie (inna wersja schematu) — ponowienie bez
 * niego. Dzięki temu zmiana nigdy nie blokuje utworzenia/aktualizacji agenta.
 */
async function elRequestWithPlaceholderFallback(
  url: string,
  apiKey: string,
  buildBody: (agentPatch: Record<string, unknown>) => Record<string, unknown>,
  method: "POST" | "PATCH" = "POST",
): Promise<{ res: Response; json: any }> {
  const post = async (agentPatch: Record<string, unknown>) => {
    const res = await fetch(url, {
      method,
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(buildBody(agentPatch)),
    });
    const json: any = await res.json().catch(() => ({}));
    return { res, json };
  };

  const withPlaceholders = await post({
    dynamic_variables: { dynamic_variable_placeholders: AGENT_DYNAMIC_VARIABLE_DEFAULTS },
  });
  if (withPlaceholders.res.ok) return withPlaceholders;
  console.warn(
    "[el-agents] próba bez dynamic_variable_placeholders — API odrzuciło pole",
    withPlaceholders.res.status,
  );
  return post({});
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
      const prompt = buildAgentPrompt(surface, fetched.prompt);

      const { res, json } = await elRequestWithPlaceholderFallback(
        `${EL_BASE}/convai/agents/create`,
        apiKey,
        (agentPatch) => ({
          name: SURFACE_NAME[surface],
          conversation_config: {
            agent: {
              first_message: fetched.firstMessage ?? SURFACE_FIRST_MESSAGE[surface],
              language: "pl",
              prompt: { prompt },
              ...agentPatch,
            },
            // Agenty nie-angielskie wymagają modelu turbo/flash v2_5 — bez tego
            // API odrzuca tworzenie ("Non-english Agents must use turbo or flash v2_5").
            tts: { model_id: "eleven_flash_v2_5" },
          },
        }),
      );
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

export interface SyncPromptsResult {
  updated: Array<{ surface: AgentSurface; agentId: string }>;
  skipped: Array<{ surface: AgentSurface; reason: string }>;
  errors: Array<{ surface: AgentSurface; error: string }>;
  /** Agent telefoniczny (voicebot_settings.agent_id) inny niż A1 — jego prompt żyje w konsoli ElevenLabs. */
  phoneAgentOutOfSync: string | null;
}

/**
 * Wysyła AKTUALNY prompt (z /admin/text-agent + zasady kanałów) do istniejących
 * agentów ElevenLabs. Bez tego zmiany w promptach działają wyłącznie dla nowo
 * tworzonych agentów, a telefon i widgety jadą dalej na starej wersji.
 */
export async function syncElevenLabsAgentPrompts(): Promise<SyncPromptsResult> {
  const result: SyncPromptsResult = {
    updated: [],
    skipped: [],
    errors: [],
    phoneAgentOutOfSync: null,
  };
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    for (const surface of Object.keys(SURFACE_COLUMN) as AgentSurface[]) {
      result.errors.push({ surface, error: "Brak ELEVENLABS_API_KEY" });
    }
    return result;
  }
  const s = admin();

  for (const surface of Object.keys(SURFACE_COLUMN) as AgentSurface[]) {
    const agentId = await getAgentIdForSurface(surface);
    if (!agentId) {
      result.skipped.push({ surface, reason: "brak agenta — najpierw go utwórz" });
      continue;
    }
    try {
      const fetched = await fetchAgentPrompt(SURFACE_VARIANT[surface]);
      const prompt = buildAgentPrompt(surface, fetched.prompt);
      const { res, json } = await elRequestWithPlaceholderFallback(
        `${EL_BASE}/convai/agents/${encodeURIComponent(agentId)}`,
        apiKey,
        (agentPatch) => ({
          conversation_config: {
            agent: {
              first_message: fetched.firstMessage ?? SURFACE_FIRST_MESSAGE[surface],
              language: "pl",
              prompt: { prompt },
              ...agentPatch,
            },
          },
        }),
        "PATCH",
      );
      if (!res.ok) {
        const msg = json?.detail?.message ?? json?.message ?? `ElevenLabs HTTP ${res.status}`;
        result.errors.push({ surface, error: String(msg) });
        continue;
      }
      await s.from("automation_events").insert({
        automation_type: "elevenlabs_agent_prompt_synced",
        status: "sent",
        sent_payload: { purpose: surface, agent_id: agentId, prompt_length: prompt.length },
        response_payload: { agent_id: agentId },
      });
      result.updated.push({ surface, agentId });
    } catch (e: any) {
      result.errors.push({ surface, error: e?.message ?? "błąd aktualizacji agenta" });
    }
  }

  // Telefon: gdy voicebot dzwoni innym agentem niż A1, jego prompt (a więc i
  // zasady kanału telefonicznego) nie jest tu zarządzany — sygnalizujemy to.
  try {
    const intakeId = await getAgentIdForSurface("intake");
    const { data } = await (s as any)
      .from("voicebot_settings")
      .select("agent_id")
      .eq("id", 1)
      .maybeSingle();
    const phoneAgentId = (data?.agent_id as string | null) ?? null;
    if (phoneAgentId && phoneAgentId !== intakeId) result.phoneAgentOutOfSync = phoneAgentId;
  } catch {
    /* informacja poglądowa — brak nie jest błędem synchronizacji */
  }

  return result;
}
