import { afterEach, describe, expect, it, vi } from "vitest";
import { captionBurnerPreflight } from "./caption-burner.server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const configure = () => {
  vi.stubEnv("CAPTION_BURNER_URL", "https://burner.test/");
  vi.stubEnv("CAPTION_BURNER_SECRET", "s");
};

describe("captionBurnerPreflight", () => {
  it("usługa odpowiada — render może ruszyć", async () => {
    configure();
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(captionBurnerPreflight({ captions: true })).resolves.toEqual({ ok: true });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("https://burner.test/health");
  });

  it("brak odpowiedzi — blokuje render z powodem", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("The operation was aborted");
      }),
    );
    const r = await captionBurnerPreflight({ captions: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("przekroczony czas odpowiedzi");
  });

  it("błąd HTTP — blokuje render", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad gateway", { status: 502 })),
    );
    const r = await captionBurnerPreflight({ captions: false });
    expect(r.ok).toBe(false);
  });

  it("nieskonfigurowana: rolka z napisami zablokowana, bez napisów przechodzi", async () => {
    vi.stubEnv("CAPTION_BURNER_URL", "");
    vi.stubEnv("CAPTION_BURNER_SECRET", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await captionBurnerPreflight({ captions: true })).ok).toBe(false);
    expect((await captionBurnerPreflight({ captions: false })).ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bez napisów, znaczka i nakładek — nie pyta usługi", async () => {
    configure();
    vi.stubEnv("STUDIO_AI_BADGE", "0");
    vi.stubEnv("STUDIO_DYNAMIC_OVERLAYS", "0");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await captionBurnerPreflight({ captions: false })).ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
