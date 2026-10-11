// Automatyczne podpinanie NOWYCH narzędzi do agentów ElevenLabs (A1–A3).
//
// Reguła właściciela: narzędzia, które da się dać kodem i bez kosztów, agent
// dostaje automatycznie. Dlatego zamiast instrukcji „wyklikaj w konsoli" kod
// sam: (1) zakłada brakujące narzędzia webhook w ElevenLabs (idempotentnie,
// po nazwie), (2) dopina je do właściwych agentów, (3) zapamiętuje wersję
// zestawu, żeby nie robić tego przy każdej rozmowie.
//
// Bezpieczeństwo:
//  • agent_id idzie ze zmiennej systemowej system__agent_id — endpoint ustala
//    po nim powierzchnię i politykę (model nie może się podszyć pod innego agenta),
//  • lead_id / numer — ze zmiennych rozmowy, nie z treści generowanej przez model,
//  • sekret w nagłówku z magazynu sekretów ElevenLabs (secret_id), a gdy się
//    nie da go utworzyć — jak w dotychczasowych narzędziach.
import type { AgentSurface } from "@/lib/elevenlabs-agents.server";
import { getAgentState, setAgentState } from "./store.server";

const EL = "https://api.elevenlabs.io/v1";
/** Zmiana zestawu narzędzi = podbicie wersji (wtedy kod dopnie je ponownie). */
export const AGENT_TOOLSET_VERSION = "2026-10-11.1";

type Param = {
  type: "string" | "number" | "integer" | "boolean";
  description: string;
  enum?: string[];
};

interface ToolSpec {
  tool: string;
  name: string;
  description: string;
  surfaces: AgentSurface[];
  params: Record<string, Param>;
  required?: string[];
}

export const AGENT_TOOL_SPECS: ToolSpec[] = [
  {
    tool: "get_offer_facts",
    name: "fy_get_offer_facts",
    description:
      "Aktualne warunki Finance You z systemu (prowizja, odsetki maksymalne, LTV, abonament inwestora, dane firmy). Użyj, gdy masz wątpliwość co do liczby — nie zgaduj.",
    surfaces: ["intake", "investor_info", "investor_panel"],
    params: {},
  },
  {
    tool: "estimate_cost",
    name: "fy_estimate_cost",
    description:
      "Wylicza prowizję Finance You, kwotę na rękę, maksymalną ratę (przy odsetkach maksymalnych) i LTV dla podanej kwoty. Wynik przedstaw jako orientacyjny; rata to górna granica bez prowizji inwestora.",
    surfaces: ["intake"],
    params: {
      amount: {
        type: "number",
        description: "Kwota pożyczki w złotych (pełna liczba, np. 200000)",
      },
      months: { type: "integer", description: "Okres spłaty w miesiącach (domyślnie 12)" },
      property_value: {
        type: "number",
        description: "Wartość nieruchomości w zł, jeśli rozmówca ją podał",
      },
      existing_debt: {
        type: "number",
        description: "Kwota obciążeń hipotecznych do spłaty w zł, jeśli są",
      },
    },
    required: ["amount"],
  },
  {
    tool: "search_knowledge",
    name: "fy_search_knowledge",
    description:
      "Szuka odpowiedzi w bazie wiedzy Finance You i na blogu. Użyj przy pytaniu merytorycznym, na które nie znasz pewnej odpowiedzi.",
    surfaces: ["intake", "investor_info", "investor_panel"],
    params: { query: { type: "string", description: "Pytanie rozmówcy własnymi słowami" } },
    required: ["query"],
  },
  {
    tool: "get_case_snapshot",
    name: "fy_get_case_snapshot",
    description:
      "Co już mamy w sprawie rozmówcy (dane, wniosek, status, liczba ofert) i czego brakuje. Wywołaj, zanim o coś zapytasz — nie pytaj o to, co już jest.",
    surfaces: ["intake"],
    params: {},
  },
  {
    tool: "get_market_snapshot",
    name: "fy_get_market_snapshot",
    description:
      "Zagregowane, anonimowe dane o projektach dostępnych dla inwestorów (liczba, przedziały kwot, LTV, rodzaje nieruchomości). Liczby podawaj wyłącznie z tego wyniku.",
    surfaces: ["investor_info", "investor_panel"],
    params: {},
  },
  {
    tool: "flag_urgent",
    name: "fy_flag_urgent",
    description:
      "Oznacza sprawę jako pilną i powiadamia zespół (licytacja, eksmisja, termin do 14 dni). Nie obiecuj rozmówcy kontaktu ani terminu.",
    surfaces: ["intake"],
    params: {
      reason: {
        type: "string",
        description: "Krótko: co jest pilne (np. licytacja domu 20 listopada)",
      },
      deadline_days: { type: "integer", description: "Za ile dni mija termin, jeśli wiadomo" },
    },
    required: ["reason"],
  },
  {
    tool: "log_insight",
    name: "fy_log_insight",
    description:
      "Zapisuje obserwację z rozmowy dla zespołu i agenta treści: pytanie bez odpowiedzi, obiekcję, pomysł, błąd procesu. Bez danych osobowych.",
    surfaces: ["intake", "investor_info", "investor_panel"],
    params: {
      kind: {
        type: "string",
        description: "Rodzaj obserwacji",
        enum: [
          "pytanie_bez_odpowiedzi",
          "obiekcja",
          "pomysl_na_tresc",
          "blad_procesu",
          "opinia_klienta",
          "konkurencja",
        ],
      },
      text: { type: "string", description: "Treść obserwacji, 1–3 zdania" },
    },
    required: ["kind", "text"],
  },
  {
    tool: "request_capability",
    name: "fy_request_capability",
    description:
      "Prośba o nowe narzędzie albo dostęp do danych, którego brakuje Ci do dobrej obsługi rozmówcy. Darmowe rzeczy system włączy sam, resztę zgłosi właścicielowi.",
    surfaces: ["intake", "investor_info", "investor_panel"],
    params: {
      description: { type: "string", description: "Czego potrzebujesz" },
      why: { type: "string", description: "Po co — jaki problem rozmówcy to rozwiąże" },
    },
    required: ["description"],
  },
];

