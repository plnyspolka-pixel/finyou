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
const matchClip = vi.fn(async (_i: unknown): Promise<Record<string, unknown>> => {
  throw new Error("brak AI w teście");
});
vi.mock("./studio-ai.server", () => ({
  generateStudioImage: (...a: unknown[]) => studioImage(...(a as [])),
  matchHookClipConcept: (i: unknown) => matchClip(i),
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
  matchClip.mockClear();
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

describe("bank klipów hooka (clip_bank) — dobór do treści", () => {
  const row = (over: Record<string, unknown>) => ({
    slug: "x",
    track: "both",
    rating: 3,
    media_url: "https://storage/clip.mp4",
    duration_s: 5.04,
    active: true,
    use_count: 0,
    last_used_at: null,
    tags: [],
    description: "",
    ...over,
  });
  const BANK = () => [
    row({
      id: "stamp-k",
      slug: "h02_stamp_kling",
      concept: "h02_stamp",
      track: "pozyczkobiorca",
      rating: 4,
      media_url: "https://storage/stamp.mp4",
      description: "Odmowa banku, odrzucony wniosek kredytowy, bank powiedział nie.",
      tags: ["odmowa banku", "bank powiedział nie", "odrzucony wniosek"],
    }),
    row({
      id: "stamp-f",
      slug: "h02_stamp_flux",
      concept: "h02_stamp",
      track: "pozyczkobiorca",
      rating: 3,
      description: "Odmowa banku, odrzucony wniosek kredytowy, bank powiedział nie.",
      tags: ["odmowa banku", "bank powiedział nie", "odrzucony wniosek"],
    }),
    row({
      id: "jar",
      slug: "h24_jar_kling",
      concept: "h24_jar",
      track: "inwestor",
      rating: 4,
      media_url: "https://storage/jar.mp4",
      description: "Pieniądze nudzą się na koncie, kurzą się na lokacie, nie pracują.",
      tags: ["pieniądze nudzą się", "pieniądze na koncie", "lokata"],
    }),
  ];
  const CTX = {
    track: "pozyczkobiorca" as const,
    script: "Bank powiedział nie? Twoja nieruchomość może powiedzieć tak.",
    topic: "Odmowa kredytu",
  };

  it("AI wskazuje koncept: najlepszy klip konceptu, powód w zasobach, użycie odnotowane", async () => {
    db.tables.studio_hook_clips = BANK();
    matchClip.mockResolvedValueOnce({ concept: "h02_stamp", score: 88, reason: "odmowa banku" });
    const a = await startHookAssets(HOOK, "test", CTX);
    expect(a).toMatchObject({
      status: "ready",
      kind: "video",
      url: "https://storage/stamp.mp4",
      source_used: "clip_bank",
      clip_id: "stamp-k",
      clip_concept: "h02_stamp",
      clip_duration: 5.04,
      sfx_url: "https://storage/sfx.mp3",
    });
    expect(a.clip_match_reason).toMatch(/AI 88\/100: odmowa banku/);
    expect(studioImage).not.toHaveBeenCalled();
    // AI dostało tekst hooka, scenariusz i listę konceptów tylko z toru rolki.
    const arg = matchClip.mock.calls[0][0] as Record<string, string>;
    expect(arg.hookText).toBe("BANK MÓWI NIE?");
    expect(arg.script).toMatch(/Bank powiedział nie/);
    expect(arg.conceptList).toMatch(/h02_stamp/);
    expect(arg.conceptList).not.toMatch(/h24_jar/);
    expect(db.tables.studio_hook_clips.find((r) => r.id === "stamp-k")!.use_count).toBe(1);
  });

  it("AI: słabe dopasowanie → brak klipu, grafika Studia (bez losowania)", async () => {
    db.tables.studio_hook_clips = BANK();
    matchClip.mockResolvedValueOnce({ concept: "h02_stamp", score: 30, reason: "luźno" });
    const a = await startHookAssets(HOOK, "test", CTX);
    expect(a).toMatchObject({ source_used: "studio_image", clip_id: null });
    expect(a.notes.join(" ")).toMatch(/żaden klip nie pasuje/);
  });

  it("bez AI: słowa kluczowe z treści", async () => {
    db.tables.studio_hook_clips = BANK();
    const a = await startHookAssets(HOOK, "test", CTX);
    expect(a).toMatchObject({ source_used: "clip_bank", clip_concept: "h02_stamp" });
    expect(a.clip_match_reason).toMatch(/słowa kluczowe/);
  });

  it("przypięty `clip_slug` pomija dopasowanie i wygrywa z `source`", async () => {
    db.tables.studio_hook_clips = BANK();
    const a = await startHookAssets(
      { ...HOOK, source: "studio_image", clip_slug: "h02_stamp_flux" },
      "test",
      { track: "inwestor" },
    );
    expect(a).toMatchObject({ source_used: "clip_bank", clip_id: "stamp-f" });
    expect(a.clip_match_reason).toMatch(/przypięty/);
    expect(matchClip).not.toHaveBeenCalled();
    expect(hookSourceChain("studio_image", false, true)).toEqual([
      "clip_bank",
      "studio_image",
      "broll",
    ]);
  });

  it("przy wykończeniu tor i scenariusz biorą się z zadania", async () => {
    db.tables.studio_hook_clips = BANK();
    db.tables.studio_video_jobs = [
      {
        id: "job-2",
        prompt: "Lokata",
        script: "Pieniądze nudzą Ci się na koncie? Mogą pracować na hipotece.",
        hook: null,
        hook_variant: null,
        track: "inwestor",
        material_audience: "inwestor",
        publish_title: "",
      },
    ];
    const r = await hookForFinish("job-2");
    expect(r.hook?.assets).toMatchObject({
      source_used: "clip_bank",
      url: "https://storage/jar.mp4",
      clip_concept: "h24_jar",
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
