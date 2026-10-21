// Zasoby hooka: kolejność źródeł i zejście bez planu Pro ElevenLabs (402).
import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { advanceHookAssets, hookForFinish, startHookAssets } from "./studio-hook.server";
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

describe("zasoby hooka", () => {
  it("bez planu Pro: Flows wideo i obraz → 402, hook z grafiki Studia + efekt dźwiękowy", async () => {
    flows.startFlowsVideo.mockRejectedValue(PRO);
    flows.startFlowsImage.mockRejectedValue(PRO);
    const a = await startHookAssets(HOOK, "test");
    expect(a).toMatchObject({
      status: "ready",
      kind: "image",
      url: "https://storage/hook.png",
      source_used: "studio_image",
      sfx_url: "https://storage/sfx.mp3",
      pro_plan_required: true,
    });
    expect(a.notes.join(" ")).toMatch(/planu Pro/);
    // Obraz Studia dostaje zakaz tekstu w kadrze.
    expect(String((studioImage.mock.calls[0] as unknown[])[0])).toMatch(/no text, letters/i);
  });

  it("Flows wideo przyjęte → pending; gotowe przy wykończeniu → kopia w Storage", async () => {
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

  it("wykończenie: brak hooka → plan z motywu zapasowego, zapis przy zadaniu i wpis o planie Pro", async () => {
    flows.startFlowsVideo.mockRejectedValue(PRO);
    flows.startFlowsImage.mockRejectedValue(PRO);
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
    expect((row.hook as StudioHook).assets?.status).toBe("ready");
    expect(row.hook_variant).toBe("A");
    expect(logAutopilot).toHaveBeenCalledTimes(1);
  });
});
