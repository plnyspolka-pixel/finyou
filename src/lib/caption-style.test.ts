import { describe, it, expect } from "vitest";
import {
  CAPTION_STYLE_OPTIONS,
  AI_BADGE,
  CUSTOM_CAPTION_STYLES,
  aiBadgeAss,
  aiBadgeEvents,
  buildAss,
  captionPreviewCss,
  captionStyleLabel,
  chunkCues,
  isCustomCaptionStyle,
  layoutLines,
  parseCaptionStyleId,
  parseSrt,
  srtToAss,
} from "./caption-style";

const SRT = [
  "1",
  "00:00:00,000 --> 00:00:02,500",
  "To właśnie LTV, loan to",
  "",
  "2",
  "00:00:02,500 --> 00:00:05,000",
  "value — <i>stosunek</i> kwoty",
  "pożyczki do wartości.",
  "",
].join("\r\n");

const dialogues = (ass: string) => ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
const styleLine = (ass: string) => ass.split("\n").find((l) => l.startsWith("Style:"))!;

describe("parseSrt", () => {
  it("czyta CRLF, BOM, numery kwestii i wycina tagi", () => {
    const cues = parseSrt(`\uFEFF${SRT}`);
    expect(cues).toEqual([
      { start: 0, end: 2.5, text: "To właśnie LTV, loan to" },
      { start: 2.5, end: 5, text: "value — stosunek kwoty pożyczki do wartości." },
    ]);
  });

  it("akceptuje kropkę w milisekundach i brak numeru kwestii", () => {
    const cues = parseSrt(
      "00:01:02.250 --> 00:01:03.5\nDrugi\n\n00:00:01,000 --> 00:00:02,000\nPierwszy",
    );
    expect(cues.map((c) => c.text)).toEqual(["Pierwszy", "Drugi"]);
    expect(cues[1].start).toBeCloseTo(62.25, 3);
    expect(cues[1].end).toBeCloseTo(63.5, 3);
  });

  it("pomija puste kwestie i prostuje koniec przed początkiem", () => {
    const cues = parseSrt(
      "1\n00:00:01,000 --> 00:00:00,500\nX\n\n2\n00:00:03,000 --> 00:00:04,000\n<b></b>",
    );
    expect(cues).toEqual([{ start: 1, end: 1.5, text: "X" }]);
  });

  it("zwraca pustą listę dla śmieci", () => {
    expect(parseSrt("")).toEqual([]);
    expect(parseSrt("nie srt")).toEqual([]);
  });
});

describe("layoutLines / chunkCues", () => {
  it("łamie po słowach do limitu znaków, długie słowo zostaje samo", () => {
    expect(layoutLines("Pożyczka pod zastaw nieruchomości to", 18)).toEqual([
      "Pożyczka pod",
      "zastaw",
      "nieruchomości to",
    ]);
    expect(layoutLines("superkalifragilistyczny tak", 10)).toEqual([
      "superkalifragilistyczny",
      "tak",
    ]);
  });

  it("wyrównuje dwa wiersze, żeby nie zostawiać sieroty", () => {
    const [cue] = chunkCues([{ start: 0, end: 2, text: "Pożyczka pod zastaw nieruchomości to" }], {
      maxChars: 22,
      maxLines: 2,
    });
    expect(cue.text).toBe("Pożyczka pod zastaw\nnieruchomości to");
  });

  it("dzieli długą kwestię na porcje z czasem proporcjonalnym do znaków", () => {
    const out = chunkCues([{ start: 10, end: 14, text: "aaaa bbbb cccc dddd" }], {
      maxChars: 9,
      maxLines: 1,
    });
    expect(out.map((c) => c.text)).toEqual(["aaaa bbbb", "cccc dddd"]);
    expect(out[0]).toMatchObject({ start: 10, end: 12 });
    expect(out[1]).toMatchObject({ start: 12, end: 14 });
  });

  it("przy dwóch wierszach na porcję tnie dopiero co drugi wiersz", () => {
    const out = chunkCues([{ start: 0, end: 3, text: "aa bb cc dd ee ff" }], {
      maxChars: 5,
      maxLines: 2,
    });
    expect(out.map((c) => c.text)).toEqual(["aa bb\ncc dd", "ee ff"]);
    // Czas proporcjonalny do znaków: 11 z 16 znaków → 3 s × 11/16.
    expect(out[0].end).toBeCloseTo((3 * 11) / 16, 5);
  });
});

