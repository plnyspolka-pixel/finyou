import { describe, it, expect } from "vitest";
import {
  defaultPublishText,
  materialPlatformsError,
  publicCopyPath,
  publicationsForMaterial,
  storageExtension,
} from "./marketing-material-publish";
import { platformAvailability, platformsForMediaType } from "./studio-platforms";

const PUBLIC =
  "https://x.supabase.co/storage/v1/object/public/studio-media/marketing-materials/m1.mp4";

describe("publicCopyPath", () => {
  it("buduje stałą ścieżkę z id materiału i rozszerzeniem pliku", () => {
    expect(publicCopyPath({ id: "m1", storage_path: "klient/abc.MP4" })).toBe(
      "marketing-materials/m1.mp4",
    );
  });

  it("bez rozszerzenia (albo z dziwnym) daje .bin", () => {
    expect(storageExtension("klient/plik")).toBe("bin");
    expect(storageExtension("klient/.ukryty")).toBe("bin");
    expect(storageExtension("klient/a.tar.gz")).toBe("gz");
    expect(storageExtension("klient/x.super-dlugie-rozszerzenie")).toBe("bin");
  });
});

describe("defaultPublishText", () => {
  it("bierze ręczny opis, a gdy go brak — opis AI", () => {
    expect(
      defaultPublishText({ title: " Tytuł ", description: " ręczny ", ai_description: "ai" }),
    ).toEqual({ title: "Tytuł", message: "ręczny" });
    expect(defaultPublishText({ title: "T", description: "  ", ai_description: "ai" })).toEqual({
      title: "T",
      message: "ai",
    });
    expect(defaultPublishText({ title: "T", description: null })).toEqual({
      title: "T",
      message: "",
    });
  });
});

describe("platformsForMediaType / materialPlatformsError", () => {
  it("grafika idzie tylko na post FB i X, wideo wszędzie", () => {
    expect(platformsForMediaType("image")).toEqual(["facebook_post", "x"]);
    expect(platformsForMediaType("video")).toHaveLength(6);
  });

  it("blokuje Reels/Shorts/TikTok dla grafiki i wymaga choć jednej platformy", () => {
    expect(materialPlatformsError("image", [])).toMatch(/co najmniej jedną/);
    expect(materialPlatformsError("image", ["facebook_post", "x"])).toBeNull();
    expect(materialPlatformsError("image", ["instagram_reels"])).toMatch(/wymagają wideo/);
    expect(materialPlatformsError("video", ["youtube", "tiktok", "x"])).toBeNull();
  });
});

describe("platformAvailability", () => {
  it("odzwierciedla połączone konta i sekrety Meta; bez statusu nic nie jest gotowe", () => {
    expect(platformAvailability(undefined)).toEqual({
      youtube: false,
      instagram_reels: false,
      facebook_reels: false,
      facebook_post: false,
      tiktok: false,
      x: false,
    });
    const a = platformAvailability({
      youtubeConnected: true,
      facebookConfigured: true,
      instagramConfigured: false,
      tiktokConnected: false,
      xConnected: true,
    });
    expect(a).toEqual({
      youtube: true,
      instagram_reels: false,
      facebook_reels: true,
      facebook_post: true,
      tiktok: false,
      x: true,
    });
  });
});

describe("publicationsForMaterial", () => {
  const social = [
    {
      id: "s1",
      platform: "facebook_reels",
      video_url: PUBLIC,
      image_url: null,
      status: "pending",
      scheduled_at: "2026-09-28T10:00:00.000Z",
      published_at: null,
      last_error: null,
      external_post_id: null,
    },
    {
      id: "s2",
      platform: "x",
      video_url: null,
      image_url: PUBLIC,
      status: "published",
      scheduled_at: "2026-09-27T10:00:00.000Z",
      published_at: "2026-09-27T10:05:00.000Z",
      last_error: null,
      external_post_id: "123",
    },
    {
      id: "s3",
      platform: "tiktok",
      video_url: "https://inne.example/film.mp4",
      image_url: null,
      status: "pending",
      scheduled_at: "2026-09-29T10:00:00.000Z",
      published_at: null,
      last_error: null,
      external_post_id: null,
    },
  ];
  const youtube = [
    {
      id: "y1",
      source_video_url: PUBLIC,
      status: "published",
      scheduled_at: "2026-09-26T10:00:00.000Z",
      published_at: "2026-09-26T10:30:00.000Z",
      last_error: null,
      youtube_video_id: "abc",
    },
  ];

  it("dopasowuje po URL publicznej kopii (wideo albo grafika) i sortuje od najnowszych", () => {
    const r = publicationsForMaterial(PUBLIC, social, youtube);
    expect(r.map((p) => p.id)).toEqual(["s1", "s2", "y1"]);
    expect(r[1].url).toBe("https://x.com/i/web/status/123");
    expect(r[2].url).toBe("https://www.youtube.com/shorts/abc");
    expect(r[0].url).toBeNull();
  });

  it("nie dopasowuje cudzych wpisów", () => {
    expect(publicationsForMaterial("https://nic.example/x.mp4", social, youtube)).toEqual([]);
  });
});
