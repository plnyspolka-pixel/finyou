// Zasoby hooka: kolejność źródeł i zejście bez planu Pro ElevenLabs (402).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeDb } from "./test-support/fake-supabase";

let db: FakeDb;
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return db;
  },
}));

const PRO = new Error("ElevenLabs HTTP 402: This endpoint requires a Pro plan or above.");
const flows = {
  startFlowsVideo: vi.fn(),
  startFlowsImage: vi.fn(),
  getFlowsGeneration: vi.fn(),
  storeFlowsResult: vi.fn(async () => ({
    url: "https://storage/hook.mp4",
    contentType: "video/mp4",
  })),
};
vi.mock("./elevenlabs-flows.server", () => flows);
const studioImage = vi.fn(async () => ({ id: "i1", image_url: "https://storage/hook.png" }));
vi.mock("./studio-ai.server", () => ({
  generateStudioImage: (...a: unknown[]) => studioImage(...(a as [])),
  generateHookIdeas: vi.fn(async () => {
    throw new Error("brak AI w teście");
  }),
}));
const sfx = vi.fn(async () => ({ bytes: new ArrayBuffer(8), contentType: "audio/mpeg" }));
vi.mock("./elevenlabs-api.server", () => ({
  generateSoundEffect: (...a: unknown[]) => sfx(...(a as [])),
  composeMusic: vi.fn(),
}));
vi.mock("./media-storage.server", () => ({
  storeMedia: vi.fn(async () => ({ url: "https://storage/sfx.mp3" })),
}));
const logAutopilot = vi.fn(async () => {});
vi.mock("./autopilot/state.server", () => ({
  logAutopilot: (...a: unknown[]) => logAutopilot(...(a as [])),
}));

import {
  advanceHookAssets,
  hookForFinish,
  hookSourceChain,
  startHookAssets,
} from "./studio-hook.server";
import type { StudioHook } from "./studio-hook";

const HOOK: StudioHook = {
  visual_prompt: "A heavy steel vault door slams shut",
  text: "BANK MÓWI NIE?",
  highlight: "NIE?",
  sfx_prompt: "vault door slam",
  source: "auto",
};