describe("buildAss", () => {
  const cue = { start: 1, end: 2.5, text: "To właśnie LTV\nloan to value" };

  it("wpisuje kadr, styl i zdarzenia z łamaniem \\N", () => {
    const ass = buildAss([cue], CUSTOM_CAPTION_STYLES.reels);
    expect(ass).toContain("PlayResX: 720");
    expect(ass).toContain("PlayResY: 1280");
    expect(ass).toContain("WrapStyle: 2");
    const style = styleLine(ass).split(",");
    expect(style[1]).toBe("Inter");
    expect(style[2]).toBe("60");
    expect(style[3]).toBe("&H00FFFFFF"); // biały, kryjący
    expect(style[5]).toBe("&H00000000"); // czarny obrys
    expect(style[7]).toBe("-1"); // bold
    expect(style[15]).toBe("1"); // BorderStyle: obrys
    expect(style[18]).toBe("2"); // Alignment: dół, środek
    expect(style[21]).toBe("380"); // MarginV
    expect(dialogues(ass)).toEqual([
      "Dialogue: 0,0:00:01.00,0:00:02.50,Cap,,0,0,0,,To właśnie LTV\\Nloan to value",
    ]);
  });

  it("ramka: BorderStyle 3 i półprzezroczyste tło", () => {
    const style = styleLine(buildAss([cue], CUSTOM_CAPTION_STYLES.box)).split(",");
    expect(style[15]).toBe("3");
    // 0.78 krycia → alfa ≈ 56 (0x38), kolor #0B1220 → BGR 20120B
    expect(style[6]).toBe("&H3820120B");
  });

  it("wielkie litery i neutralizacja klamer / backslasha", () => {
    const ass = buildAss([{ start: 0, end: 1, text: "łódź {x} a\\b" }], {
      ...CUSTOM_CAPTION_STYLES.reels,
      uppercase: true,
      highlight: null,
    });
    expect(dialogues(ass)[0]).toContain(",,ŁÓDŹ (X) A/B");
  });

  it("podświetlanie słów: zdarzenie na słowo, czasy się stykają", () => {
    const ass = buildAss([{ start: 0, end: 1, text: "Ala ma kota" }], {
      ...CUSTOM_CAPTION_STYLES.tiktok,
      uppercase: false,
    });
    const ev = dialogues(ass);
    expect(ev).toHaveLength(3);
    // wagi 3/2/4 z 9 → granice 0.33 i 0.56
    expect(ev[0]).toBe(
      "Dialogue: 0,0:00:00.00,0:00:00.33,Cap,,0,0,0,,{\\1c&H00D4FF&}Ala{\\1c&HFFFFFF&} ma kota",
    );
    expect(ev[1]).toContain("0:00:00.33,0:00:00.56");
    expect(ev[1]).toContain("Ala {\\1c&H00D4FF&}ma{\\1c&HFFFFFF&} kota");
    expect(ev[2]).toContain("0:00:00.56,0:00:01.00");
    expect(ev[2]).toContain("Ala ma {\\1c&H00D4FF&}kota{\\1c&HFFFFFF&}");
  });

  it("podświetlanie zachowuje układ wierszy", () => {
    const ass = buildAss([{ start: 0, end: 1, text: "Ala ma\nkota" }], {
      ...CUSTOM_CAPTION_STYLES.tiktok,
      uppercase: false,
    });
    expect(dialogues(ass)[2]).toContain(",,Ala ma\\N{\\1c&H00D4FF&}kota{\\1c&HFFFFFF&}");
  });

  it("jedno słowo z podświetlaniem = zwykłe zdarzenie", () => {
    const ass = buildAss([{ start: 0, end: 1, text: "Cześć" }], CUSTOM_CAPTION_STYLES.tiktok);
    expect(dialogues(ass)).toEqual(["Dialogue: 0,0:00:00.00,0:00:01.00,Cap,,0,0,0,,CZEŚĆ"]);
  });

  it("czas powyżej godziny formatuje się poprawnie", () => {
    const ass = buildAss(
      [{ start: 3661.257, end: 3662, text: "x" }],
      CUSTOM_CAPTION_STYLES.minimal,
    );
    expect(dialogues(ass)[0]).toContain("1:01:01.26,1:01:02.00");
  });
});

