import { describe, expect, it } from "vitest";
import {
  assessAvatar,
  letterboxBlockMessage,
  letterboxedAvatars,
  lookOrientation,
  parseAvatarEnginePref,
  parseLandscapePolicy,
  parseVideoResolution,
  pickAvatarEngine,
  type AvatarLook,
} from "./studio-quality";

const look = (over: Partial<AvatarLook> = {}): AvatarLook => ({
  id: "lk_1",
  name: "Filip in the office",
  avatarType: "studio_avatar",
  width: 1920,
  height: 1080,
  preferredOrientation: null,
  engines: ["avatar_iv"],
  previewImageUrl: null,
  ...over,
});

describe("lookOrientation", () => {
  it("bierze natywne piksele przed preferred_orientation", () => {
    expect(lookOrientation(look({ preferredOrientation: "portrait" }))).toBe("landscape");
    expect(lookOrientation(look({ width: 1080, height: 1920 }))).toBe("portrait");
    expect(lookOrientation(look({ width: 1080, height: 1080 }))).toBe("square");
  });

  it("bez pikseli używa preferred_orientation, a bez niej — unknown", () => {
    expect(
      lookOrientation(look({ width: null, height: null, preferredOrientation: "portrait" })),
    ).toBe("portrait");
    expect(lookOrientation(look({ width: null, height: null }))).toBe("unknown");
    expect(lookOrientation(null)).toBe("unknown");
  });
});

describe("pickAvatarEngine", () => {
  it("Avatar V tylko przy `best` i gdy look go obsługuje", () => {
    expect(pickAvatarEngine(look({ engines: ["avatar_v", "avatar_iv"] }), "best")).toBe("avatar_v");
    expect(pickAvatarEngine(look({ engines: ["avatar_iv"] }), "best")).toBeNull();
    expect(pickAvatarEngine(look({ engines: ["avatar_v"] }), "avatar_iv")).toBeNull();
    expect(pickAvatarEngine(null, "best")).toBeNull();
  });
});

describe("assessAvatar / letterboxedAvatars", () => {
  it("poziomy look daje pasy, pionowy nie, nieznany nie blokuje", () => {
    const wide = assessAvatar("a", look(), "best");
    const tall = assessAvatar("b", look({ width: 1080, height: 1920 }), "best");
    const unknown = assessAvatar("c", null, "best");
    expect(wide.letterbox_in_reel).toBe(true);
    expect(tall.letterbox_in_reel).toBe(false);
    expect(unknown.letterbox_in_reel).toBeNull();
    expect(letterboxedAvatars([wide, tall, unknown]).map((a) => a.id)).toEqual(["a"]);
  });

  it("komunikat blokady wymienia awatara i drogę wyjścia", () => {
    const msg = letterboxBlockMessage([assessAvatar("a", look(), "best")]);
    expect(msg).toContain("Filip in the office");
    expect(msg).toContain("1920×1080");
    expect(msg).toContain("allow_letterbox");
  });
});

describe("parsery ustawień", () => {
  it("nieznane wartości wracają do domyślnych (najwyższa jakość)", () => {
    expect(parseVideoResolution("4k")).toBe("1080p");
    expect(parseVideoResolution("720p")).toBe("720p");
    expect(parseAvatarEnginePref(null)).toBe("best");
    expect(parseLandscapePolicy("x")).toBe("block");
    expect(parseLandscapePolicy("allow")).toBe("allow");
  });
});
