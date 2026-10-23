// Regresja: zadanie 229f054d — projekt z `set_studio_motion` zapisany tuż po
// utworzeniu zadania, a pierwsze wykończenie Remotion wyszło z projektem AI.
// Przyczyny: (1) wykończenie czytało `motion_design` z obiektu joba, który
// bywa starszy niż zapis robota, a AI zapisywało swój projekt bezwarunkowo;
// (2) `retryStudioJob` (ponowny render) czyścił `motion_design`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeDb } from "./test-support/fake-supabase";

let db: FakeDb;
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return db;
  },
}));

const designMotion = vi.fn();
vi.mock("./motion-designer.server", () => ({
  designMotion: (...a: unknown[]) => designMotion(...a),
  isMotionDesignerConfigured: () => true,
}));
vi.mock("./claude-json.server", () => ({ logClaudeCall: vi.fn(async () => {}) }));
vi.mock("./media-storage.server", () => ({
  fetchBytes: vi.fn(async () => ({
    bytes: new TextEncoder().encode("1\n00:00:00,000 --> 00:00:02,000\nBank powiedział nie?\n")
      .buffer,
    contentType: "text/plain",
  })),
}));

import {
  designAndSaveMotion,
  designMotionForJob,
  retryStudioJob,
  type StudioJobRow,
} from "./studio-video-queue.server";

const ROBOT = [
  {
    component: "keyword",
    zone: "center",
    sync: "Bank powiedział nie?",
    endSync: null,
    itemSync: null,
    props: { text: "Bank powiedział NIE", highlight: "NIE" },
  },
];
const AI = [
  {
    component: "alert",
    zone: "top",
    sync: "Bank powiedział nie?",
    endSync: null,
    itemSync: null,
    props: { title: "Uwaga", text: "Policz koszt." },
  },
];

function job(over: Partial<StudioJobRow> = {}): StudioJobRow {
  return {
    id: "229f054d-d82c-47a1-86d7-09861dfea9fc",
    prompt: "Bank powiedział nie",
    script: "Bank powiedział nie? Twoja nieruchomość może powiedzieć tak.",
    avatar_id: "a",
    voice_id: "v",
    heygen_video_id: "h",
    status: "rendering",
    video_url: null,
    video_url_clean: "https://x/clean.mp4",
    thumbnail_url: null,
    subtitle_url: "https://x/s.srt",
    captions: true,
    caption_wait_since: null,
    caption_style: "tiktok",
    caption_burn_id: null,
    caption_burn_started_at: null,
    caption_burn_attempts: 0,
    dynamic_scenes: true,
    reel_structure: true,
    avatar_ids: [],
    auto_publish_platforms: [],
    publish_privacy: "public",
    tiktok_post_options: null,
    publish_title: "",
    publish_description: "",
    auto_published_at: null,
    last_error: null,
    created_by: null,
    motion_design: null,
    ...over,
  };
}

beforeEach(() => {
  designMotion.mockReset();
  designMotion.mockResolvedValue(AI);
});

describe("projekt elementów dynamicznych przy wykończeniu", () => {
  it("bierze projekt robota zapisany w bazie, choć obiekt joba go nie ma (stary odczyt)", async () => {
    db = createFakeSupabase({ studio_video_jobs: [{ ...job(), motion_design: ROBOT }] });
    const stale = job({ motion_design: null });
    const out = await designMotionForJob(stale, "temat");
    expect(designMotion).not.toHaveBeenCalled();
    expect(out?.[0]?.component).toBe("keyword");
    expect(db.tables.studio_video_jobs[0].motion_design).toEqual(ROBOT);
  });

  it("projekt AI nie nadpisuje projektu zapisanego w trakcie projektowania", async () => {
    db = createFakeSupabase({ studio_video_jobs: [{ ...job(), motion_design: null }] });
    designMotion.mockImplementation(async () => {
      // set_studio_motion w czasie, gdy model myśli
      db.tables.studio_video_jobs[0].motion_design = ROBOT;
      return AI;
    });
    const out = await designAndSaveMotion(job(), "temat", { onlyIfUnset: true });
    expect(out[0].component).toBe("keyword");
    expect(db.tables.studio_video_jobs[0].motion_design).toEqual(ROBOT);
  });

  it("bez projektu w bazie — projektuje AI i zapisuje", async () => {
    db = createFakeSupabase({ studio_video_jobs: [{ ...job(), motion_design: null }] });
    const out = await designMotionForJob(job(), "temat");
    expect(designMotion).toHaveBeenCalledTimes(1);
    expect(out?.[0]?.component).toBe("alert");
    expect(db.tables.studio_video_jobs[0].motion_design).toEqual(AI);
  });

  it("ponowny render (retry) zachowuje zapisany projekt", async () => {
    db = createFakeSupabase({
      studio_video_jobs: [{ ...job({ status: "failed", captions: false }), motion_design: ROBOT }],
    });
    vi.doMock("./remotion-render.server", () => ({
      isRemotionConfigured: () => true,
      isAiBadgeEnabled: () => true,
      isDynamicOverlaysEnabled: () => true,
    }));
    const r = await retryStudioJob(job({ status: "failed", captions: false }));
    expect(r.mode).toBe("rerender");
    const row = db.tables.studio_video_jobs[0];
    expect(row.status).toBe("queued");
    expect(row.motion_design).toEqual(ROBOT);
    expect(db.updates.some(([, p]) => "motion_design" in p)).toBe(false);
  });
});
