import { describe, expect, it } from "vitest";
import {
  classifyOrientation,
  containBox,
  coverTransform,
  framingSegments,
  imageSizeFromBytes,
  pickLeadAvatar,
  sceneTimeline,
  type AvatarFrameInfo,
} from "./studio-avatar-framing";
import { buildReelPlan } from "./studio-reel-plan";

function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}
function jpeg(w: number, h: number): Uint8Array {
  // SOI, APP0 (16 B), SOF0
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0,
    16,
    ...new Array(14).fill(0),
    0xff,
    0xc0,
    0,
    17,
    8,
    h >> 8,
    h & 255,
    w >> 8,
    w & 255,
    3,
    ...new Array(12).fill(0),
  ]);
}
function webpVp8x(w: number, h: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set(
    [..."RIFF"].map((c) => c.charCodeAt(0)),
    0,
  );
  b.set(
    [..."WEBPVP8X"].map((c) => c.charCodeAt(0)),
    8,
  );
  const put24 = (i: number, v: number) => b.set([v & 255, (v >> 8) & 255, (v >> 16) & 255], i);
  put24(24, w - 1);
  put24(27, h - 1);
  return b;
}

const LAND: AvatarFrameInfo = {
  orientation: "landscape",
  width: 1920,
  height: 1080,
  focusX: 0.5,
  focusY: 0.35,
};
const PORT: AvatarFrameInfo = {
  orientation: "portrait",
  width: 1080,
  height: 1920,
  focusX: 0.5,
  focusY: 0.35,
};

describe("wymiary zdjęcia awatara", () => {
  it("PNG, JPEG, WEBP", () => {
    expect(imageSizeFromBytes(png(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    expect(imageSizeFromBytes(jpeg(1600, 900))).toEqual({ width: 1600, height: 900 });
    expect(imageSizeFromBytes(webpVp8x(1080, 1920))).toEqual({ width: 1080, height: 1920 });
    expect(imageSizeFromBytes(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it("orientacja", () => {
    expect(classifyOrientation(1920, 1080)).toBe("landscape");
    expect(classifyOrientation(1080, 1920)).toBe("portrait");
    expect(classifyOrientation(1000, 1050)).toBe("square");
  });
});

describe("letterbox HeyGena i kadr cover", () => {
  it("poziome 16:9 w 9:16 zajmuje ~32% wysokości (~68% pasów)", () => {
    const box = containBox(LAND);
    expect(box.width).toBe(720);
    expect(1 - box.height / 1280).toBeCloseTo(0.684, 2);
  });
  it("cover wypełnia cały kadr: brak pasów po przekształceniu", () => {
    const t = coverTransform(LAND)!;
    const box = containBox(LAND);
    // Krawędzie obrazu awatara po przekształceniu wychodzą poza kadr 720×1280.
    expect(t.tx + t.scale * box.x).toBeLessThanOrEqual(0.01);
    expect(t.tx + t.scale * (box.x + box.width)).toBeGreaterThanOrEqual(719.99);
    expect(t.ty + t.scale * box.y).toBeLessThanOrEqual(0.01);
    expect(t.ty + t.scale * (box.y + box.height)).toBeGreaterThanOrEqual(1279.99);
  });
  it("pionowe 9:16 — bez zmian", () => {
    expect(coverTransform(PORT)).toBeNull();
  });
});

describe("prowadzący rolki", () => {
  const o = (id: string) => (id === "biala-koszula" ? "landscape" : id === "?" ? null : "portrait");
  it("poziomy prowadzący oddaje hook pionowemu z puli", () => {
    expect(pickLeadAvatar("biala-koszula", ["biala-koszula", "biuro"], o)).toEqual({
      lead: "biuro",
      swapped: true,
    });
  });
  it("pionowy i nieznany zostają", () => {
    expect(pickLeadAvatar("biuro", ["biala-koszula"], o).swapped).toBe(false);
    expect(pickLeadAvatar("?", ["biuro"], o).swapped).toBe(false);
  });
  it("bez pionowej alternatywy — bez zmiany (rolka i tak wychodzi, kadr ratuje Remotion)", () => {
    expect(pickLeadAvatar("biala-koszula", ["biala-koszula"], o).swapped).toBe(false);
  });
});

const CUES = [
  { start: 0, end: 2, text: "Bank powiedział nie?" },
  { start: 2, end: 4, text: "Patrzy na zabezpieczenie." },
  { start: 4, end: 6, text: "Złóż wniosek." },
];

describe("odcinki kadrowania", () => {
  it("czasy scen ze słów SRT", () => {
    const t = sceneTimeline(
      [
        { kind: "avatar", text: "Bank powiedział nie?", avatarId: "L" },
        { kind: "broll", text: "Patrzy na zabezpieczenie.", avatarId: "P" },
        { kind: "avatar", text: "Złóż wniosek.", avatarId: "P" },
      ],
      CUES,
    );
    expect(t.map((s) => [s.start, s.end])).toEqual([
      [0, 2],
      [2, 4],
      [4, null],
    ]);
  });
  it("tylko ujęcia awatara poziomego; przebitki i pionowi bez zmian", () => {
    const seg = framingSegments({
      scenes: [
        { kind: "avatar", text: "Bank powiedział nie?", avatarId: "L" },
        { kind: "broll", text: "Patrzy na zabezpieczenie.", avatarId: "L" },
        { kind: "avatar", text: "Złóż wniosek.", avatarId: "P" },
      ],
      leadAvatarId: "L",
      cues: CUES,
      infos: { L: LAND, P: PORT },
    });
    expect(seg).toHaveLength(1);
    expect(seg[0]).toMatchObject({ start: 0, end: 2 });
  });
  it("pojedyncze ujęcie poziomego prowadzącego — cały film", () => {
    const seg = framingSegments({
      scenes: null,
      leadAvatarId: "L",
      cues: CUES,
      infos: { L: LAND },
    });
    expect(seg).toEqual([{ start: 0, end: null, ...coverTransform(LAND)! }]);
  });
  it("plan Remotion niesie kadrowanie", () => {
    const plan = buildReelPlan({
      srt: "1\n00:00:00,000 --> 00:00:02,000\nBank powiedział nie?\n",
      styleId: null,
      aiBadge: true,
      overlays: null,
      framing: { scenes: null, leadAvatarId: "L", infos: { L: LAND } },
    });
    expect(plan.framing).toHaveLength(1);
  });
});
