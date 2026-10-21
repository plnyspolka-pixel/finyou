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

describe("resolveFinisherForRender — zejście na Remotion", () => {
  const remotionEnv = () => {
    vi.stubEnv("REMOTION_AWS_ACCESS_KEY_ID", "k");
    vi.stubEnv("REMOTION_AWS_SECRET_ACCESS_KEY", "s");
    vi.stubEnv("REMOTION_FUNCTION_NAME", "remotion-render-x");
    vi.stubEnv("REMOTION_SERVE_URL", "https://serve.test/sites/finyou/index.html");
  };
  const burnerTimesOut = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("The operation was aborted");
      }),
    );

  it("caption-burner nie odpowiada, Remotion skonfigurowany → render rusza na Remotion", async () => {
    configure();
    remotionEnv();
    vi.stubEnv("STUDIO_RENDER_ENGINE", "caption_burner");
    burnerTimesOut();
    const { resolveFinisherForRender } = await import("./caption-burner.server");
    const g = await resolveFinisherForRender({ captions: true, engine: "auto" });
    expect(g.ok).toBe(true);
    if (g.ok) {
      expect(g.engine).toBe("remotion");
      expect(g.fallback?.reason).toContain("caption-burner nie odpowiada");
    }
  });

  it("bez Remotion — kolejka czeka jak dotąd", async () => {
    configure();
    vi.stubEnv("STUDIO_RENDER_ENGINE", "caption_burner");
    vi.stubEnv("REMOTION_FUNCTION_NAME", "");
    burnerTimesOut();
    const { resolveFinisherForRender } = await import("./caption-burner.server");
    const g = await resolveFinisherForRender({ captions: true, engine: "caption_burner" });
    expect(g.ok).toBe(false);
  });

  it("caption-burner działa — bez zmiany silnika", async () => {
    configure();
    remotionEnv();
    vi.stubEnv("STUDIO_RENDER_ENGINE", "caption_burner");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    const { resolveFinisherForRender } = await import("./caption-burner.server");
    const g = await resolveFinisherForRender({ captions: true, engine: "auto" });
    expect(g).toEqual({ ok: true, engine: "auto", fallback: null });
  });

  it("auto bez STUDIO_RENDER_ENGINE i ze skonfigurowanym Remotion → Remotion (hook wizualny)", async () => {
    remotionEnv();
    vi.stubEnv("STUDIO_RENDER_ENGINE", "");
    const { resolveRenderEngine } = await import("./studio-render-engine");
    expect(resolveRenderEngine("auto")).toBe("remotion");
    expect(resolveRenderEngine("caption_burner")).toBe("caption_burner");
  });
});
