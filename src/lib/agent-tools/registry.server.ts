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
  normalizeToolName,
  redactDeep,
  resolveConversationId,
  resolveTrustedContact,
} from "./guard.server";

const REGISTRY = new Map<string, ToolSpec>();

export function registerTools(specs: readonly ToolSpec[]): void {
  for (const spec of specs) {
    if (REGISTRY.has(spec.name))
      throw new Error(`Narzędzie zarejestrowane dwukrotnie: ${spec.name}`);
    REGISTRY.set(spec.name, spec);
  }
}

export function hasTool(name: string): boolean {
  return REGISTRY.has(normalizeToolName(name));
}

export function listTools(): ToolSpec[] {
  return Array.from(REGISTRY.values());
}

// Wspólna obietnica, nie flaga: przy zimnym starcie dwa równoległe żądania
// muszą CZEKAĆ na te same importy. Flaga ustawiana przed `await` wpuszczała
// drugie żądanie do pustego rejestru („Nieznane narzędzie” dla floty).
let loading: Promise<void> | null = null;
/** Ładuje moduły domenowe raz na proces (dynamiczny import — lekki start). */
export function ensureToolsLoaded(): Promise<void> {
  loading ??= Promise.all([
    import("./tools-triage.server"),
    import("./tools-collections.server"),
    import("./tools-investor.server"),
    import("./tools-knowledge.server"),
  ]).then(
    (mods) => {
      for (const m of mods) registerTools(m.TOOLS);
    },
    (e: unknown) => {
      // Nieudany import (np. chwilowy błąd wdrożenia) nie może zablokować
      // rejestru na zawsze — następne żądanie spróbuje ponownie.
      loading = null;
      throw e;
    },
  );
  return loading;
}

export interface DispatchOutcome {
  status: number;
  body: { ok: boolean; result?: unknown; error?: string; meta?: Record<string, unknown> };
}

/**
 * Pełny przebieg jednego wywołania. Nie rzuca — każdy błąd zamienia na
 * odpowiedź z kodem i wpisem w audycie.
 */
export async function dispatchTool(
  request: Request,
  body: ToolRequestBody,
): Promise<DispatchOutcome> {
  const started = Date.now();
  await ensureToolsLoaded();

  const tool = normalizeToolName(body?.tool);
  const spec = REGISTRY.get(tool);
  const agentKey = normalizeAgentKey(body?.agent_key);
  const channel = String(body?.channel ?? "voice_phone").slice(0, 32);
  const args = (body?.args && typeof body.args === "object" ? body.args : {}) as Record<
    string,
    unknown
  >;
  // Kontakt tylko z kanału (caller-id, nadawca z podpisanego wątku). Numer
  // czy e-mail podany przez rozmówcę zostaje w `args` jako deklaracja.
  const trusted = await resolveTrustedContact(body ?? {});
  const callerPhone = trusted.phone;
  const callerEmail = trusted.email;
  const conversationId = resolveConversationId(body ?? {});

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

  // Najpierw sekret, ZANIM cokolwiek trafi do bazy: nieuwierzytelnione
  // żądanie nie poznaje listy narzędzi (zawsze 401) i nie może zapychać
  // audytu zapisami. Odmowy na tym etapie idą tylko do logu serwera.
  const preAuth = authorizeRequest(request, { allowQueryToken: true });
  if (!preAuth.ok) {
    console.warn("[agent-tools] odrzucone bez sekretu:", preAuth.reason);
    return { status: 401, body: { ok: false, error: "unauthorized" } };
  }

  if (!spec) return deny(400, "unknown_tool", `Nieznane narzędzie: ${tool || "(brak)"}`);

  // Zapisy i dane podmiotu: sekret wyłącznie w nagłówku.
  const auth = authorizeRequest(request, {
    allowQueryToken: !spec.writes && !spec.requiresIdentity,
  });
  if (!auth.ok) return deny(401, auth.reason, "unauthorized");

  if (agentKey === "unknown") {
    return deny(403, "unknown_agent", "Brak `agent_key` — narzędzie wymaga identyfikacji agenta.");
  }
  if (spec.agents.length && !spec.agents.includes(agentKey)) {
    return deny(403, "agent_not_allowed", `Agent „${agentKey}” nie może wołać „${tool}”.`);
  }

  const session = await loadSession(conversationId, agentKey, channel);
  if (spec.requiresIdentity && !session.identity_verified) {
    return deny(
      403,
      "identity_required",
      "Najpierw potwierdź tożsamość rozmówcy (verify_identity).",
    );
  }

  const recent = await countRecentCalls(conversationId, tool, spec.rateLimit.windowMinutes);
  if (recent >= spec.rateLimit.perConversation) {
    return deny(
      429,
      "rate_limited",
      "Limit wywołań tego narzędzia w tej rozmowie został wyczerpany.",
    );
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
    return {
      status: 500,
      body: {
        ok: false,
        error: "Narzędzie zgłosiło błąd — powiedz rozmówcy, że sprawdzisz to inaczej.",
      },
    };
  }

  if (!result.ok) {
    await auditCall({
      conversation_id: conversationId,
      agent_key: agentKey,
      tool,
      decision: "denied",
      // Bez cytatów z wejścia modelu („…”) — audyt nie przechowuje treści rozmowy.
      reason: result.error.replace(/„[^”]*”/g, "„…”").slice(0, 200),
      args,
      duration_ms: Date.now() - started,
    });
    return { status: result.status ?? 200, body: { ok: false, error: result.error } };
  }

  // Ostatnia linia obrony: niezależnie od handlera, wynik przechodzi redakcję.
  const safe = redactDeep(
    result.result,
    ["rachunek_splaty", "rachunek_splaty_grupy"],
    ctx.redactions,
  );
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