beforeEach(() => {
  db = createFakeSupabase({ ai_growth_action_log: [] });
  for (const f of Object.values(flows)) (f as ReturnType<typeof vi.fn>).mockClear();
  studioImage.mockClear();
  logAutopilot.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

const flowsOn = () => vi.stubEnv("STUDIO_HOOK_FLOWS", "1");

describe("źródła hooka (decyzja właściciela 21.10: bez grafiki ElevenLabs)", () => {
  it("domyślnie bez ElevenLabs Flows: bank klipów → grafika Studia → bank przebitek", () => {
    expect(hookSourceChain("auto")).toEqual(["clip_bank", "studio_image", "broll"]);
    expect(hookSourceChain("flows_video")).toEqual(["studio_image", "broll"]);
    expect(hookSourceChain("auto", true)).toContain("flows_video");
  });

  it("domyślnie: obraz z naszego generatora + efekt dźwiękowy, Flows nie jest wołane", async () => {
    const a = await startHookAssets(HOOK, "test");
    expect(a).toMatchObject({
      status: "ready",
      kind: "image",
      url: "https://storage/hook.png",
      source_used: "studio_image",
      sfx_url: "https://storage/sfx.mp3",
    });
    expect(flows.startFlowsVideo).not.toHaveBeenCalled();
    expect(flows.startFlowsImage).not.toHaveBeenCalled();
    expect(a.pro_plan_required).toBeFalsy();
    // Obraz Studia dostaje zakaz tekstu w kadrze.
    expect(String((studioImage.mock.calls[0] as unknown[])[0])).toMatch(/no text, letters/i);
  });
});

describe("bank klipów hooka (clip_bank)", () => {
  const row = (over: Record<string, unknown>) => ({
    slug: "x",
    track: "both",
    rating: 3,
    media_url: "https://storage/clip.mp4",
    duration_s: 5.04,
    active: true,
    use_count: 0,
    last_used_at: null,
    ...over,
  });

  it("klip toru rolki: gotowy film z banku, długość i id w zasobach, użycie odnotowane", async () => {
    db.tables.studio_hook_clips = [
      row({ id: "c-poz", slug: "poz", track: "pozyczkobiorca", rating: 4 }),
      row({
        id: "c-inw",
        slug: "inw",
        track: "inwestor",
        rating: 4,
        media_url: "https://storage/inw.mp4",
      }),
      row({ id: "c-off", slug: "off", track: "inwestor", rating: 4, active: false }),
    ];
    const a = await startHookAssets(HOOK, "test", "inwestor");
    expect(a).toMatchObject({
      status: "ready",
      kind: "video",
      url: "https://storage/inw.mp4",
      source_used: "clip_bank",
      clip_id: "c-inw",
      clip_duration: 5.04,
      sfx_url: "https://storage/sfx.mp3",
    });
    expect(studioImage).not.toHaveBeenCalled();
    const used = db.tables.studio_hook_clips.find((r) => r.id === "c-inw")!;
    expect(used.use_count).toBe(1);
    expect(used.last_used_at).toBeTruthy();
  });

  it("brak klipu dla toru → grafika Studia (z notatką)", async () => {
    db.tables.studio_hook_clips = [row({ id: "c-poz", track: "pozyczkobiorca" })];
    const a = await startHookAssets(HOOK, "test", "inwestor");
    expect(a).toMatchObject({ status: "ready", source_used: "studio_image", clip_id: null });
    expect(a.notes.join(" ")).toMatch(/clip_bank/);
  });

  it("przy wykończeniu tor bierze się z zadania", async () => {
    db.tables.studio_hook_clips = [
      row({ id: "c-inw", track: "inwestor" }),
      row({ id: "c-poz", track: "pozyczkobiorca", media_url: "https://storage/poz.mp4" }),
    ];
    db.tables.studio_video_jobs = [
      {
        id: "job-2",
        prompt: "Bank odmówił",
        script: "Bank powiedział nie? Twoja nieruchomość może powiedzieć tak.",
        hook: null,
        hook_variant: null,
        track: "pozyczkobiorca",
        material_audience: "klient",
        publish_title: "",
      },
    ];
    const r = await hookForFinish("job-2");
    expect(r.hook?.assets).toMatchObject({
      source_used: "clip_bank",
      url: "https://storage/poz.mp4",
      clip_id: "c-poz",
    });
  });
});

describe("zasoby hooka przy włączonej fladze STUDIO_HOOK_FLOWS", () => {
  it("402 bez planu Pro: zejście na grafikę Studia (bez wpisu do raportu)", async () => {
    flowsOn();
    flows.startFlowsVideo.mockRejectedValue(PRO);
    flows.startFlowsImage.mockRejectedValue(PRO);
    const a = await startHookAssets(HOOK, "test");
    expect(a).toMatchObject({ status: "ready", source_used: "studio_image" });
    expect(a.notes.join(" ")).toMatch(/planu Pro/);
    expect(logAutopilot).not.toHaveBeenCalled();
  });

  it("Flows wideo przyjęte → pending; gotowe przy wykończeniu → kopia w Storage", async () => {
    flowsOn();
    flows.startFlowsVideo.mockResolvedValue({ id: "g1", status: "pending" });
    const started = await startHookAssets(HOOK, "test");
    expect(started).toMatchObject({ status: "pending", video_generation_id: "g1" });

    flows.getFlowsGeneration.mockResolvedValue({ id: "g1", status: "generating" });
    const waiting = await advanceHookAssets({ ...HOOK, assets: started }, "test");
    expect(waiting.waiting).toBe(true);

    flows.getFlowsGeneration.mockResolvedValue({
      id: "g1",
      status: "completed",
      contentUrl: "https://flows/tmp.mp4",
      mimeType: "video/mp4",
    });
    const done = await advanceHookAssets({ ...HOOK, assets: started }, "test");
    expect(done).toMatchObject({
      waiting: false,
      assets: {
        status: "ready",
        kind: "video",
        url: "https://storage/hook.mp4",
        source_used: "flows_video",
      },
    });
  });

  it("klip Flows nieudany → zejście na obraz (bez czekania)", async () => {
    flowsOn();
    flows.getFlowsGeneration.mockResolvedValue({
      id: "g1",
      status: "failed",
      failure: "moderated",
    });
    flows.startFlowsImage.mockRejectedValue(PRO);
    const out = await advanceHookAssets(
      {
        ...HOOK,
        assets: {
          status: "pending",
          kind: null,
          url: null,
          source_used: null,
          sfx_url: "https://storage/sfx.mp3",
          music_url: null,
          video_generation_id: "g1",
          started_at: new Date().toISOString(),
          notes: [],
        },
      },
      "test",
    );
    expect(out.waiting).toBe(false);
    expect(out.assets).toMatchObject({ status: "ready", source_used: "studio_image" });
  });
});

describe("hook przy wykończeniu", () => {
  it("brak hooka → plan z motywu zapasowego, zasoby z naszego generatora, zapis przy zadaniu", async () => {
    db.tables.studio_video_jobs = [
      {
        id: "job-1",
        prompt: "Bank odmówił",
        script: "Bank powiedział nie? Twoja nieruchomość może powiedzieć tak.",
        hook: null,
        hook_variant: null,
        track: "pozyczkobiorca",
        material_audience: "klient",
        publish_title: "",
      },
    ];
    const r = await hookForFinish("job-1");
    expect(r.waiting).toBe(false);
    expect(r.hook?.text).toBe("BANK MÓWI NIE?");
    const row = db.tables.studio_video_jobs[0];
    expect((row.hook as StudioHook).assets).toMatchObject({
      status: "ready",
      source_used: "studio_image",
    });
    expect(row.hook_variant).toBe("A");
    expect(flows.startFlowsVideo).not.toHaveBeenCalled();
    expect(logAutopilot).not.toHaveBeenCalled();
  });
});
