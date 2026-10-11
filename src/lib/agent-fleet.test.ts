// Spójność floty ElevenLabs z kodem — to, czego nie widać w panelu, a co
// psuje rozmowy po cichu:
//  * każde narzędzie ElevenLabs wysyła STAŁE `tool` i `agent_key` (model nie
//    podmieni agenta) i dynamiczne id rozmowy / klucz wątku;
//  * żaden argument nie jest obiektem bez wymienionych pól — ElevenLabs wycina
//    klucze spoza schematu (tak `patch` w fy_update_lead_data docierał pusty);
//  * agent ma każde narzędzie, które jego prompt każe wołać, a serwer pozwala
//    temu kluczowi agenta na każde narzędzie, które mu podpinamy;
//  * przełączenia wskazują na istniejące agenty, a agenty tekstowe są text_only.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/lead-comms.server", () => ({ sendSmsInternal: vi.fn() }));
vi.mock("@/lib/voicebot.functions", () => ({}));
vi.mock("@/lib/text-agent-knowledge.server", () => ({ retrieveKnowledge: vi.fn() }));

import {
  EXISTING_AGENTS,
  FLEET_AGENTS,
  FLEET_AGENT_KEYS,
  FLEET_TOOLS,
  buildAgentConfig,
  buildWebhookToolConfig,
  elevenToolName,
  toolsForAgent,
  type ArgField,
} from "./agent-fleet";
import { TOOLS as TRIAGE_TOOLS } from "./agent-tools/tools-triage.server";
import { TOOLS as COLLECTION_TOOLS } from "./agent-tools/tools-collections.server";
import { TOOLS as INVESTOR_TOOLS } from "./agent-tools/tools-investor.server";
import { TOOLS as KNOWLEDGE_TOOLS } from "./agent-tools/tools-knowledge.server";

const SERVER_TOOLS = [...TRIAGE_TOOLS, ...COLLECTION_TOOLS, ...INVESTOR_TOOLS, ...KNOWLEDGE_TOOLS];
const serverTool = (name: string) => SERVER_TOOLS.find((t) => t.name === name);

type Json = Record<string, any>;
const bodyOf = (cfg: Json): Json => cfg.api_schema.request_body_schema;

function emptyObjects(field: Json, path: string): string[] {
  if (field.type === "object") {
    const props = Object.entries(field.properties ?? {});
    if (!props.length) return [path];
    return props.flatMap(([k, v]) => emptyObjects(v as Json, `${path}.${k}`));
  }
  if (field.type === "array" && field.items) return emptyObjects(field.items, `${path}[]`);
  return [];
}

describe("narzędzia floty", () => {
  const configs = FLEET_TOOLS.flatMap((spec) =>
    spec.agentKeys.map((agentKey) => ({ spec, agentKey, cfg: buildWebhookToolConfig(spec, agentKey, { secretId: "sec_x" }) as Json })),
  );

  it("nazwy ElevenLabs są unikalne i mieszczą się w limicie", () => {
    const names = configs.map((c) => c.cfg.name as string);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n.length).toBeLessThanOrEqual(64);
    for (const c of configs) expect(c.cfg.name).toBe(elevenToolName(c.spec.tool, c.agentKey));
  });

  it("tool i agent_key są stałe, id rozmowy i klucz wątku — dynamiczne", () => {
    for (const { spec, agentKey, cfg } of configs) {
      const p = bodyOf(cfg).properties;
      expect(p.tool).toEqual({ type: "string", constant_value: spec.tool });
      expect(p.agent_key).toEqual({ type: "string", constant_value: agentKey });
      expect(p.conversation_id.dynamic_variable).toBe("system__conversation_id");
      expect(p.thread_key.dynamic_variable).toBe("thread_key");
      expect(p.channel.dynamic_variable).toBe("channel");
    }
  });

  it("sekret idzie przez magazyn sekretów ElevenLabs, nie jawnym tekstem", () => {
    for (const { cfg } of configs) {
      expect(cfg.api_schema.request_headers["X-Agent-Tools-Secret"]).toEqual({ secret_id: "sec_x" });
      expect(cfg.api_schema.url).toMatch(/^https:\/\//);
    }
  });

  it("żaden argument nie jest obiektem bez wymienionych pól (ElevenLabs by go wyczyścił)", () => {
    for (const { cfg } of configs) {
      const args = bodyOf(cfg).properties.args;
      const offenders = Object.entries(args.properties as Json).flatMap(([k, v]) => emptyObjects(v as Json, `${cfg.name}.${k}`));
      expect(offenders).toEqual([]);
    }
  });

  it("wymagane argumenty istnieją w schemacie", () => {
    const check = (f: ArgField, where: string) => {
      for (const r of f.required ?? []) expect(Object.keys(f.properties ?? {}), where).toContain(r);
    };
    for (const spec of FLEET_TOOLS) {
      for (const r of spec.requiredArgs ?? []) expect(Object.keys(spec.args), spec.tool).toContain(r);
      for (const [k, f] of Object.entries(spec.args)) if (f.type === "object") check(f, `${spec.tool}.${k}`);
    }
  });

  it("serwer zna każde narzędzie floty i dopuszcza każdy klucz agenta, któremu je podpinamy", () => {
    for (const spec of FLEET_TOOLS) {
      const server = serverTool(spec.tool);
      expect(server, `brak handlera dla ${spec.tool}`).toBeDefined();
      for (const key of spec.agentKeys) expect(server!.agents, `${spec.tool} dla ${key}`).toContain(key);
    }
  });
});

