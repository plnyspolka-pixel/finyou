import { describe, expect, it } from "vitest";
import { parseSubtitles } from "./caption-style";
import {
  MOTION_LIMITS,
  motionWithCueTiming,
  sanitizeMotionDesign,
  sanitizeMotionProps,
} from "./motion-catalog";
import { buildReelPlan } from "./studio-reel-plan";

// Fragment rolki nr 9 — kwestie jak z ElevenLabs.
const SRT = [
  "1",
  "00:00:00,000 --> 00:00:03,000",
  "Myślisz, że pożyczki pod zastaw są dla milionerów?",
  "",
  "2",
  "00:00:03,000 --> 00:00:06,000",
  "Większość spraw na rynku to sto do trzystu tysięcy złotych.",
  "",
  "3",
  "00:00:06,000 --> 00:00:08,000",
  "Nie pięć milionów.",
  "",
  "4",
  "00:00:08,000 --> 00:00:12,000",
  "Jest jedno zastrzeżenie: poniżej stu tysięcy koszty notariusza i hipoteki zjadają zysk.",
  "",
  "5",
  "00:00:12,000 --> 00:00:15,000",
  "Obserwuj Finance You, jeśli masz kapitał.",
  "",
].join("\n");
const cues = parseSubtitles(SRT);

describe("sanitizeMotionDesign", () => {
  it("przyjmuje poprawne elementy i odrzuca nieznane komponenty / za długie teksty", () => {
    const out = sanitizeMotionDesign([
      {
        component: "range",
        zone: "top",
        sync: "Większość spraw na rynku",
        endSync: null,
        itemSync: null,
        props: {
          title: "Typowa sprawa",
          from: 100,
          to: 300,
          max: 500,
          unit: "tys. zł",
          caption: null,
        },
      },
      { component: "hologram", zone: "top", sync: "Nie pięć milionów", props: {} },
      {
        component: "keyword",
        zone: "center",
        sync: "Nie pięć milionów",
        props: { text: "x".repeat(MOTION_LIMITS.keyword + 1), highlight: null },
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].component).toBe("range");
  });

  it("threshold: brakujący lub zły koniec skali dostaje sensowną wartość", () => {
    const p = sanitizeMotionProps("threshold", {
      title: "Próg opłacalności",
      value: 100,
      max: 50,
      unit: "tys. zł",
      below: "koszty zjadają zysk",
      above: "pożyczka ma sens",
    });
    expect(p?.max).toBeGreaterThan(100);
  });

  it("keyword: podświetlenie spoza tekstu jest pomijane", () => {
    expect(
      sanitizeMotionProps("keyword", { text: "Nie 5 milionów", highlight: "miliard" }),
    ).toEqual({
      text: "Nie 5 milionów",
      highlight: null,
    });
  });

  it("checklist: 2–4 pozycje", () => {
    expect(sanitizeMotionProps("checklist", { title: null, items: ["jedna"] })).toBeNull();
    expect(
      sanitizeMotionProps("checklist", { title: null, items: ["a", "b", "c"] })?.items,
    ).toHaveLength(3);
  });
});

describe("motionWithCueTiming", () => {
  const design = sanitizeMotionDesign([
    {
      component: "range",
      zone: "top",
      sync: "Większość spraw na rynku",
      endSync: null,
      itemSync: null,
      props: {
        title: "Typowa sprawa",
        from: 100,
        to: 300,
        max: 500,
        unit: "tys. zł",
        caption: null,
      },
    },
    {
      component: "keyword",
      zone: "center",
      sync: "Nie pięć milionów",
      endSync: null,
      itemSync: null,
      props: { text: "Nie 5 milionów", highlight: "5 milionów" },
    },
    {
      component: "threshold",
      zone: "top",
      sync: "poniżej stu tysięcy koszty notariusza",
      endSync: "zjadają zysk",
      itemSync: null,
      props: {
        title: "Od jakiej kwoty to ma sens",
        value: 100,
        max: 300,
        unit: "tys. zł",
        below: "koszty zjadają zysk",
        above: "pożyczka ma sens",
      },
    },
    {
      component: "cta",
      zone: "top",
      sync: "tego zdania nie ma w nagraniu",
      endSync: null,
      itemSync: null,
      props: { text: "Obserwuj Finance You", sub: null },
    },
  ]);

  it("czasy z SRT, element bez dopasowania wypada, bez nakładania", () => {
    const out = motionWithCueTiming(design, cues);
    expect(out.map((m) => m.component)).toEqual(["range", "keyword", "threshold"]);
    expect(out[0].start).toBeCloseTo(3, 1);
    // Kotwica w środku kwestii — start proporcjonalny do liter, nie początek kwestii.
    expect(out[2].start).toBeGreaterThan(8.5);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].end).toBeLessThanOrEqual(out[i].start);
    }
    expect(out[1].end - out[1].start).toBeLessThanOrEqual(MOTION_LIMITS.maxCenterDuration);
  });

  it("plan Remotion niesie elementy z czasami", () => {
    const plan = buildReelPlan({
      srt: SRT,
      styleId: "reels",
      aiBadge: true,
      overlays: { cards: [], motion: design },
    });
    expect(plan.overlays?.motion?.map((m) => m.component)).toEqual([
      "range",
      "keyword",
      "threshold",
    ]);
  });
});

describe("schemat odpowiedzi projektanta", () => {
  it("mieści się w limicie API: najwyżej 16 parametrów z unią / anyOf", async () => {
    const { OUTPUT_SCHEMA } = await import("./motion-designer.server");
    let unions = 0;
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      const o = node as Record<string, unknown>;
      if (Array.isArray(o.anyOf) || Array.isArray(o.type)) unions++;
      Object.values(o).forEach(walk);
    };
    walk(OUTPUT_SCHEMA);
    expect(unions).toBeLessThanOrEqual(16);
  });

  it("propsy jako tekst JSON (props_json) od projektanta AI", () => {
    const [el] = sanitizeMotionDesign([
      {
        component: "range",
        zone: "top",
        sync: "Większość spraw na rynku",
        endSync: "",
        itemSync: [],
        props_json:
          '{"title":"Typowa sprawa","from":100,"to":300,"max":500,"unit":"tys. zł","caption":null}',
      },
      { component: "stat", zone: "top", sync: "Nie pięć milionów", props_json: "{zepsuty" },
    ]);
    expect(el.component).toBe("range");
    expect(el.props).toMatchObject({ from: 100, to: 300, caption: null });
  });

  it("pusty tekst w polach opcjonalnych czyta się jak brak", () => {
    const [el] = sanitizeMotionDesign([
      {
        component: "stat",
        zone: "top",
        sync: "Większość spraw na rynku",
        endSync: "",
        itemSync: [],
        props: { kicker: "", value: "250 tys. zł", caption: "" },
      },
    ]);
    expect(el.endSync).toBeNull();
    expect(el.props).toEqual({ kicker: null, value: "250 tys. zł", caption: null });
  });
});