function toolsBaseUrl(): string {
  return (process.env.AGENT_TOOLS_BASE_URL || "https://app.financeyou.pl").replace(/\/+$/, "");
}

async function el(apiKey: string, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${EL}${path}`, {
    ...init,
    headers: { "xi-api-key": apiKey, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      json?.detail?.message ?? json?.detail ?? json?.message ?? `ElevenLabs HTTP ${res.status}`,
    );
  }
  return json;
}

/** Sekret w magazynie ElevenLabs (raz utworzony — dalej tylko odczyt id). */
async function ensureSecretRef(
  apiKey: string,
  value: string,
): Promise<{ secret_id: string } | string> {
  const NAME = "fy_agent_tools_secret";
  try {
    const list = await el(apiKey, "/convai/secrets");
    const found = (list?.secrets ?? []).find((x: any) => x?.name === NAME);
    if (found?.secret_id) return { secret_id: found.secret_id };
    const created = await el(apiKey, "/convai/secrets", {
      method: "POST",
      body: JSON.stringify({ type: "new", name: NAME, value }),
    });
    if (created?.secret_id) return { secret_id: created.secret_id };
  } catch (e) {
    console.warn(
      "[el-tools] magazyn sekretów niedostępny — nagłówek jawny jak w dotychczasowych narzędziach",
      e,
    );
  }
  return value;
}

export function buildToolConfig(spec: ToolSpec, secretHeader: { secret_id: string } | string) {
  const argsProps: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(spec.params)) {
    argsProps[k] = {
      type: p.type,
      description: p.description,
      ...(p.enum ? { enum: p.enum } : {}),
    };
  }
  const body: Record<string, unknown> = {
    type: "object",
    description: "payload",
    required: ["tool"],
    properties: {
      tool: { type: "string", constant_value: spec.tool },
      agent_id: { type: "string", dynamic_variable: "system__agent_id" },
      lead_id: { type: "string", dynamic_variable: "lead_id" },
      phone: { type: "string", dynamic_variable: "system__caller_id" },
      channel: { type: "string", dynamic_variable: "channel" },
      ...(Object.keys(argsProps).length
        ? {
            args: {
              type: "object",
              description: "Argumenty narzędzia",
              required: spec.required ?? [],
              properties: argsProps,
            },
          }
        : {}),
    },
  };
  return {
    type: "webhook",
    name: spec.name,
    description: spec.description,
    response_timeout_secs: 20,
    api_schema: {
      url: `${toolsBaseUrl()}/api/public/agent-tools`,
      method: "POST",
      request_headers: { "X-Agent-Tools-Secret": secretHeader, "Content-Type": "application/json" },
      request_body_schema: body,
    },
  };
}

export interface EnsureToolsResult {
  created: string[];
  attached: Array<{ surface: AgentSurface; added: number }>;
  skipped?: string;
  errors: string[];
}

/**
 * Zakłada brakujące narzędzia i dopina je do agentów. Bezpieczne do wołania
 * często: przy aktualnej wersji zestawu kończy się jednym odczytem z bazy.
 */
export async function ensureAgentToolsAttached(
  opts: { force?: boolean } = {},
): Promise<EnsureToolsResult> {
  const result: EnsureToolsResult = { created: [], attached: [], errors: [] };
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const secret = process.env.AGENT_TOOLS_SECRET;
  if (!apiKey || !secret)
    return { ...result, skipped: "brak ELEVENLABS_API_KEY albo AGENT_TOOLS_SECRET" };
  if (!opts.force) {
    const done = await getAgentState<string | null>("el_toolset_version", null);
    if (done === AGENT_TOOLSET_VERSION) return { ...result, skipped: "zestaw narzędzi aktualny" };
  }

  const secretHeader = await ensureSecretRef(apiKey, secret);
  const existing = await el(apiKey, "/convai/tools?page_size=100").catch((e) => {
    result.errors.push(`lista narzędzi: ${e.message}`);
    return { tools: [] };
  });
  const byName = new Map<string, string>();
  for (const t of existing?.tools ?? [])
    if (t?.tool_config?.name && t?.id) byName.set(t.tool_config.name, t.id);

  for (const spec of AGENT_TOOL_SPECS) {
    if (byName.has(spec.name)) continue;
    try {
      const created = await el(apiKey, "/convai/tools", {
        method: "POST",
        body: JSON.stringify({ tool_config: buildToolConfig(spec, secretHeader) }),
      });
      if (created?.id) {
        byName.set(spec.name, created.id);
        result.created.push(spec.name);
      }
    } catch (e: any) {
      result.errors.push(`${spec.name}: ${e.message}`);
    }
  }

  const { getAgentIdForSurface } = await import("@/lib/elevenlabs-agents.server");
  for (const surface of ["intake", "investor_info", "investor_panel"] as AgentSurface[]) {
    const agentId = await getAgentIdForSurface(surface);
    if (!agentId) continue;
    try {
      const agent = await el(apiKey, `/convai/agents/${encodeURIComponent(agentId)}`);
      const current: string[] = agent?.conversation_config?.agent?.prompt?.tool_ids ?? [];
      const wanted = AGENT_TOOL_SPECS.filter((t) => t.surfaces.includes(surface))
        .map((t) => byName.get(t.name))
        .filter((id): id is string => Boolean(id));
      const missing = wanted.filter((id) => !current.includes(id));
      if (missing.length === 0) continue;
      await el(apiKey, `/convai/agents/${encodeURIComponent(agentId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          conversation_config: { agent: { prompt: { tool_ids: [...current, ...missing] } } },
        }),
      });
      result.attached.push({ surface, added: missing.length });
    } catch (e: any) {
      result.errors.push(`${surface}: ${e.message}`);
    }
  }

  if (result.errors.length === 0) {
    await setAgentState(
      "el_toolset_version",
      AGENT_TOOLSET_VERSION,
      `narzędzia agentów ${AGENT_TOOLSET_VERSION}`,
    );
  }
  return result;
}
