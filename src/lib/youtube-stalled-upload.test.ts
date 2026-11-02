import { describe, expect, it } from "vitest";
import {
  STALLED_YOUTUBE_GIVE_UP_HOURS,
  decideStalledYoutubeUpload,
  videoIdFromUploadResponse,
} from "./youtube-stalled-upload";

const base = { claimTracked: true, sessionUrl: "https://upload/session", stalledHours: 1 };

describe("decideStalledYoutubeUpload", () => {
  it("zakończona sesja z id filmu → opublikowane (bez duplikatu)", () => {
    expect(
      decideStalledYoutubeUpload({ ...base, probe: { status: 200, videoId: "4EB_bO7Zt3I" } }),
    ).toEqual({ action: "published", videoId: "4EB_bO7Zt3I" });
    expect(
      decideStalledYoutubeUpload({ ...base, probe: { status: 201, videoId: "abc" } }).action,
    ).toBe("published");
  });

  it("200 bez id nie jest potwierdzeniem", () => {
    expect(
      decideStalledYoutubeUpload({ ...base, probe: { status: 200, videoId: null } }).action,
    ).toBe("wait");
  });

  it("308 (niepełny plik) i 404/410 (sesja wygasła) → ponowienie", () => {
    for (const status of [308, 404, 410]) {
      expect(decideStalledYoutubeUpload({ ...base, probe: { status, videoId: null } }).action).toBe(
        "requeue",
      );
    }
  });

  it("niejednoznaczna odpowiedź → czekamy, a po limicie godzin → failed", () => {
    for (const probe of [{ status: 500, videoId: null }, { status: 401, videoId: null }, null]) {
      expect(decideStalledYoutubeUpload({ ...base, probe }).action).toBe("wait");
      expect(
        decideStalledYoutubeUpload({ ...base, probe, stalledHours: STALLED_YOUTUBE_GIVE_UP_HOURS })
          .action,
      ).toBe("fail");
    }
  });

  it("brak sesji po śledzonym przejęciu → przebieg padł przed uploadem → ponowienie", () => {
    expect(decideStalledYoutubeUpload({ ...base, sessionUrl: null, probe: null }).action).toBe(
      "requeue",
    );
  });

  it("wpis sprzed śledzenia (bez upload_claimed_at) nigdy nie idzie ponownie sam", () => {
    const d = decideStalledYoutubeUpload({
      ...base,
      claimTracked: false,
      sessionUrl: null,
      probe: null,
    });
    expect(d.action).toBe("fail");
  });
});

describe("videoIdFromUploadResponse", () => {
  it("czyta id z odpowiedzi videos.insert", () => {
    expect(videoIdFromUploadResponse({ id: "xyz", kind: "youtube#video" })).toBe("xyz");
    expect(videoIdFromUploadResponse({})).toBeNull();
    expect(videoIdFromUploadResponse(null)).toBeNull();
    expect(videoIdFromUploadResponse({ id: "  " })).toBeNull();
  });
});
