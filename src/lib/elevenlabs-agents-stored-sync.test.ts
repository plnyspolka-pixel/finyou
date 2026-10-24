import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ stored: null as null | { prompt: string; firstMessage: string | null } }));
vi.mock("@/lib/elevenlabs-text-agent.server", () => ({
  fetchAgentPrompt: vi.fn(() => { throw new Error("Fallback must not be used"); }),
  fetchStoredAgentPrompt: vi.fn(async () => state.stored),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
        investor_panel_agent_id: "agent_7601m1kr4vbrefqa34c62e52b2sf",
        intake_agent_id: "agent_7701m1kr4mmrfdja1x5h79w5ktwz",
        agent_id: "agent_7201kshwfj22fcpr0bjpf31282dp",
      } }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
      insert: async () => ({ error: null }),
    }),
  }),
}));

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); state.stored = null; });
describe("stored-only A3 synchronization", () => {
  it("does not PATCH any agent when private investor settings are absent", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("ELEVENLABS_INVESTOR_PANEL_AGENT_ID", "");
    const request = vi.spyOn(globalThis, "fetch");
    const { syncElevenLabsAgentPrompts } = await import("./elevenlabs-agents.server");
    const result = await syncElevenLabsAgentPrompts({ surfaces: ["investor_panel"] });
    expect(result.updated).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(request).not.toHaveBeenCalled();
  });
  it("routes inwestor_prywatny to A3 and never overwrites the separate phone agent", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    state.stored = { prompt: "Explicitly supplied test prompt for A3", firstMessage: "Test greeting" };
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const { syncElevenLabsAgentPrompts } = await import("./elevenlabs-agents.server");
    const { fetchStoredAgentPrompt } = await import("./elevenlabs-text-agent.server");
    const result = await syncElevenLabsAgentPrompts({ surfaces: ["investor_panel"] });
    expect(fetchStoredAgentPrompt).toHaveBeenCalledWith("inwestor_prywatny");
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0]?.[0])).toContain("agent_7601m1kr4vbrefqa34c62e52b2sf");
    expect(result.phoneAgentOutOfSync).toBeNull();
    expect(result.phoneAgentManagedSeparately).toBe("agent_7201kshwfj22fcpr0bjpf31282dp");
    expect(result.updated).toHaveLength(1);
  });
});