// Zawieszone publikacje rolek Meta — decyzja po sprawdzeniu stanu w Mecie.
import { describe, expect, it } from "vitest";
import {
  STALLED_REEL_CLAIM_MIN,
  classifyFacebookReelStatus,
  decideStalledReel,
} from "./meta-stalled-reel";

describe("stan wideo FB Reels z Graph API", () => {
  it("opublikowane tylko przy jednoznacznym potwierdzeniu", () => {
    expect(
      classifyFacebookReelStatus({
        status: {
          video_status: "ready",
          uploading_phase: { status: "complete" },
          processing_phase: { status: "complete" },
          publishing_phase: { status: "complete", publish_status: "published" },
        },
      }),
    ).toBe("published");
    expect(
      classifyFacebookReelStatus({ status: { publishing_phase: { publish_status: "published" } } }),
    ).toBe("published");
  });

  it("dowolna faza w toku = czekamy", () => {
    expect(
      classifyFacebookReelStatus({
        status: {
          uploading_phase: { status: "complete" },
          processing_phase: { status: "in_progress" },
          publishing_phase: { status: "not_started" },
        },
      }),
    ).toBe("in_progress");
    expect(classifyFacebookReelStatus({ status: { video_status: "processing" } })).toBe(
      "in_progress",
    );
  });

  it("wysłane bez finish, błąd albo pusta odpowiedź = nie wyszło", () => {
    expect(
      classifyFacebookReelStatus({
        status: {
          video_status: "upload_failed",
          uploading_phase: { status: "error" },
          publishing_phase: { status: "not_started" },
        },
      }),
    ).toBe("not_published");
    expect(
      classifyFacebookReelStatus({
        status: {
          uploading_phase: { status: "complete" },
          processing_phase: { status: "complete" },
          publishing_phase: { status: "not_started" },
        },
      }),
    ).toBe("not_published");
    expect(classifyFacebookReelStatus({})).toBe("not_published");
    expect(classifyFacebookReelStatus(null)).toBe("not_published");
  });
});

describe("decyzja dla zawieszonej rolki", () => {
  it("sprawdzamy dopiero po pół godzinie", () => {
    expect(STALLED_REEL_CLAIM_MIN).toBe(30);
  });

  it("FB: opublikowane → domknięcie, w toku → czekamy, nie wyszło → ponowienie", () => {
    expect(
      decideStalledReel({ platform: "facebook_reels", externalId: "v1", remote: "published" }),
    ).toEqual({ action: "published", externalId: "v1" });
    expect(
      decideStalledReel({ platform: "facebook_reels", externalId: "v1", remote: "in_progress" }),
    ).toEqual({ action: "wait" });
    expect(
      decideStalledReel({ platform: "facebook_reels", externalId: "v1", remote: "not_published" })
        .action,
    ).toBe("requeue");
  });

  it("przebieg padł przed utworzeniem wideo / kontenera → bezpieczne ponowienie", () => {
    expect(
      decideStalledReel({ platform: "facebook_reels", externalId: null, remote: null }),
    ).toMatchObject({ action: "requeue", reason: expect.stringMatching(/przed wysłaniem/) });
    expect(
      decideStalledReel({ platform: "instagram_reels", externalId: null, remote: null }),
    ).toMatchObject({ action: "requeue", reason: expect.stringMatching(/kontenera/) });
  });

  it("IG: kontener opublikowany → domknięcie, gotowy / w toku → zwykła ścieżka, błąd → ponowienie", () => {
    expect(
      decideStalledReel({ platform: "instagram_reels", externalId: "c1", remote: "PUBLISHED" }),
    ).toEqual({ action: "published", externalId: "c1" });
    expect(
      decideStalledReel({ platform: "instagram_reels", externalId: "c1", remote: "FINISHED" }),
    ).toEqual({ action: "processing" });
    expect(
      decideStalledReel({ platform: "instagram_reels", externalId: "c1", remote: "IN_PROGRESS" }),
    ).toEqual({ action: "processing" });
    expect(
      decideStalledReel({ platform: "instagram_reels", externalId: "c1", remote: "ERROR" }).action,
    ).toBe("requeue");
  });
});
