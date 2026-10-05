import { describe, it, expect } from "vitest";
import {
  CAPTION_BURN_MAX_ATTEMPTS,
  CAPTION_BURN_TIMEOUT_MS,
  NO_BURNER_REASON,
  NO_SRT_REASON,
  captionBadgeLabel,
  planBadgeBurn,
  planCaptionBurn,
  resolveCaptionBurn,
} from "./studio-captions";

const NOW = new Date("2026-08-18T12:00:00.000Z");
const CLEAN = "https://files.heygen.ai/video/abc123.mp4";
const SRT = "https://cdn.financeyou.pl/studio-media/studio-napisy/abc123.srt";

describe("captionBadgeLabel", () => {
  it("rozróżnia napisy (ze stylem), sam plik SRT i brak napisów", () => {
    expect(captionBadgeLabel({ captions: true, subtitle_url: SRT, caption_style: "reels" })).toBe(
      "napisy: Rolka — duże z obrysem",
    );
    expect(captionBadgeLabel({ captions: true, subtitle_url: SRT, caption_style: "heygen" })).toBe(
      "napisy: HeyGen (dawne)",
    );
    expect(captionBadgeLabel({ captions: false, subtitle_url: SRT })).toBe("tylko plik SRT");
    expect(captionBadgeLabel({ captions: false, subtitle_url: null })).toBe("bez napisów");
  });
});

describe("planCaptionBurn", () => {
  it("wypala u siebie, gdy napisy włączone, usługa jest, master i SRT są", () => {
    expect(
      planCaptionBurn({
        captions: true,
        captionStyle: "reels",
        burnerConfigured: true,
        videoUrl: CLEAN,
        srtUrl: SRT,
      }),
    ).toEqual({
      action: "burn",
      videoUrl: CLEAN,
      srtUrl: SRT,
      styleId: "reels",
      aiBadge: false,
      overlays: null,
    });
  });

  it("nakładki dynamiczne jadą tym samym przebiegiem co napisy", () => {
    const overlays = {
      tag: "PRYWATNE POŻYCZKI\nPOD ZASTAW NIERUCHOMOŚCI",
      tagHoldSeconds: 1.2,
      headline: "Czym jest pożyczka prywatna?",
      headlineStartSeconds: 0.8,
      headlineEndSeconds: 6,
    };
    expect(
      planCaptionBurn({
        captions: true,
        captionStyle: "reels",
        burnerConfigured: true,
        videoUrl: CLEAN,
        srtUrl: SRT,
        overlays,
      }),
    ).toMatchObject({ action: "burn", overlays });
  });

  it("znaczek AI jedzie tym samym przebiegiem co napisy", () => {
    expect(
      planCaptionBurn({
        captions: true,
        captionStyle: "tiktok",
        burnerConfigured: true,
        videoUrl: CLEAN,
        srtUrl: SRT,
        aiBadge: true,
      }),
    ).toMatchObject({ action: "burn", styleId: "tiktok", aiBadge: true });
  });

  it("nieznany albo stary styl (heygen) = styl domyślny, nie napisy HeyGena", () => {
    for (const captionStyle of ["heygen", undefined, null, "obcy"]) {
      expect(
        planCaptionBurn({
          captions: true,
          captionStyle,
          burnerConfigured: true,
          videoUrl: CLEAN,
          srtUrl: SRT,
        }),
      ).toMatchObject({ action: "burn", styleId: "reels" });
    }
  });

  it("wyłączone napisy = nic do wypalenia (poza znaczkiem)", () => {
    expect(
      planCaptionBurn({
        captions: false,
        captionStyle: "reels",
        burnerConfigured: false,
        videoUrl: CLEAN,
        srtUrl: null,
      }),
    ).toEqual({ action: "skip" });
  });

  it("brak usługi, mastera albo SRT = porażka zadania z powodem, nigdy publikacja bez napisów", () => {
    expect(
      planCaptionBurn({
        captions: true,
        captionStyle: "box",
        burnerConfigured: false,
        videoUrl: CLEAN,
        srtUrl: SRT,
      }),
    ).toEqual({ action: "fail", reason: NO_BURNER_REASON });
    expect(
      planCaptionBurn({
        captions: true,
        captionStyle: "box",
        burnerConfigured: true,
        videoUrl: CLEAN,
        srtUrl: null,
      }),
    ).toEqual({ action: "fail", reason: NO_SRT_REASON });
    const noMaster = planCaptionBurn({
      captions: true,
      captionStyle: "box",
      burnerConfigured: true,
      videoUrl: "",
      srtUrl: SRT,
    });
    expect(noMaster.action).toBe("fail");
  });
});

