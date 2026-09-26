import { describe, it, expect } from "vitest";
import {
  applyScenePlan,
  avatarsInPlan,
  buildStudioScenes,
  describeScenePlan,
  MAX_SCENES,
  planHasBroll,
  planReelStructure,
  splitScriptIntoSegments,
  visualSceneCount,
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

describe("planReelStructure", () => {
  const segs = (n: number) => Array.from({ length: n }, (_, i) => `Zdanie ${i + 1}.`);

  it("trzyma rytm: ujęcie → wizual hook → przebitka → a-roll, CTA na awatarze", () => {
    const out = planReelStructure(segs(6), { avatarIds: ["A", "B", "C"] });
    expect(out.map((i) => i.kind)).toEqual(["avatar", "hook", "broll", "avatar", "hook", "avatar"]);
  });

  it("oddaje a-roll kolejnemu domyślnemu awatarowi", () => {
    const out = planReelStructure(segs(6), { avatarIds: ["A", "B", "C"] });
    const speakers = out.filter((i) => i.kind === "avatar").map((i) => i.avatarId);
    expect(speakers).toEqual(["A", "B", "C"]);
    expect(avatarsInPlan(out)).toEqual(["A", "B", "C"]);
  });

  it("zawija rotację, gdy domyślnych awatarów jest mniej niż ujęć", () => {
    const out = planReelStructure(segs(6), { avatarIds: ["A", "B"] });
    expect(out.filter((i) => i.kind === "avatar").map((i) => i.avatarId)).toEqual(["A", "B", "A"]);
  });

  it("przy jednym awatarze nadal tnie, tylko bez zmiany twarzy", () => {
    const out = planReelStructure(segs(5), { avatarIds: ["A"] });
    expect(out.map((i) => i.kind)).toEqual(["avatar", "hook", "broll", "avatar", "avatar"]);
    expect(avatarsInPlan(out)).toEqual(["A"]);
  });

  it("scena bez awatara niesie mówcę, który ją przejmie po nieudanej grafice", () => {
    const out = planReelStructure(segs(6), { avatarIds: ["A", "B", "C"] });
    expect(out[1].avatarId).toBe("B");
    expect(out[2].avatarId).toBe("B");
  });

  it("nie tnie krótkiego materiału", () => {
    const out = planReelStructure(segs(2), { avatarIds: ["A", "B"] });
    expect(out.every((i) => i.kind === "avatar")).toBe(true);
    expect(visualSceneCount(out)).toBe(0);
  });

  it("nie zmienia ani nie gubi tekstu lektora", () => {
    const input = segs(6);
    expect(planReelStructure(input, { avatarIds: ["A", "B"] }).map((i) => i.text)).toEqual(input);
  });

  it("plan struktury liczy się jako urozmaicenie i ma opis z hookami", () => {
    const out = planReelStructure(segs(6), { avatarIds: ["A", "B", "C"] });
    expect(planHasBroll(out)).toBe(true);
    expect(visualSceneCount(out)).toBe(3);
    expect(describeScenePlan(out)).toBe(
      "3 ujęcia z awatarem + 1 przebitka + 2 wizual hooki (3 awatary)",
    );
  });
});

describe("rotacja awatarów w trybie przebitek AI", () => {
  const segs = ["Hook.", "Treść jeden.", "Treść dwa.", "CTA."];

  it("kolejne ujęcia biorą kolejnych domyślnych awatarów", () => {
    const out = applyScenePlan(segs, [{ index: 1, broll: true, query: "keys" }], ["A", "B"]);
    expect(out.map((i) => i.avatarId)).toEqual(["A", "B", "B", "A"]);
  });

  it("bez listy domyślnych nie przypisuje nikogo (zostaje awatar z formularza)", () => {
    const out = applyScenePlan(segs, []);
    expect(out.every((i) => i.avatarId == null)).toBe(true);
  });
});

describe("buildStudioScenes — awatar per scena", () => {
  it("bierze awatara ze sceny, a z opcji tylko gdy scena nikogo nie wskazała", () => {
    const plan = planReelStructure(["Hook.", "Treść.", "Więcej treści.", "CTA."], {
      avatarIds: ["A", "B"],
    });
    const scenes = buildStudioScenes(
      plan.map((item, i) => ({
        item,
        audioAssetId: `a${i}`,
        imageUrl: item.kind === "avatar" ? null : `https://img/${i}.jpg`,
      })),
      { avatarId: "zapas" },
    );
    expect(scenes[0]).toMatchObject({ input: { avatar_id: "A" } });
    expect(scenes[1]).toMatchObject({ type: "image" });
    // CTA mówi już druga twarz — o to chodzi w „a-roll z innego awatara".
    expect(scenes[3]).toMatchObject({ input: { avatar_id: "B" } });
  });

  it("wizual hook bez grafiki wraca na awatara przypisanego scenie", () => {
    const plan = planReelStructure(["Hook.", "Treść.", "CTA."], { avatarIds: ["A", "B"] });
    const scenes = buildStudioScenes([{ item: plan[1], audioAssetId: "a1", imageUrl: null }], {
      avatarId: "zapas",
    });
    expect(scenes[0]).toMatchObject({ type: "avatar_video", input: { avatar_id: "B" } });
  });
});
