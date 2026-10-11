// Rejestr i dyspozytor narzędzi agentów. Jedna ścieżka wykonania:
//   autoryzacja → normalizacja → sesja → uprawnienia agenta → tożsamość →
//   limit → handler → redakcja → audyt.
// Handlery domenowe rejestrują się przez `registerTools` (triage, windykacja,
// inwestor, wiedza). Nieznane narzędzie = odmowa.
import type { ToolContext, ToolRequestBody, ToolResult, ToolSpec } from "./types";
import {
  auditCall,
  authorizeRequest,
  countRecentCalls,
  loadSession,
  normalizeAgentKey,
  normalizeEmail,
  normalizePhone,
  normalizeToolName,
  redactDeep,
  resolveConversationId,
} from "./guard.server";

const REGISTRY = new Map<string, ToolSpec>();

export function registerTools(specs: readonly ToolSpec[]): void {
  for (const spec of specs) {
    if (REGISTRY.has(spec.name)) throw new Error(`Narzędzie zarejestrowane dwukrotnie: ${spec.name}`);
    REGISTRY.set(spec.name, spec);
  }
}

export function hasTool(name: string): boolean {
  return REGISTRY.has(normalizeToolName(name));
}

export function listTools(): ToolSpec[] {
  return Array.from(REGISTRY.values());
}

let loaded = false;
/** Ładuje moduły domenowe raz na proces (dynamiczny import — lekki start). */
export async function ensureToolsLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const mods = await Promise.all([
    import("./tools-triage.server"),
    import("./tools-collections.server"),
    import("./tools-investor.server"),
    import("./tools-knowledge.server"),
  ]);
  for (const m of mods) registerTools(m.TOOLS);
}

export interface DispatchOutcome {
  status: number;
  body: { ok: boolean; result?: unknown; error?: string; meta?: Record<string, unknown> };
}

/**
 * Pełny przebieg jednego wywołania. Nie rzuca — każdy błąd zamienia na
 * odpowiedź z kodem i wpisem w audycie.
 */
export async function dispatchTool(request: Request, body: ToolRequestBody): Promise<DispatchOutcome> {
  const started = Date.now();
  await ensureToolsLoaded();

  const tool = normalizeToolName(body?.tool);
  const spec = REGISTRY.get(tool);
  const agentKey = normalizeAgentKey(body?.agent_key);
  const channel = String(body?.channel ?? "voice_phone").slice(0, 32);
  const args = (body?.args && typeof body.args === "object" ? body.args : {}) as Record<string, unknown>;
  const callerPhone = await normalizePhone(body?.phone ?? (args as any)?.phone);
  const callerEmail = normalizeEmail(body?.email ?? (args as any)?.email);
  const conversationId = resolveConversationId(body ?? {}, callerPhone);

  const deny = async (status: number, reason: string, error: string): Promise<DispatchOutcome> => {
    await auditCall({
      conversation_id: conversationId,
      agent_key: agentKey,
      tool: tool || "(brak)",
      decision: "denied",
      reason,
      args,
      duration_ms: Date.now() - started,
    });
    return { status, body: { ok: false, error } };
  };

  if (!spec) return deny(400, "unknown_tool", `Nieznane narzędzie: ${tool || "(brak)"}`);

  // Zapisy i dane podmiotu: sekret wyłącznie w nagłówku.
  const auth = authorizeRequest(request, { allowQueryToken: !spec.writes && !spec.requiresIdentity });
  if (!auth.ok) return deny(401, auth.reason, "unauthorized");

  if (agentKey === "unknown") {
    return deny(403, "unknown_agent", "Brak `agent_key` — narzędzie wymaga identyfikacji agenta.");
  }
  if (spec.agents.length && !spec.agents.includes(agentKey)) {
    return deny(403, "agent_not_allowed", `Agent „${agentKey}” nie może wołać „${tool}”.`);
  }

  const session = await loadSession(conversationId, agentKey, channel);
  if (spec.requiresIdentity && !session.identity_verified) {
    return deny(403, "identity_required", "Najpierw potwierdź tożsamość rozmówcy (verify_identity).");
  }

  const recent = await countRecentCalls(conversationId, tool, spec.rateLimit.windowMinutes);
  if (recent >= spec.rateLimit.perConversation) {
    return deny(429, "rate_limited", "Limit wywołań tego narzędzia w tej rozmowie został wyczerpany.");
  }

  const ctx: ToolContext = {
    tool,
    body,
    args,
    session,
    callerPhone,
    callerEmail,
    now: new Date(),
    redactions: [],
  };

  let result: ToolResult;
  try {
    result = await spec.handler(ctx);
  } catch (e: any) {
    console.error("[agent-tools] handler error", tool, e?.message);
    await auditCall({
      conversation_id: conversationId,
      agent_key: agentKey,
      tool,
      decision: "error",
      reason: String(e?.message ?? "error").slice(0, 200),
      args,
      duration_ms: Date.now() - started,
    });
    return { status: 500, body: { ok: false, error: "Narzędzie zgłosiło błąd — powiedz rozmówcy, że sprawdzisz to inaczej." } };
  }

  if (!result.ok) {
    await auditCall({
      conversation_id: conversationId,
      agent_key: agentKey,
      tool,
      decision: "denied",
      reason: result.error.slice(0, 200),
      args,
      duration_ms: Date.now() - started,
    });
    return { status: result.status ?? 200, body: { ok: false, error: result.error } };
  }

  // Ostatnia linia obrony: niezależnie od handlera, wynik przechodzi redakcję.
  const safe = redactDeep(result.result, ["rachunek_splaty"], ctx.redactions);
  await auditCall({
    conversation_id: conversationId,
    agent_key: agentKey,
    tool,
    decision: "ok",
    args,
    rows: result.rows ?? null,
    redactions: ctx.redactions,
    duration_ms: Date.now() - started,
  });
  return { status: 200, body: { ok: true, result: safe } };
}
