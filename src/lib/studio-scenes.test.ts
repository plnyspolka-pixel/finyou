import { describe, it, expect } from "vitest";
import {
  applyScenePlan,
  buildStudioScenes,
  describeScenePlan,
  MAX_SCENES,
  planHasBroll,
  splitScriptIntoSegments,
  type SceneDecision,
} from "./studio-scenes";

const sentences = (n: number) =>
  Array.from({ length: n }, (_, i) => `Zdanie numer ${i + 1} o pożyczce pod zastaw.`).join(" ");

describe("splitScriptIntoSegments", () => {
  it("dzieli po zdaniach i nie gubi ani nie zmienia tekstu", () => {
    const script = sentences(6);
    const out = splitScriptIntoSegments(script);
    expect(out).toHaveLength(6);
    expect(out.join(" ")).toBe(script);
  });

  it("nigdy nie przekracza limitu scen", () => {
    const out = splitScriptIntoSegments(sentences(30));
    expect(out).toHaveLength(MAX_SCENES);
    expect(out.join(" ")).toBe(sentences(30));
  });

  it("rozkłada zdania równo, resztę dokładając na początek", () => {
    const out = splitScriptIntoSegments(sentences(7), 3);
    expect(out.map((s) => s.split(". ").length)).toEqual([3, 2, 2]);
  });

  it("radzi sobie z jednym zdaniem i pustym wejściem", () => {
    expect(splitScriptIntoSegments("Jedno zdanie bez kropki")).toEqual(["Jedno zdanie bez kropki"]);
    expect(splitScriptIntoSegments("   ")).toEqual([]);
  });

  it("normalizuje białe znaki", () => {
    expect(splitScriptIntoSegments("A tu?  \n Tam!  ")).toEqual(["A tu?", "Tam!"]);
  });
});

describe("applyScenePlan", () => {
  const segs = ["Hook.", "Treść jeden.", "Treść dwa.", "Treść trzy.", "CTA."];
  const d = (index: number, query: string | null = "mortgage documents"): SceneDecision => ({
    index,
    broll: true,
    query,
  });

  it("zamienia wskazane segmenty na przebitki z frazą", () => {
    const out = applyScenePlan(segs, [d(1), d(3)]);
    expect(out.map((i) => i.kind)).toEqual(["avatar", "broll", "avatar", "broll", "avatar"]);
    expect(out[1].query).toBe("mortgage documents");
    expect(out[1].text).toBe("Treść jeden.");
  });

  it("trzyma awatara na pierwszej i ostatniej scenie", () => {
    const out = applyScenePlan(segs, [d(0), d(4)]);
    expect(out.map((i) => i.kind)).toEqual(["avatar", "avatar", "avatar", "avatar", "avatar"]);
  });

  it("nie dopuszcza dwóch przebitek pod rząd", () => {
    const out = applyScenePlan(segs, [d(1), d(2), d(3)]);
    expect(out.map((i) => i.kind)).toEqual(["avatar", "broll", "avatar", "broll", "avatar"]);
  });

  it("ignoruje przebitkę bez frazy wyszukiwania", () => {
    const out = applyScenePlan(segs, [d(1, null), d(2, "   ")]);
    expect(out.every((i) => i.kind === "avatar")).toBe(true);
  });

  it("nie tnie krótkiego materiału", () => {
    const out = applyScenePlan(["Hook.", "CTA."], [d(0), d(1)]);
    expect(out.every((i) => i.kind === "avatar")).toBe(true);
  });

  it("zachowuje pełny tekst niezależnie od decyzji AI", () => {
    const out = applyScenePlan(segs, [d(1), d(3)]);
    expect(out.map((i) => i.text)).toEqual(segs);
  });
});

describe("buildStudioScenes", () => {
  const plan = applyScenePlan(
    ["Hook.", "Treść.", "CTA."],
    [{ index: 1, broll: true, query: "city skyline" }],
  );

  it("składa sceny awatara i pełnoekranową grafikę z narracją", () => {
    const scenes = buildStudioScenes(
      [
        { item: plan[0], audioAssetId: "a1", imageUrl: null },
        { item: plan[1], audioAssetId: "a2", imageUrl: "https://img/1.jpg" },
        { item: plan[2], audioAssetId: "a3", imageUrl: null },
      ],
      { avatarId: "av_1", backgroundColor: "#101728" },
    );
    expect(scenes[0]).toEqual({
      type: "avatar_video",
      input: {
        type: "avatar",
        avatar_id: "av_1",
        audio_asset_id: "a1",
        background: { type: "color", color: "#101728" },
      },
    });
    expect(scenes[1]).toEqual({
      type: "image",
      source: { type: "url", url: "https://img/1.jpg" },
      audio_asset_id: "a2",
    });
    expect(scenes[2].type).toBe("avatar_video");
  });

  it("przebitka bez grafiki wraca na awatara zamiast zostawiać dziurę", () => {
    const scenes = buildStudioScenes([{ item: plan[1], audioAssetId: "a2", imageUrl: null }], {
      avatarId: "av_1",
    });
    expect(scenes[0].type).toBe("avatar_video");
  });

  it("pomija tło, gdy nie podano koloru", () => {
    const scenes = buildStudioScenes([{ item: plan[0], audioAssetId: "a1", imageUrl: null }], {
      avatarId: "av_1",
    });
    expect(scenes[0]).toEqual({
      type: "avatar_video",
      input: { type: "avatar", avatar_id: "av_1", audio_asset_id: "a1" },
    });
  });
});

describe("planHasBroll / describeScenePlan", () => {
  it("rozpoznaje plan bez przebitek", () => {
    const flat = applyScenePlan(["A.", "B.", "C."], []);
    expect(planHasBroll(flat)).toBe(false);
    expect(describeScenePlan(flat)).toBe("3 ujęcia z awatarem");
  });

  it("opisuje plan z przebitkami", () => {
    const mixed = applyScenePlan(
      ["A.", "B.", "C.", "D."],
      [{ index: 1, broll: true, query: "keys" }],
    );
    expect(planHasBroll(mixed)).toBe(true);
    expect(describeScenePlan(mixed)).toBe("3 ujęcia z awatarem + 1 przebitka");
  });
});
