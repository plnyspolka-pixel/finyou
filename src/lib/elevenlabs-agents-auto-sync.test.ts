import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Auto-synchronizacja promptów siedzi na gorącej ścieżce rozmowy (Messenger,
// telefon), więc musi być niewidoczna: bez klucza API ma nie robić nic i
// przede wszystkim nie rzucać wyjątkiem, bo to by przerwało odpowiedź klientowi.
describe("ensureAgentPromptsFresh", () => {
  const originalKey = process.env.ELEVENLABS_API_KEY;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("bez ELEVENLABS_API_KEY kończy się po cichu i nie woła bazy ani API", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { ensureAgentPromptsFresh } = await import("./elevenlabs-agents.server");

    await expect(ensureAgentPromptsFresh(true)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("drugie wywołanie w oknie dławienia nie startuje kolejnej synchronizacji", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const { ensureAgentPromptsFresh } = await import("./elevenlabs-agents.server");
    await ensureAgentPromptsFresh();
    await expect(ensureAgentPromptsFresh()).resolves.toBeUndefined();
  });
});