describe("resolveCaptionBurn", () => {
  const started = new Date(NOW.getTime() - 5 * 60_000).toISOString();
  const base = { error: null, startedAt: started, attempts: 1, now: NOW };

  it("gotowe → zapis; w toku → czekamy", () => {
    expect(resolveCaptionBurn({ ...base, status: "done", fallback: { previous: null } })).toEqual({
      state: "store",
    });
    expect(
      resolveCaptionBurn({ ...base, status: "processing", fallback: { previous: null } }),
    ).toEqual({ state: "waiting" });
  });

  it("po przekroczeniu czasu zadanie pada z powodem — bez wersji HeyGena", () => {
    const old = new Date(NOW.getTime() - CAPTION_BURN_TIMEOUT_MS - 1000).toISOString();
    const r = resolveCaptionBurn({
      ...base,
      status: "queued",
      startedAt: old,
      fallback: { previous: null },
    });
    expect(r.state).toBe("fail");
    expect((r as { note: string }).note).toMatch(/^Napisy nieudane: .*min/);
  });

  it("błąd i zaginione zadanie: najpierw ponowienie, potem porażka z komunikatem", () => {
    expect(
      resolveCaptionBurn({
        ...base,
        status: "missing",
        attempts: 1,
        fallback: { previous: null },
      }),
    ).toMatchObject({ state: "retry" });
    const r = resolveCaptionBurn({
      ...base,
      status: "failed",
      error: "ffmpeg zakończył się kodem 1",
      attempts: CAPTION_BURN_MAX_ATTEMPTS,
      fallback: { previous: null },
    });
    expect(r).toEqual({ state: "fail", note: "Napisy nieudane: ffmpeg zakończył się kodem 1" });
  });

  it("przy zmianie napisów gotowego wideo wraca poprzedni plik", () => {
    const r = resolveCaptionBurn({
      ...base,
      status: "failed",
      error: "x",
      attempts: 5,
      fallback: {
        previous: { videoUrl: "https://cdn/prev.mp4", captions: true, captionStyle: "tiktok" },
      },
    });
    expect(r).toMatchObject({
      state: "fallback",
      videoUrl: "https://cdn/prev.mp4",
      captionsBurned: true,
      captionStyle: "tiktok",
    });
    expect((r as { note: string }).note).toMatch(/zostaje poprzednia wersja/);
  });

  it("znaczek AI ma własną etykietę porażki", () => {
    const r = resolveCaptionBurn({
      status: "failed",
      error: "ffmpeg padł",
      startedAt: NOW.toISOString(),
      attempts: CAPTION_BURN_MAX_ATTEMPTS,
      now: NOW,
      fallback: { previous: null },
      failureLabel: "Znaczek AI nieudany",
    });
    expect(r).toEqual({ state: "fail", note: "Znaczek AI nieudany: ffmpeg padł" });
  });
});

describe("planBadgeBurn", () => {
  const OVERLAYS = {
    tag: "PRYWATNE POŻYCZKI\nPOD ZASTAW NIERUCHOMOŚCI",
    tagHoldSeconds: 1.2,
    headline: "Czym jest pożyczka prywatna?",
    headlineStartSeconds: 0.8,
    headlineEndSeconds: 6,
  };

  it("włączony znaczek i usługa → znaczek na pliku do publikacji", () => {
    expect(planBadgeBurn({ aiBadge: true, burnerConfigured: true, videoUrl: CLEAN })).toEqual({
      action: "badge",
      videoUrl: CLEAN,
      aiBadge: true,
      overlays: null,
    });
  });

  it("same nakładki dynamiczne wystarczą do przebiegu, nawet bez znaczka", () => {
    expect(
      planBadgeBurn({
        aiBadge: false,
        burnerConfigured: true,
        videoUrl: CLEAN,
        overlays: OVERLAYS,
      }),
    ).toEqual({ action: "badge", videoUrl: CLEAN, aiBadge: false, overlays: OVERLAYS });
  });

  it("wyłączony znaczek albo brak pliku — bez komunikatu", () => {
    expect(planBadgeBurn({ aiBadge: false, burnerConfigured: true, videoUrl: CLEAN })).toEqual({
      action: "skip",
      reason: null,
    });
    expect(planBadgeBurn({ aiBadge: true, burnerConfigured: true, videoUrl: "" })).toEqual({
      action: "skip",
      reason: null,
    });
  });

  it("brak usługi wypalania mówi wprost, czego nie będzie", () => {
    const plan = planBadgeBurn({ aiBadge: true, burnerConfigured: false, videoUrl: CLEAN });
    expect(plan.action).toBe("skip");
    expect((plan as { reason: string }).reason).toMatch(/Znaczek AI pominięty/);
    const both = planBadgeBurn({
      aiBadge: true,
      burnerConfigured: false,
      videoUrl: CLEAN,
      overlays: OVERLAYS,
    });
    expect((both as { reason: string }).reason).toMatch(
      /Znaczek AI i nakładki dynamiczne pominięte/,
    );
    const onlyOverlays = planBadgeBurn({
      aiBadge: false,
      burnerConfigured: false,
      videoUrl: CLEAN,
      overlays: OVERLAYS,
    });
    expect((onlyOverlays as { reason: string }).reason).toMatch(/Nakładki dynamiczne pominięte/);
  });
});
