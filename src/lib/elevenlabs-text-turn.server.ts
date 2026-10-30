// Jedna tura TEKSTOWA z agentem ElevenLabs (Agents/ConvAI, tryb text-only)
// przez WebSocket — używana przez router wiadomości asynchronicznych
// (Messenger / Instagram / e-mail / czat), żeby te kanały obsługiwał TEN SAM
// agent procesowy co widgety i telefon.
//
// Zaprojektowane defensywnie: każde niepowodzenie (brak konfiguracji, timeout,
// inna wersja protokołu) zwraca ok:false, a wywołujący (runAgentTurn) wraca
// do dotychczasowego silnika — kanał nigdy nie milknie przez migrację.
const EL_BASE = "https://api.elevenlabs.io/v1";
import { isTextFiller } from "./ania-text-policy";
const DEFAULT_TIMEOUT_MS = 40_000;
const GREETING_WAIT_MS = 4_000;
/** Cisza po ostatniej wypowiedzi agenta, po której tura się kończy. */
const REPLY_IDLE_MS = 3_000;

export interface ElTextToolCall {
  name: string;
  isError: boolean;
}

export interface ElTextTurnResult {
  ok: boolean;
  reply?: string;
  error?: string;
  /** Id rozmowy w ElevenLabs — do transkryptu i powodu zakończenia. */
  conversationId?: string;
  /** Narzędzia wywołane przez agenta w tej turze. */
  toolCalls?: ElTextToolCall[];
}

/** Podpisany URL sesji (agenty tworzone przez API są prywatne). */
export async function getSignedUrl(agentId: string, apiKey: string): Promise<string | null> {
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
  firstMessage?: string;
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
    let greetingTimer: ReturnType<typeof setTimeout> | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let conversationId: string | undefined;
    const toolCalls: ElTextToolCall[] = [];
    const replyParts: string[] = [];
    // Po wyniku narzędzia agent zawsze dopowiada — nie kończymy tury, dopóki
    // nie przyjdzie ta wypowiedź.
    let awaitingAfterTool = false;

    const withMeta = (r: ElTextTurnResult): ElTextTurnResult => ({
      ...r,
      conversationId,
      toolCalls,
    });
    const finish = (result: ElTextTurnResult) => {
      if (settled) return;
      settled = true;
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      clearTimeout(timer);
      if (greetingTimer) clearTimeout(greetingTimer);
      if (idleTimer) clearTimeout(idleTimer);
      resolve(withMeta(result));
    };
    const finishWithParts = (fallbackError: string) =>
      finish(
        replyParts.length > 0
          ? { ok: true, reply: replyParts.join("\n") }
          : { ok: false, error: fallbackError },
      );
    const timer = setTimeout(
      () => finishWithParts("timeout"),
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
    // Bez jawnego first_message agent zaczyna sesję własnym powitaniem
    // („W czym mogę pomóc?”). Sesja żyje jedną turę, więc wiadomość klienta
    // wysyłamy dopiero po powitaniu (albo po krótkim czasie, gdy agent go nie
    // ma), a samo powitanie pomijamy — nie jest odpowiedzią.
    const awaitGreeting = opts.firstMessage === undefined;
    const sendUser = () => {
      if (userSent) return;
      userSent = true;
      if (greetingTimer) clearTimeout(greetingTimer);
      try {
        ws?.send(JSON.stringify({ type: "user_message", text: opts.userMessage }));
      } catch (e: any) {
        finish({ ok: false, error: e?.message ?? "user send failed" });
      }
    };
    // Odpowiedź agenta bywa w kilku wypowiedziach (zdanie przed narzędziem,
    // reszta po jego wyniku) — kończymy turę po chwili ciszy, nie na pierwszej.
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (!awaitingAfterTool) finishWithParts("empty agent_response");
      }, REPLY_IDLE_MS);
    };

    ws.addEventListener("open", () => {
      try {
        if (!ws) return;
        ws.send(
          JSON.stringify({
            type: "conversation_initiation_client_data",
            // Narzędzia agentów (fy2_*) wymagają `thread_key` — bez niego
            // ElevenLabs zamyka sesję zaraz po powitaniu (1008 „Missing
            // required dynamic variables in tools: {'thread_key'}”).
            dynamic_variables: {
              thread_key: `text:${crypto.randomUUID()}`,
              ...(opts.dynamicVariables ?? {}),
            },
            conversation_config_override: {
              conversation: { text_only: true },
              ...(opts.firstMessage !== undefined
                ? { agent: { first_message: opts.firstMessage } }
                : {}),
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
          ws?.send(JSON.stringify({ type: "pong", event_id: msg?.ping_event?.event_id }));
        } catch {
          /* ignore */
        }
        return;
      }
      if (type === "conversation_initiation_metadata") {
        const id = msg?.conversation_initiation_metadata_event?.conversation_id;
        if (typeof id === "string") conversationId = id;
        if (initSent && !userSent) {
          if (awaitGreeting) greetingTimer = setTimeout(sendUser, GREETING_WAIT_MS);
          // Jawne otwarcie (A2P przy pierwszym kontakcie) jest całą odpowiedzią
          // — wiadomości klienta nie wysyłamy, bo odpowiedź na nią i tak by
          // przepadła; trafi do kontekstu następnej tury.
          else if (!opts.firstMessage) sendUser();
        }
        return;
      }
      if (type === "agent_tool_response") {
        const ev = msg?.agent_tool_response_event ?? {};
        if (typeof ev.tool_name === "string") {
          toolCalls.push({ name: ev.tool_name, isError: ev.is_error === true });
        }
        awaitingAfterTool = true;
        if (idleTimer) clearTimeout(idleTimer);
        return;
      }
      if (type === "agent_response" && !userSent && awaitGreeting) {
        // Powitanie agenta przed wiadomością klienta — nie jest odpowiedzią.
        sendUser();
        return;
      }
      if (type === "agent_response") {
        const text = msg?.agent_response_event?.agent_response;
        if (typeof text === "string" && isTextFiller(text)) return;
        if (typeof text === "string" && text.trim()) replyParts.push(text.trim());
        awaitingAfterTool = false;
        // Jawne powitanie zlecone przez wywołującego (otwarcie A2P) jest
        // całą odpowiedzią tej tury.
        if (!awaitGreeting && opts.firstMessage && replyParts.length === 1) {
          finishWithParts("empty agent_response");
          return;
        }
        armIdle();
        return;
      }
      // Zdarzenia audio/transkrypcji ignorujemy (tryb tekstowy).
    });

    ws.addEventListener("error", () => finishWithParts("websocket error"));
    ws.addEventListener("close", (ev: CloseEvent) => {
      if (settled) return;
      // Powód zerwania (np. 1008 „Missing required dynamic variables…”) musi
      // być widoczny — bez niego błąd konfiguracji agenta ginął po cichu.
      const reason = ev?.reason
        ? `closed ${ev.code}: ${ev.reason}`
        : "closed before agent_response";
      if (replyParts.length > 0) finish({ ok: true, reply: replyParts.join("\n") });
      else finish({ ok: false, error: reason });
    });
  });
}
