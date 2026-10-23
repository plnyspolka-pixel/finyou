/** One browser connection for the entire public voice/text conversation.
 * Audio is enabled on demand; changing mode never opens another connection.
 * A broken socket cannot retain a provider conversation ID: reconnect visibly
 * and restore context, without replaying an uncertain user message.
 */
import { startVoiceConversation, type VoiceConversation, type VoiceState } from "./voice-conversation";

export type AniaMode = "voice" | "text";
export type AniaSurface = "intake" | "investor_info";
export function publicAniaSurface(path: string): AniaSurface {
  return /^\/dla-inwestor(?:a|ow|ów)(?:\/|$)/.test(path) ? "investor_info" : "intake";
}

export function createAniaSession(options: {
  surface: AniaSurface;
  dynamicVariables: Record<string, string | number | boolean>;
  onState: (state: VoiceState) => void;
  onMessage: (role: "assistant" | "user", text: string) => void;
  onNotice: (text: string) => void;
  onConversationId: (id: string) => void;
}) {
  let active: VoiceConversation | null = null;
  let connecting: Promise<VoiceConversation> | null = null;
  let stopped = false;
  let mode: AniaMode = "text";
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let retry = 0;
  let hasGreeting = false;
  const history: string[] = [];

  const connect = (): Promise<VoiceConversation> => {
    if (stopped) return Promise.reject(new Error("Rozmowa zakończona."));
    if (active) return Promise.resolve(active);
    if (connecting) return connecting;
    let firstResponse = true;
    const reconnecting = hasGreeting;
    connecting = startVoiceConversation(
      { surface: options.surface, dynamicVariables: options.dynamicVariables, mode: "text" },
      {
        onConversationId: options.onConversationId,
        onState: (state) => {
          if (stopped) return;
          options.onState(state);
          if (state === "ended" || state === "error") {
            active = null;
            scheduleReconnect();
          }
        },
        onAgentMessage: (text) => {
          if (stopped) return;
          // The first response on a freshly opened connection is the greeting,
          // not an answer to a pending question. Never complete a turn with it.
          if (firstResponse) {
            firstResponse = false;
            if (hasGreeting) return;
            hasGreeting = true;
          }
          history.push(`Ania: ${text}`);
          options.onMessage("assistant", text);
        },
        onUserMessage: (text) => {
          if (stopped) return;
          history.push(`Użytkownik: ${text}`);
          options.onMessage("user", text);
        },
        onError: (text) => { if (!stopped) options.onNotice(text); },
      },
    ).then(async (session) => {
      if (stopped) { session.stop(); throw new Error("Rozmowa zakończona."); }
      active = session;
      retry = 0;
      if (reconnecting && history.length) {
        session.sendContext(`Poprzednia część tej rozmowy (po ponownym połączeniu):\n${history.join("\n").slice(-12000)}`);
      }
      await session.setMode(mode);
      return session;
    }).finally(() => { connecting = null; });
    return connecting;
  };

  function scheduleReconnect() {
    if (stopped || reconnectTimer) return;
    if (retry >= 3) {
      options.onNotice("Nie udało się przywrócić połączenia. Spróbuj ponownie.");
      return;
    }
    options.onNotice("Połączenie przerwane. Łączę ponownie; historia pozostaje w oknie. Jeśli brak odpowiedzi, wyślij pytanie ponownie.");
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      retry += 1;
      void connect().catch(() => scheduleReconnect());
    }, 1000 * 2 ** retry);
  }

  return {
    start: () => connect(),
    async send(text: string) {
      const session = await connect();
      session.sendText(text);
      history.push(`Użytkownik: ${text}`);
      options.onMessage("user", text);
    },
    async setMode(next: AniaMode) {
      mode = next;
      if (active) await active.setMode(next);
    },
    stop() {
      stopped = true;
      clearTimeout(reconnectTimer);
      active?.stop();
      active = null;
    },
  };
}