// Bank klipów hooka: dobór (tor, ocena, rotacja), walidacja importu, długość mp4.
import { describe, expect, it } from "vitest";
import {
  mp4DurationSeconds,
  rankHookClips,
  sanitizeHookClipItem,
  type HookClip,
} from "./studio-hook-clips";

const clip = (over: Partial<HookClip> & Pick<HookClip, "slug">): HookClip => ({
  id: over.slug,
  track: "both",
  rating: 3,
  media_url: `https://cdn.test/${over.slug}.mp4`,
  duration_s: 5,
  active: true,
  use_count: 0,
  last_used_at: null,
  ...over,
});

describe("rankHookClips", () => {
  const bank = [
    clip({ slug: "a_both_4", rating: 4 }),
    clip({ slug: "b_inw_4", track: "inwestor", rating: 4 }),
    clip({ slug: "c_poz_3", track: "pozyczkobiorca", rating: 3 }),
    clip({ slug: "d_poz_2", track: "pozyczkobiorca", rating: 2 }),
    clip({ slug: "e_poz_off", track: "pozyczkobiorca", rating: 4, active: false }),
  ];

  it("tor rolki albo `both`; nieaktywne i słabsze o 2 oczka odpadają", () => {
    expect(rankHookClips(bank, "pozyczkobiorca").map((c) => c.slug)).toEqual([
      "a_both_4",
      "c_poz_3",
    ]);
    expect(rankHookClips(bank, "inwestor").map((c) => c.slug)).toEqual(["a_both_4", "b_inw_4"]);
  });

  it("bez toru — dowolny aktywny klip", () => {
    expect(rankHookClips(bank, null).map((c) => c.slug)).toEqual([
      "a_both_4",
      "b_inw_4",
      "c_poz_3",
    ]);
  });

  it("rotacja: nieużyte przed użytymi, potem najdawniej użyte; remis → wyższa ocena", () => {
    const used = [
      clip({ slug: "x4", rating: 4, last_used_at: "2026-10-20T10:00:00Z" }),
      clip({ slug: "y4", rating: 4, last_used_at: "2026-10-21T10:00:00Z" }),
      clip({ slug: "z3", rating: 3 }),
      clip({ slug: "w4", rating: 4 }),
    ];
    expect(rankHookClips(used, null).map((c) => c.slug)).toEqual(["w4", "z3", "x4", "y4"]);
  });

  it("gdy lepszych brak, bierze słabsze; pusty bank → pusta lista", () => {
    expect(rankHookClips([clip({ slug: "s", rating: 2 })], "inwestor")[0].slug).toBe("s");
    expect(rankHookClips([], "inwestor")).toEqual([]);
    expect(rankHookClips([clip({ slug: "p", track: "pozyczkobiorca" })], "inwestor")).toEqual([]);
  });
});

describe("sanitizeHookClipItem", () => {
  it("normalizuje pola i pilnuje toru / https", () => {
    const item = sanitizeHookClipItem({
      slug: " H01_Vault_Kling ",
      track: "both",
      rating: 4.4,
      tags: ["Skarbiec", "skarbiec", ""],
      source_url: "https://v3b.fal.media/files/x.mp4",
    });
    expect(item).toMatchObject({ slug: "h01_vault_kling", rating: 4, tags: ["skarbiec"] });
    expect(() =>
      sanitizeHookClipItem({ slug: "a", track: "klient", source_url: "https://x" }),
    ).toThrow(/tor/);
    expect(() =>
      sanitizeHookClipItem({ slug: "a", track: "both", source_url: "http://x" }),
    ).toThrow(/https/);
    expect(() =>
      sanitizeHookClipItem({ slug: "a b", track: "both", source_url: "https://x" }),
    ).toThrow(/slug/);
  });
});

describe("mp4DurationSeconds", () => {
  const box = (version: 0 | 1, timescale: number, duration: number) => {
    const b = new Uint8Array(version === 1 ? 120 : 108);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, b.length);
    b.set([0x6d, 0x76, 0x68, 0x64], 4); // mvhd
    b[8] = version;
    if (version === 1) {
      dv.setUint32(28, timescale);
      dv.setUint32(32, Math.floor(duration / 2 ** 32));
      dv.setUint32(36, duration >>> 0);
    } else {
      dv.setUint32(20, timescale);
      dv.setUint32(24, duration);
    }
    // Poprzedzone innym boksem (np. ftyp), jak w prawdziwym pliku.
    const out = new Uint8Array(16 + b.length);
    out.set([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70], 0);
    out.set(b, 16);
    return out;
  };

  it("czyta mvhd w wersji 0 i 1", () => {
    expect(mp4DurationSeconds(box(0, 1000, 5041))).toBe(5.041);
    expect(mp4DurationSeconds(box(1, 90000, 450000))).toBe(5);
  });

  it("bez nagłówka → null", () => {
    expect(mp4DurationSeconds(new Uint8Array(64))).toBeNull();
  });
});
