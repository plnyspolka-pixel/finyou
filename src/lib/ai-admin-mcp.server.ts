// Most: wewnętrzny asystent (Claude) ↔ narzędzia serwera MCP aplikacji.
//
// Zamiast wklejać ~kilkaset opisów narzędzi do każdego zapytania (koszt tokenów),
// asystent dostaje dwa meta-narzędzia: `mcp_search_tools` (wyszukiwarka po
// katalogu z pełnym schematem wejścia) i `mcp_call_tool` (wywołanie). Narzędzia
// uruchamiamy w procesie, z tokenem sesji administratora — działają dokładnie
// jak z Claude.ai / ChatGPT (te same sprawdzenia ról i RLS), np. rolki przez
// `create_studio_video_job`.
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext } from "@lovable.dev/mcp-js";

type AnyTool = {
  name: string;
  title: string;
  description: string;
  inputSchema?: z.ZodRawShape;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  handler: (args: unknown, ctx: ToolContext) => unknown;
};

async function loadTools(): Promise<readonly AnyTool[]> {
  const mod = await import("./mcp/index");
  return (mod.default as unknown as { tools: readonly AnyTool[] }).tools;
}

export const MCP_BRIDGE_TOOLS = [
  {
    name: "mcp_search_tools",
    description:
      "Wyszukuje narzędzia platformy (serwer MCP Finance You: CRM, wnioski, KW, umowy, marketing, publikacje social, Meta/Facebook, YouTube, HeyGen i STUDIO PUBLIKACJI — rolki, awatary, b-rolle, ElevenLabs, Twilio, Google i inne). Zwraca nazwy, opisy i schemat argumentów. Użyj przed `mcp_call_tool`, gdy nie znasz dokładnej nazwy lub argumentów. Puste `query` = lista wszystkich nazw.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Słowa kluczowe, np. 'studio rolka', 'facebook post'." },
        limit: { type: "number", description: "Maks. wyników ze schematem (domyślnie 8, max 25).", default: 8 },
      },
    },
  },
  {
    name: "mcp_call_tool",
    description:
      "Wywołuje narzędzie platformy (serwer MCP) po nazwie z `mcp_search_tools`, jako zalogowany administrator. Działania zapisujące i wysyłki (publikacje, maile, zlecenia HeyGen) wykonuj dopiero po wyraźnej zgodzie administratora.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Dokładna nazwa narzędzia." },
        arguments: { type: "object", description: "Argumenty zgodne ze schematem narzędzia." },
      },
      required: ["name"],
    },
  },
] as const;

function schemaOf(t: AnyTool): unknown {
  if (!t.inputSchema) return { type: "object", properties: {} };
  const js = zodToJsonSchema(z.object(t.inputSchema), { $refStrategy: "none" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

function makeCtx(token: string, userId: string, email?: string): ToolContext {
  const claims = { sub: userId, email, role: "authenticated" };
  return {
    isAuthenticated: () => true,
    getToken: () => token,
    getUserId: () => userId,
    getUserEmail: () => email,
    getClientId: () => "ai-admin",
    getScopes: () => [],
    getIssuer: () => undefined,
    getClaims: () => claims,
  } as unknown as ToolContext;
}

export async function runMcpBridgeTool(
  call: { name: string; input: Record<string, unknown> },
  auth: { token?: string; userId?: string; email?: string },
): Promise<{ ok: boolean; output: unknown; error?: string }> {
  const tools = await loadTools();

  if (call.name === "mcp_search_tools") {
    const q = String(call.input.query ?? "").toLowerCase().trim();
    const limit = Math.min(Math.max(Number(call.input.limit ?? 8) || 8, 1), 25);
    if (!q) return { ok: true, output: { count: tools.length, names: tools.map((t) => t.name) } };
    const words = q.split(/\s+/).filter(Boolean);
    const scored = tools
      .map((t) => {
        const hay = `${t.name} ${t.title} ${t.description}`.toLowerCase();
        const score = words.reduce(
          (s, w) => s + (t.name.includes(w) ? 5 : 0) + (hay.includes(w) ? 1 : 0),
          0,
        );
        return { t, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return {
      ok: true,
      output: scored.map(({ t }) => ({
        name: t.name,
        description: t.description,
        read_only: t.annotations?.readOnlyHint ?? false,
        input_schema: schemaOf(t),
      })),
    };
  }

  if (call.name === "mcp_call_tool") {
    if (!auth.token || !auth.userId)
      return { ok: false, output: null, error: "Brak sesji administratora do wywołania narzędzia." };
    const name = String(call.input.name ?? "");
    const tool = tools.find((t) => t.name === name);
    if (!tool) return { ok: false, output: null, error: `Nie ma narzędzia „${name}". Użyj mcp_search_tools.` };
    const raw = (call.input.arguments ?? {}) as Record<string, unknown>;
    const parsed = tool.inputSchema ? z.object(tool.inputSchema).safeParse(raw) : { success: true as const, data: raw };
    if (!parsed.success)
      return { ok: false, output: null, error: `Złe argumenty: ${parsed.error.message}` };
    const res = (await tool.handler(parsed.data, makeCtx(auth.token, auth.userId, auth.email))) as {
      content?: Array<{ type: string; text?: string; uri?: string; name?: string }>;
      isError?: boolean;
    };
    const text = (res?.content ?? [])
      .map((b) => (b.type === "text" ? b.text : b.uri ? `[${b.type}] ${b.name ?? ""} ${b.uri}` : `[${b.type}]`))
      .join("\n")
      .slice(0, 60000);
    return res?.isError ? { ok: false, output: null, error: text || "Narzędzie zwróciło błąd." } : { ok: true, output: text };
  }

  return { ok: false, output: null, error: `Nieznane narzędzie mostu: ${call.name}` };
}
