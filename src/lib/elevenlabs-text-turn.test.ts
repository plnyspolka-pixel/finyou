import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elevenLabsTextTurn } from "./elevenlabs-text-turn.server";

const GREETING = "Dzień dobry, tu Ania z Finance You. W czym mogę pomóc?";

type Script = (socket: FakeAgentSocket, userText: string) => void;

/**
 * Atrapa sesji agenta wg protokołu ElevenLabs: metadane, powitanie (gdy
 * agent je ma), potem odpowiedź na wiadomość klienta wg `script`.
 */
class FakeAgentSocket {
  static greeting: string | null = GREETING;
  static script: Script = (s, text) => s.later(() => s.agent(`ODP: ${text}`));
  /** Sesja zrywana zaraz po powitaniu (np. brak wymaganej zmiennej). */
  static closeAfterGreeting: { code: number; reason: string } | null = null;
  static lastInit: any = null;
  listeners: Record<string, Array<(e: any) => void>> = {};
  constructor() {
    setTimeout(() => this.emit("open", {}), 0);
  }
  addEventListener(type: string, fn: (e: any) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  emit(type: string, e: any) {
    for (const fn of this.listeners[type] ?? []) fn(e);
  }
  later(fn: () => void, ms = 5) {
    setTimeout(fn, ms);
  }
  raw(obj: unknown) {
    this.emit("message", { data: JSON.stringify(obj) });
  }
  agent(text: string) {
    this.raw({ type: "agent_response", agent_response_event: { agent_response: text } });
  }
  tool(name: string) {
    this.raw({
      type: "agent_tool_response",
      agent_tool_response_event: { tool_name: name, is_error: false },
    });
  }
  send(raw: string) {
    const msg = JSON.parse(raw);
    if (msg.type === "conversation_initiation_client_data") {
      FakeAgentSocket.lastInit = msg;
      const override = msg.conversation_config_override?.agent?.first_message;
      const greeting = override !== undefined ? override : FakeAgentSocket.greeting;
      setTimeout(() => {
        if (greeting) this.later(() => this.agent(greeting), 1);
        this.raw({
          type: "conversation_initiation_metadata",
          conversation_initiation_metadata_event: { conversation_id: "conv_test" },
        });
        const close = FakeAgentSocket.closeAfterGreeting;
        if (close) this.later(() => this.emit("close", close), 3);
      }, 0);
    }
    if (msg.type === "user_message") FakeAgentSocket.script(this, msg.text);
  }
  close() {}
}

describe("elevenLabsTextTurn", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test";
    vi.stubGlobal("WebSocket", FakeAgentSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    FakeAgentSocket.greeting = GREETING;
    FakeAgentSocket.script = (s, text) => s.later(() => s.agent(`ODP: ${text}`));
    FakeAgentSocket.closeAfterGreeting = null;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("nie odsyła powitania agenta zamiast odpowiedzi na wiadomość klienta", async () => {
    const r = await elevenLabsTextTurn({ agentId: "a", userMessage: "Proszę zadzwonić" });
    expect(r).toMatchObject({
      ok: true,
      reply: "ODP: Proszę zadzwonić",
      conversationId: "conv_test",
    });
  }, 40_000);

  it("odpowiada także agent bez powitania", async () => {
    FakeAgentSocket.greeting = null;
    const r = await elevenLabsTextTurn({ agentId: "a", userMessage: "Hej" });
    expect(r).toMatchObject({ ok: true, reply: "ODP: Hej" });
  }, 40_000);

  it("jawne powitanie zlecone przez wywołującego zostaje odpowiedzią (otwarcie A2P)", async () => {
    const r = await elevenLabsTextTurn({
      agentId: "a",
      userMessage: "Hej",
      firstMessage: "Otwarcie",
    });
    expect(r).toMatchObject({ ok: true, reply: "Otwarcie" });
  }, 40_000);

  it("pusty first_message — od razu odpowiedź", async () => {
    const r = await elevenLabsTextTurn({ agentId: "a", userMessage: "Hej", firstMessage: "" });
    expect(r).toMatchObject({ ok: true, reply: "ODP: Hej" });
  }, 40_000);

  it("zbiera całą odpowiedź: zdanie przed narzędziem i resztę po jego wyniku", async () => {
    FakeAgentSocket.script = (s) => {
      // Jak na produkcji 30.10: zdanie, narzędzie, wynik narzędzia po ~9 s.
      s.later(() => s.agent("Chętnie opowiem o modelu, który oferujemy."), 5);
      s.later(() => s.tool("fy2_identify_caller__inwestor_presale"), 9_000);
      s.later(
        () => s.agent("Inwestor pożycza pod hipotekę, a umowę podpisuje u notariusza."),
        10_500,
      );
    };
    const r = await elevenLabsTextTurn({ agentId: "a", userMessage: "Jak to działa?" });
    expect(r.ok).toBe(true);
    expect(r.reply).toBe(
      "Chętnie opowiem o modelu, który oferujemy.\nInwestor pożycza pod hipotekę, a umowę podpisuje u notariusza.",
    );
    expect(r.toolCalls).toEqual([
      { name: "fy2_identify_caller__inwestor_presale", isError: false },
    ]);
  }, 40_000);

  it("zerwanie sesji przez ElevenLabs zwraca powód, a nie powitanie", async () => {
    FakeAgentSocket.closeAfterGreeting = {
      code: 1008,
      reason: "Missing required dynamic variables in tools: {'thread_key'}",
    };
    FakeAgentSocket.script = () => {};
    const r = await elevenLabsTextTurn({ agentId: "a", userMessage: "Proszę zadzwonić" });
    expect(r.ok).toBe(false);
    expect(r.reply).toBeUndefined();
    expect(r.error).toContain("1008");
    expect(r.error).toContain("thread_key");
  }, 40_000);

  it("zawsze wysyła thread_key wymagany przez narzędzia agentów", async () => {
    await elevenLabsTextTurn({
      agentId: "a",
      userMessage: "Hej",
      dynamicVariables: { channel: "messenger" },
    });
    expect(FakeAgentSocket.lastInit.dynamic_variables.thread_key).toMatch(/^text:/);
    expect(FakeAgentSocket.lastInit.dynamic_variables.channel).toBe("messenger");
    await elevenLabsTextTurn({
      agentId: "a",
      userMessage: "Hej",
      dynamicVariables: { thread_key: "messenger:1" },
    });
    expect(FakeAgentSocket.lastInit.dynamic_variables.thread_key).toBe("messenger:1");
  }, 60_000);
});
