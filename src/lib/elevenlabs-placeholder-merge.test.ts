import { afterEach, describe, expect, it, vi } from "vitest";
import { patchAgent } from "./elevenlabs-api.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("provider placeholder update", () => {
  it("GETs current placeholders and preserves them in PATCH", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-only");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ conversation_config: { agent: { dynamic_variables: { dynamic_variable_placeholders: { imie_klienta: "Jan", missing_kw: "yes", forma: "Pan" } } } } }))
      .mockResolvedValueOnce(Response.json({ agent_id: "test-agent" }));
    vi.stubGlobal("fetch", fetchMock);
    await patchAgent("test-agent", { prompt: "test", dynamic_variable_placeholders: { forma: "" } });
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    const p = body.conversation_config.agent.dynamic_variables.dynamic_variable_placeholders;
    expect(p.imie_klienta).toBe("Jan");
    expect(p.missing_kw).toBe("yes");
    expect(p.forma).toBe("Pan");
    expect(p.investor_access_token).toBe("");
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });
  it("never PATCHes after a failed GET", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-only");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ detail: "unavailable" }, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(patchAgent("test-agent", { prompt: "test", dynamic_variable_placeholders: {} })).rejects.toThrow("503");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});