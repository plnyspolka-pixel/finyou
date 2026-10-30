import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elevenLabsTextTurn } from "./elevenlabs-text-turn.server";

const GREETING = "Dzień dobry, tu Ania z Finance You. W czym mogę pomóc?";

/** Atrapa sesji agenta: po inicjacji wysyła powitanie, na wiadomość klienta odpowiada. */
class FakeAgentSocket {
  static greeting: string | null = GREETING;
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
  agent(text: string) {
    this.emit("message", {
      data: JSON.stringify({
        type: "agent_response",
        agent_response_event: { agent_response: text },
      }),
    });
  }
  send(raw: string) {
    const msg = JSON.parse(raw);
    if (msg.type === "conversation_initiation_client_data") {
      const override = msg.conversation_config_override?.agent?.first_message;
      const greeting = override !== undefined ? override : FakeAgentSocket.greeting;
      setTimeout(() => {
        if (greeting) setTimeout(() => this.agent(greeting), 1);
        this.emit("message", {
          data: JSON.stringify({ type: "conversation_initiation_metadata" }),
        });
      }, 0);
    }
    if (msg.type === "user_message") setTimeout(() => this.agent(`ODP: ${msg.text}`), 5);
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
  });
  afterEach(() => vi.unstubAllGlobals());

  it("nie odsyła powitania agenta zamiast odpowiedzi na wiadomość klienta", async () => {
    const r = await elevenLabsTextTurn({ agentId: "a", userMessage: "Proszę zadzwonić" });
    expect(r).toEqual({ ok: true, reply: "ODP: Proszę zadzwonić" });
  });

  it("odpowiada także agent bez powitania", async () => {
    FakeAgentSocket.greeting = null;
    const r = await elevenLabsTextTurn({ agentId: "a", userMessage: "Hej" });
    expect(r).toEqual({ ok: true, reply: "ODP: Hej" });
  }, 10_000);

  it("jawne powitanie zlecone przez wywołującego zostaje odpowiedzią (otwarcie A2P)", async () => {
    const r = await elevenLabsTextTurn({
      agentId: "a",
      userMessage: "Hej",
      firstMessage: "Otwarcie",
    });
    expect(r).toEqual({ ok: true, reply: "Otwarcie" });
  });

  it("pusty first_message — od razu odpowiedź", async () => {
    const r = await elevenLabsTextTurn({ agentId: "a", userMessage: "Hej", firstMessage: "" });
    expect(r).toEqual({ ok: true, reply: "ODP: Hej" });
  });
});
