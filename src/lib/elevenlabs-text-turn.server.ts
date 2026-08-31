// Jedna tura TEKSTOWA z agentem ElevenLabs (Agents/ConvAI, tryb text-only)
// przez WebSocket — używana przez router wiadomości asynchronicznych
// (Messenger / Instagram / e-mail / czat), żeby te kanały obsługiwał TEN SAM
// agent procesowy co widgety i telefon.
//
// Zaprojektowane defensywnie: każde niepowodzenie (brak konfiguracji, timeout,
// inna wersja protokołu) zwraca ok:false, a wywołujący (runAgentTurn) wraca
// do dotychczasowego silnika — kanał nigdy nie milknie przez migrację.
const EL_BASE = "https://api.elevenlabs.io/v1";
const DEFAULT_TIMEOUT_MS = 25_000;

export interface ElTextTurnResult {
  ok: boolean;
  reply?: string;
  error?: string;
}

/** Podpisany URL sesji (agenty tworzone przez API są prywatne). */
async function getSignedUrl(agentId: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${EL_BASE}/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } },
    );
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    return typeof json?.signed_url === "string" ? json.signed_url : null;
  } catch {
    return null;
  }
}

export async function elevenLabsTextTurn(opts: {
  agentId: string;
  userMessage: string;
  dynamicVariables?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}): Promise<ElTextTurnResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ok: false, error: "Brak ELEVENLABS_API_KEY" };
  if (typeof WebSocket === "undefined") {
    return { ok: false, error: "Brak WebSocket w środowisku wykonawczym" };
  }

  const signedUrl = await getSignedUrl(opts.agentId, apiKey);
  const wsUrl =
    signedUrl ??
    `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${encodeURIComponent(opts.agentId)}`;

  return new Promise<ElTextTurnResult>((resolve) => {
    let settled = false;
    let ws: WebSocket | null = null;
    const finish = (result: ElTextTurnResult) => {
      if (settled) return;
      settled = true;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, error: "timeout" }),
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    try {
      ws = new WebSocket(wsUrl);
    } catch (e: any) {
      finish({ ok: false, error: e?.message ?? "WebSocket open failed" });
      return;
    }

    let initSent = false;
    let userSent = false;
    const replyParts: string[] = [];

    ws.addEventListener("open", () => {
      try {
        ws!.send(
          JSON.stringify({
            type: "conversation_initiation_client_data",
            dynamic_variables: opts.dynamicVariables ?? {},
            conversation_config_override: {
              conversation: { text_only: true },
            },
          }),
        );
        initSent = true;
      } catch (e: any) {
        finish({ ok: false, error: e?.message ?? "init send failed" });
      }
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const type = msg?.type;

      if (type === "ping") {
        // Protokół wymaga odbicia pinga, inaczej sesja pada.
        try {
          ws!.send(JSON.stringify({ type: "pong", event_id: msg?.ping_event?.event_id }));
        } catch {
          /* ignore */
        }
        return;
      }
      if (type === "conversation_initiation_metadata" && initSent && !userSent) {
        userSent = true;
        try {
          ws!.send(JSON.stringify({ type: "user_message", text: opts.userMessage }));
        } catch (e: any) {
          finish({ ok: false, error: e?.message ?? "user send failed" });
        }
        return;
      }
      if (type === "agent_response") {
        const text = msg?.agent_response_event?.agent_response;
        if (typeof text === "string" && text.trim()) replyParts.push(text.trim());
        // Odpowiedź agenta kończy turę tekstową.
        finish(
          replyParts.length > 0
            ? { ok: true, reply: replyParts.join("\n") }
            : { ok: false, error: "empty agent_response" },
        );
        return;
      }
      // Zdarzenia audio/transkrypcji ignorujemy (tryb tekstowy).
    });

    ws.addEventListener("error", () => finish({ ok: false, error: "websocket error" }));
    ws.addEventListener("close", () => {
      if (!settled) {
        finish(
          replyParts.length > 0
            ? { ok: true, reply: replyParts.join("\n") }
            : { ok: false, error: "closed before agent_response" },
        );
      }
    });
  });
}