describe("srtToAss", () => {
  it("składa całość dla presetu i tnie długie kwestie", () => {
    const ass = srtToAss(SRT, "reels")!;
    expect(ass).toContain("[Events]");
    const ev = dialogues(ass);
    // Druga kwestia (44 znaki) nie mieści się w 2×18 → dwie porcje.
    expect(ev.length).toBe(3);
    // Dwa wiersze wyrównane długością: „To właśnie / LTV, loan to”.
    expect(ev[0]).toContain("To właśnie\\NLTV, loan to");
  });

  it("null, gdy SRT nie ma kwestii", () => {
    expect(srtToAss("", "reels")).toBeNull();
  });
});

describe("identyfikatory stylów", () => {
  it("nieznana wartość = heygen; własne style rozpoznawane", () => {
    expect(parseCaptionStyleId(undefined)).toBe("heygen");
    expect(parseCaptionStyleId("cokolwiek")).toBe("heygen");
    expect(parseCaptionStyleId("tiktok")).toBe("tiktok");
    expect(isCustomCaptionStyle("heygen")).toBe(false);
    expect(isCustomCaptionStyle("box")).toBe(true);
    expect(captionStyleLabel("reels")).toBe(CUSTOM_CAPTION_STYLES.reels.label);
    expect(captionStyleLabel(null)).toBe("HeyGen (domyślne)");
    expect(CAPTION_STYLE_OPTIONS[0].id).toBe("heygen");
    expect(CAPTION_STYLE_OPTIONS).toHaveLength(5);
  });

  it("podgląd CSS: ramka daje tło, obrys daje cień tekstu", () => {
    expect(captionPreviewCss(CUSTOM_CAPTION_STYLES.box).background).toMatch(
      /^rgba\(11, 18, 32, 0.78\)$/,
    );
    expect(captionPreviewCss(CUSTOM_CAPTION_STYLES.reels).textShadow).toContain("#000000");
    expect(captionPreviewCss(CUSTOM_CAPTION_STYLES.tiktok).textTransform).toBe("uppercase");
  });
});

describe("znaczek AI", () => {
  it("sam znaczek: kompletny ASS z pigułką i napisem AI przez cały film", () => {
    const ass = aiBadgeAss();
    expect(ass).toMatch(/\[Events\]/);
    expect(ass).toMatch(/^Style: AiBadge,Inter,/m);
    const events = dialogues(ass);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatch(/\\p1/);
    expect(events[0]).toMatch(/,9:59:59\.99,AiBadge,/);
    expect(events[1]).toMatch(/\}AI$/);
  });

  it("pigułka w prawym górnym rogu, poniżej paska aplikacji", () => {
    const [shape, label] = aiBadgeEvents({ width: 720, height: 1280 });
    const x = 720 - AI_BADGE.marginRight - AI_BADGE.width;
    expect(shape).toContain(`\\pos(${x},${AI_BADGE.marginTop})`);
    expect(label).toContain(
      `\\pos(${x + AI_BADGE.width / 2},${AI_BADGE.marginTop + AI_BADGE.height / 2})`,
    );
    expect(AI_BADGE.marginTop).toBeGreaterThanOrEqual(110);
  });

  it("napisy własne + znaczek: oba style, znaczek na wyższej warstwie", () => {
    const ass = srtToAss(SRT, "reels", undefined, { aiBadge: true })!;
    expect(ass.split("\n").filter((l) => l.startsWith("Style:"))).toHaveLength(2);
    const events = dialogues(ass);
    const badge = events.filter((l) => l.includes(",AiBadge,"));
    expect(badge).toHaveLength(2);
    expect(badge.every((l) => Number(l.split(",")[0].split(" ")[1]) > 0)).toBe(true);
  });

  it("bez opcji nic się nie zmienia", () => {
    expect(srtToAss(SRT, "reels")).not.toContain("AiBadge");
  });
});
