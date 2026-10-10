import { describe, expect, it } from "vitest";
import {
  AI_BADGE,
  CUSTOM_CAPTION_STYLES,
  DEFAULT_ASS_DIMENSIONS,
  OVERLAY_CARD_LAYOUT,
  overlayCardEvents,
  srtToAss,
} from "./caption-style";
import { buildReelPlan } from "./studio-reel-plan";
import {
  parseRemotionJobId,
  parseRenderEngine,
  remotionJobId,
  resolveRenderEngine,
} from "./studio-render-engine";

const SRT = [
  "1",
  "00:00:00,000 --> 00:00:02,000",
  "Pożyczka pod zastaw nieruchomości",
  "",
  "2",
  "00:00:02,000 --> 00:00:04,000",
  "w 24 godziny",
  "",
].join("\n");

describe("buildReelPlan", () => {
  it("napisy: te same porcje co plik ASS dla caption-burnera", () => {
    const plan = buildReelPlan({ srt: SRT, styleId: "reels", aiBadge: false, overlays: null });
    const ass = srtToAss(SRT, "reels")!;
    const dialogues = ass.split("\n").filter((l) => l.startsWith("Dialogue: 0,"));
    expect(plan.captions?.events).toHaveLength(dialogues.length);
    // Te same wiersze co w ASS (po wyrównaniu długości dwóch wierszy).
    plan.captions!.events.forEach((ev, k) => {
      const assText = dialogues[k].split(",,").pop()!.split("\\N");
      expect(ev.lines.map((l) => l.map((s) => s.text).join(""))).toEqual(assText);
      expect(ev.lines.flat().every((s) => s.color === "#FFFFFF")).toBe(true);
    });
    expect(plan.captions?.style.fontSize).toBe(CUSTOM_CAPTION_STYLES.reels.fontSize);
    expect(plan.badge).toBeNull();
  });

  it("tiktok: wielkie litery i po jednym zdarzeniu na słowo z podświetleniem", () => {
    const plan = buildReelPlan({ srt: SRT, styleId: "tiktok", aiBadge: true, overlays: null });
    const events = plan.captions!.events;
    const first = events[0];
    expect(
      first.lines
        .flat()
        .map((s) => s.text)
        .join(""),
    ).toBe("POŻYCZKA POD");
    expect(first.lines[0][0]).toEqual({ text: "POŻYCZKA", color: "#FFD400" });
    expect(first.lines[0][1]).toEqual({ text: " POD", color: "#FFFFFF" });
    // Zdarzenia stykają się — bez mrugania między słowami.
    for (let i = 1; i < events.length; i++) {
      if (events[i].start < events[i - 1].end) throw new Error("zdarzenia nachodzą na siebie");
    }
    expect(plan.badge).toEqual(AI_BADGE);
  });

  it("bez napisów: sam znaczek i nakładki z czasami z SRT", () => {
    const plan = buildReelPlan({
      srt: SRT,
      styleId: null,
      aiBadge: true,
      overlays: {
        tag: "POŻYCZKI",
        headline: "Pożyczka pod zastaw nieruchomości",
        headlineStartSeconds: 0.5,
        cards: [
          {
            title: "Plusy",
            rows: [{ icon: "check", text: "Szybko" }, { text: "Bez BIK" }],
            startSeconds: 2.5,
            endSeconds: null,
          },
        ],
      },
    });
    expect(plan.captions).toBeNull();
    expect(plan.overlays?.headline).toMatchObject({ start: 0.5, end: 2.25 });
    expect(plan.overlays?.tag?.lines).toEqual(["POŻYCZKI"]);
    const card = plan.overlays!.cards[0];
    expect(card.panel).toBeNull();
    expect(card.end).toBeNull();
    expect(card.rows.map((r) => r.icon)).toEqual(["✓", null]);
    expect(card.rows[1].start).toBeGreaterThan(card.rows[0].start);
  });

  it("długi wiersz karty zmniejsza czcionkę zamiast wyjść za kadr (oba silniki)", () => {
    // Karta z rolki nr 9 — „100-300 tys." wychodziło za prawą krawędź.
    const card = {
      title: "KWOTY POŻYCZEK",
      rows: [
        { icon: "dot" as const, text: "Większość spraw na rynku", value: "100-300 tys." },
        { icon: "dot" as const, text: "Nie", value: "5 milionów" },
      ],
      startSeconds: 2,
      endSeconds: 8,
    };
    const plan = buildReelPlan({
      srt: null,
      styleId: null,
      aiBadge: false,
      overlays: { cards: [card] },
    });
    const ov = plan.overlays!;
    const C = ov.cardLayout;
    const reel = ov.cards[0];
    expect(reel.scale).toBeLessThan(1);
    expect(C.fontSize).toBeLessThan(OVERLAY_CARD_LAYOUT.fontSize);
    const row = card.rows[0];
    const chars = row.text.length + row.value.length + 2;
    const right = reel.rows[0].x + C.iconWidth + chars * C.fontSize * C.charWidth;
    expect(right).toBeLessThanOrEqual(DEFAULT_ASS_DIMENSIONS.width - 36);

    const fsTags = overlayCardEvents(card)
      .map((e) => /\\fs(\d+)/.exec(e)?.[1])
      .filter(Boolean)
      .map(Number);
    expect(Math.max(...fsTags)).toBeLessThan(OVERLAY_CARD_LAYOUT.fontSize);
  });

  it("krótka karta zostaje w pełnym rozmiarze", () => {
    const plan = buildReelPlan({
      srt: null,
      styleId: null,
      aiBadge: false,
      overlays: {
        cards: [{ rows: [{ icon: "check", text: "Bez BIK" }], startSeconds: 1, endSeconds: 4 }],
      },
    });
    expect(plan.overlays!.cards[0].scale).toBe(1);
    expect(plan.overlays!.cardLayout).toBe(OVERLAY_CARD_LAYOUT);
  });

  it("puste SRT przy zamówionych napisach — błąd jak w caption-burnerze", () => {
    expect(() =>
      buildReelPlan({ srt: "", styleId: "reels", aiBadge: true, overlays: null }),
    ).toThrow(/SRT/);
    expect(() =>
      buildReelPlan({ srt: null, styleId: null, aiBadge: false, overlays: null }),
    ).toThrow(/Nie ma czego/);
  });
});

describe("silnik wykończenia", () => {
  it("nieznane wartości (np. avatar_iv) to auto, auto → ustawienie środowiska", () => {
    expect(parseRenderEngine("avatar_iv")).toBe("auto");
    expect(resolveRenderEngine("avatar_iv", undefined)).toBe("caption_burner");
    expect(resolveRenderEngine("auto", "remotion")).toBe("remotion");
    expect(resolveRenderEngine("caption_burner", "remotion")).toBe("caption_burner");
    expect(resolveRenderEngine("remotion", undefined)).toBe("remotion");
  });

  it("id renderu Remotion w caption_burn_id", () => {
    const id = remotionJobId("remotionlambda-eucentral1-abc", "r123");
    expect(parseRemotionJobId(id)).toEqual({
      bucketName: "remotionlambda-eucentral1-abc",
      renderId: "r123",
    });
    expect(parseRemotionJobId("8f2c-burner-id")).toBeNull();
    expect(parseRemotionJobId("remotion:bez-renderu")).toBeNull();
  });
});
