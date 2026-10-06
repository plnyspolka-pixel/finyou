import { describe, expect, it } from "vitest";
import { overlaysWithCueTiming, type SrtCue } from "./caption-style";
import {
  sanitizeOverlayElements,
  scheduleCardsAndElements,
  type OverlayElement,
} from "./overlay-elements";

const cues: SrtCue[] = [
  { start: 0, end: 2, text: "Bank odmówił ci kredytu bo masz wpis w BIK" },
  { start: 2, end: 5, text: "U nas decyzja w dwadzieścia cztery godziny" },
  { start: 5, end: 8, text: "Najpierw wycena potem umowa na końcu pieniądze" },
  { start: 8, end: 10, text: "Zadzwoń do Finance You i sprawdź ofertę" },
];

describe("sanitizeOverlayElements", () => {
  it("przyjmuje tylko elementy z sync i kompletem pól, przycina i limituje", () => {
    const out = sanitizeOverlayElements([
      {
        kind: "stat",
        value: "24 h",
        label: "decyzja",
        sync: "decyzja w dwadzieścia cztery godziny",
      },
      { kind: "stat", value: "", label: "x", sync: "a b c d" },
      { kind: "steps", steps: ["Wycena"], sync: "najpierw wycena potem umowa" },
      {
        kind: "steps",
        steps: ["Wycena", "Umowa", "Pieniądze"],
        sync: "najpierw wycena potem umowa",
      },
      {
        kind: "cta",
        text: "Zadzwoń do Finance You teraz i od razu",
        sync: "zadzwoń do finance you",
      },
      { kind: "sticker", text: "BEZ BIK", sync: "za mało" },
      { kind: "bars", bars: [{ label: "Bank", value: 12 }], sync: "a b c d" },
      { kind: "quote", text: "Tak", sync: "a b c d" },
      { kind: "nieznany", sync: "a b c d" },
      {
        kind: "compare",
        left: { title: "Bank", rows: ["6 tygodni"] },
        right: { title: "My", rows: ["24 h"] },
        sync: "bank odmówił ci kredytu",
      },
      { kind: "lowerThird", name: "Filip", role: "doradca", sync: "u nas decyzja w" },
    ]);
    expect(out.map((e) => e.kind)).toEqual(["stat", "steps", "cta", "compare"]);
    expect((out[2] as { text: string }).text).toHaveLength(24);
  });
});

describe("overlaysWithCueTiming z elementami", () => {
  it("ustawia starty z SRT, wyrzuca bez dopasowania i zamyka otwarte przed następnym", () => {
    const elements = sanitizeOverlayElements([
      { kind: "sticker", text: "BEZ BIK", sync: "masz wpis w BIK" },
      {
        kind: "steps",
        steps: ["Wycena", "Umowa", "Pieniądze"],
        sync: "najpierw wycena potem umowa",
      },
      { kind: "cta", text: "Zadzwoń", sync: "zadzwoń do finance you" },
      { kind: "quote", text: "tego nie ma w nagraniu wcale", sync: "tego nie ma w nagraniu" },
    ]);
    const out = overlaysWithCueTiming(
      {
        elements,
        cards: [
          {
            title: "U NAS",
            rows: [{ icon: "check", text: "24 h" }],
            startSeconds: 99,
            endSeconds: null,
            syncText: "u nas decyzja w",
          },
        ],
      },
      cues,
    );
    expect(out.elements!.map((e) => e.kind)).toEqual(["sticker", "steps", "cta"]);
    const [sticker, steps, cta] = out.elements!;
    expect(sticker.startSeconds).toBe(0);
    // Pieczątka kończy się przed kartą (start 2 s), nie przed krokami.
    expect(sticker.endSeconds).toBeCloseTo(2, 5);
    expect(out.cards![0].startSeconds).toBe(2);
    expect(out.cards![0].endSeconds).toBeCloseTo(4.7, 5);
    expect(steps.startSeconds).toBe(5);
    expect(steps.endSeconds).toBeCloseTo(7.7, 5);
    expect(cta.startSeconds).toBe(8);
    expect(cta.endSeconds).toBeNull();
  });

  it("belka lowerThird nie bierze udziału w kolejce", () => {
    const lower: OverlayElement = {
      kind: "lowerThird",
      name: "Filip",
      role: "doradca",
      startSeconds: 1,
      endSeconds: null,
    };
    const stat: OverlayElement = {
      kind: "stat",
      value: "24 h",
      label: "decyzja",
      startSeconds: 3,
      endSeconds: null,
    };
    const { elements } = scheduleCardsAndElements([], [lower, stat]);
    expect(elements.find((e) => e.kind === "lowerThird")!.endSeconds).toBeNull();
    expect(elements.find((e) => e.kind === "stat")!.endSeconds).toBeNull();
  });
});
