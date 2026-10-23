import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("./voice-conversation", () => ({ startVoiceConversation: mock.start }));
import { createAniaSession } from "./public-ania-session";
import { ANIA_RECEPTION_AGENT_ID } from "./ania-reception";

describe("public Ania session", () => {
  beforeEach(() => { vi.useRealTimers(); mock.start.mockReset(); });
  function setup() {
    let callbacks: any;
    const connection = { stop: vi.fn(), sendText: vi.fn(), sendContext: vi.fn(), setMode: vi.fn().mockResolvedValue(undefined) };
    mock.start.mockImplementation(async (_options, handlers) => {
      callbacks = handlers;
      handlers.onConversationId("conversation-one");
      handlers.onAgentMessage("Dzień dobry");
      return connection;
    });
    const options = { surface: "reception" as const, dynamicVariables: {}, onState: vi.fn(), onNotice: vi.fn(), onMessage: vi.fn(), onConversationId: vi.fn() };
    return { session: createAniaSession(options), connection, options, callbacks: () => callbacks };
  }
  it("sends consecutive questions through one connection, not through the greeting", async () => {
    const t = setup();
    await t.session.send("Czym jest hipoteka?");
    t.callbacks().onAgentMessage("Hipoteka zabezpiecza wierzytelność.");
    await t.session.send("A LTV?");
    t.callbacks().onAgentMessage("LTV to stosunek pożyczki do wartości zabezpieczenia.");
    expect(mock.start).toHaveBeenCalledTimes(1);
    expect(t.connection.sendText.mock.calls).toEqual([["Czym jest hipoteka?"], ["A LTV?"]]);
    expect(t.connection.stop).not.toHaveBeenCalled();
    expect(t.options.onMessage.mock.calls.filter(([role]) => role === "assistant")).toEqual([
      ["assistant", "Dzień dobry"], ["assistant", "Hipoteka zabezpiecza wierzytelność."], ["assistant", "LTV to stosunek pożyczki do wartości zabezpieczenia."],
    ]);
  });
  it("changes voice/text mode without changing the conversation", async () => {
    const t = setup(); await t.session.start();
    await t.session.setMode("voice"); await t.session.setMode("text");
    expect(mock.start).toHaveBeenCalledTimes(1);
    expect(t.connection.setMode.mock.calls).toEqual([["text"], ["voice"], ["text"]]);
    t.session.stop(); expect(t.connection.stop).toHaveBeenCalledTimes(1);
  });
  it("reconnects visibly, suppresses repeat greetings and restores context without resending a question", async () => {
    vi.useFakeTimers(); const t = setup();
    await t.session.send("Hipoteka?"); t.callbacks().onState("ended");
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.start).toHaveBeenCalledTimes(2);
    expect(t.options.onNotice).toHaveBeenCalled();
    expect(t.connection.sendContext).toHaveBeenCalledWith(expect.stringContaining("Hipoteka?"));
    expect(t.connection.sendText).toHaveBeenCalledTimes(1);
    expect(t.options.onMessage.mock.calls.filter(([role]) => role === "assistant")).toHaveLength(1);
    t.session.stop();
  });
  it("starts reception A0 without a page-to-agent mapping", async () => {
    const t = setup(); await t.session.start();
    expect(ANIA_RECEPTION_AGENT_ID).toBe("agent_8901m4n7kbq2f0ba2bvb096nwwqq");
    expect(mock.start).toHaveBeenCalledWith(expect.objectContaining({ surface: "reception" }), expect.any(Object));
  });
  it("shows the first real answer when reception has no greeting", async () => {
    const t = setup();
    mock.start.mockImplementation(async () => t.connection);
    await t.session.send("chcę zainwestować");
    // Capture a connection which does not emit a greeting during setup.
    t.session.stop();
    let handlers: any;
    mock.start.mockImplementation(async (_options, callbacks) => { handlers = callbacks; return t.connection; });
    const session = createAniaSession(t.options);
    await session.send("chcę zainwestować");
    handlers.onAgentMessage("Jak dziś lokujesz wolne środki?");
    expect(t.options.onMessage).toHaveBeenLastCalledWith("assistant", "Jak dziś lokujesz wolne środki?");
    session.stop();
  });
  it.each(["voice", "text"] as const)("accepts transferred-agent answers in the same %s session", async (mode) => {
    const t = setup(); await t.session.start(); await t.session.setMode(mode);
    t.callbacks().onAgentMessage("Przekazuję rozmowę opiekunowi inwestora.");
    t.callbacks().onAgentMessage("Jakie projekty Cię interesują?");
    expect(mock.start).toHaveBeenCalledTimes(1);
    expect(t.connection.stop).not.toHaveBeenCalled();
    expect(t.options.onConversationId.mock.calls).toEqual([["conversation-one"]]);
    expect(t.options.onMessage).toHaveBeenLastCalledWith("assistant", "Jakie projekty Cię interesują?");
  });
});