describe("agenty floty", () => {
  const ALL_TOOL_NAMES = [...new Set([...FLEET_TOOLS.map((t) => t.tool), ...SERVER_TOOLS.map((t) => t.name)])];

  it("klucze są unikalne i zgodne z listą", () => {
    expect(FLEET_AGENTS.map((a) => a.key).sort()).toEqual([...FLEET_AGENT_KEYS].sort());
  });

  it("agent ma każde narzędzie, które prompt każe wołać", () => {
    for (const agent of FLEET_AGENTS) {
      const attached = new Set(toolsForAgent(agent).map((t) => t.tool));
      const mentioned = ALL_TOOL_NAMES.filter((name) => new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(agent.prompt));
      const missing = mentioned.filter((name) => !attached.has(name));
      expect(missing, `${agent.key}: prompt wspomina narzędzia, których agent nie ma`).toEqual([]);
    }
  });

  it("przełączenia wskazują na agenty floty albo istniejące", () => {
    const known = new Set<string>([...FLEET_AGENT_KEYS, ...Object.keys(EXISTING_AGENTS)]);
    for (const agent of FLEET_AGENTS) {
      for (const t of agent.transfers) {
        expect(known.has(t.to), `${agent.key} → ${t.to}`).toBe(true);
        expect(t.to).not.toBe(agent.key);
        // Głos przełącza do głosu, tekst do tekstu (A1 i A3 obsługują oba).
        if (t.to in EXISTING_AGENTS) continue;
        const target = FLEET_AGENTS.find((a) => a.key === t.to)!;
        expect(target.mode, `${agent.key} → ${t.to}`).toBe(agent.mode);
      }
    }
  });

  it("konfiguracja: tekstowe text_only, klucz wątku w zmiennych, dane narzędzi mają placeholdery", () => {
    for (const agent of FLEET_AGENTS) {
      const agentIds = Object.fromEntries([...FLEET_AGENT_KEYS, ...Object.keys(EXISTING_AGENTS)].map((k) => [k, `agent_${k}`]));
      const cfg = buildAgentConfig(agent, { toolIds: ["tool_1"], agentIds }) as Json;
      const conv = cfg.conversation_config;
      expect(conv.conversation.text_only).toBe(agent.mode === "text");
      const placeholders = conv.agent.dynamic_variables.dynamic_variable_placeholders;
      expect(placeholders).toHaveProperty("thread_key");
      // Narzędzia wysyłają {{channel}} — bez placeholdera ElevenLabs odrzuca start rozmowy.
      expect(placeholders).toHaveProperty("channel");
      const transfers = conv.agent.prompt.built_in_tools.transfer_to_agent?.params.transfers ?? [];
      expect(transfers).toHaveLength(agent.transfers.length);
      expect(cfg.platform_settings.guardrails.prompt_injection.is_enabled).toBe(true);
    }
  });

  it("prompt nie prosi o PESEL ani pełny numer konta", () => {
    for (const agent of FLEET_AGENTS) {
      expect(agent.prompt, agent.key).not.toMatch(/(?<!nie\s(?:\S+\s){0,4})(podaj|poproś o|zapytaj o)\s+(swój\s+)?PESEL/i);
    }
  });
});
