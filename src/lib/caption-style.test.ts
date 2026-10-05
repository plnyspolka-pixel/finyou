import { describe, it, expect } from "vitest";
import {
  CAPTION_STYLE_OPTIONS,
  AI_BADGE,
  CUSTOM_CAPTION_STYLES,
  aiBadgeAss,
  aiBadgeEvents,
  buildAss,
  defaultCaptionStyle,
  dynamicOverlayEvents,
  extrasAss,
  overlaysWithCueTiming,
  parseSubtitles,
  captionPreviewCss,
  captionStyleLabel,
  chunkCues,
  isCustomCaptionStyle,
  layoutLines,
  parseCaptionStyleId,
  parseSrt,
  srtToAss,
  type DynamicOverlays,
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
  it("nieznana wartość (także stare „heygen”) = styl domyślny; style rozpoznawane", () => {
    expect(parseCaptionStyleId(undefined)).toBe("reels");
    expect(parseCaptionStyleId("cokolwiek")).toBe("reels");
    expect(parseCaptionStyleId("heygen")).toBe("reels");
    expect(parseCaptionStyleId("tiktok")).toBe("tiktok");
    expect(isCustomCaptionStyle("heygen")).toBe(false);
    expect(isCustomCaptionStyle("box")).toBe(true);
    expect(captionStyleLabel("reels")).toBe(CUSTOM_CAPTION_STYLES.reels.label);
    expect(captionStyleLabel("heygen")).toBe("HeyGen (dawne)");
    expect(captionStyleLabel(null)).toBe("nieznany styl");
    expect(CAPTION_STYLE_OPTIONS.map((o) => o.id)).toEqual(["reels", "tiktok", "box", "minimal"]);
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
    // Dyskretnie: mocno przezroczyste wypełnienie (30%), ramka i napis też.
    expect(events[0]).toContain("\\1a&HB3&");
    expect(events[0]).toContain("\\3a&H78&");
    expect(events[1]).toContain("\\1a&H38&");
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

describe("nakładki dynamiczne", () => {
  const OVERLAYS: DynamicOverlays = {
    tag: "PRYWATNE POŻYCZKI\nPOD ZASTAW NIERUCHOMOŚCI",
    tagHoldSeconds: 1.2,
    headline: "Czym jest pożyczka prywatna?",
    headlineStartSeconds: 0.8,
    headlineEndSeconds: 6,
  };

  it("znacznik w dwóch fazach: animacja zmniejszenia, potem mały u góry do końca", () => {
    const [big, small] = dynamicOverlayEvents(OVERLAYS).filter((l) => l.includes(",OvTag,"));
    expect(big).toMatch(/^Dialogue: 3,0:00:00\.00,0:00:01\.20,OvTag,/);
    expect(big).toContain("\\move(360,400,360,150,800,1200)");
    expect(big).toContain("\\t(800,1200,\\fscx42\\fscy42)");
    expect(big).toContain("PRYWATNE POŻYCZKI\\NPOD ZASTAW NIERUCHOMOŚCI");
    // Połysk złota: rozjaśnienie (gold-600) i powrót do gold-500.
    expect(big).toContain("\\t(0,700,\\1c&H6FCEEF&)");
    expect(big).toContain("\\t(700,1400,\\1c&H4ABEEA&)");
    expect(small).toMatch(/^Dialogue: 3,0:00:01\.20,9:59:59\.99,OvTag,/);
    expect(small).toContain("\\pos(360,150)\\fscx42\\fscy42");
  });

  it("pytanie na środku od startu do końca kwestii, z \\fad, błyskiem i łamaniem wierszy", () => {
    const head = dynamicOverlayEvents(OVERLAYS).find((l) => l.includes(",OvHead,"))!;
    expect(head).toMatch(/^Dialogue: 4,0:00:00\.80,0:00:06\.00,OvHead,/);
    expect(head).toContain("\\pos(360,640)");
    expect(head).toContain("\\fad(160,200)");
    // Złoty błysk po pojawieniu się, potem czysta biel.
    expect(head).toContain("\\t(850,1500,\\1c&HFFFFFF&)");
    expect(head).toContain("Czym jest pożyczka\\Nprywatna?");
  });

  it("szata graficzna strony: złoto na granatowej plakietce i niebieska poświata", () => {
    const events = dynamicOverlayEvents(OVERLAYS);
    expect(events).toHaveLength(6);
    const glows = events.filter((l) => l.includes(",OvGlow,"));
    expect(glows).toHaveLength(3);
    expect(glows.every((l) => l.startsWith("Dialogue: 2,"))).toBe(true);
    // Poświata = niewidoczne wypełnienie + rozmyty obrys akcentu #4F8BF0.
    expect(
      glows.every(
        (l) => l.includes("\\1a&HFF&") && l.includes("\\blur") && l.includes("\\3c&HF08B4F&"),
      ),
    ).toBe(true);
  });

  it("overlaysWithCueTiming: koniec pytania z kwestii SRT, w której pada", () => {
    const cues = [
      { start: 0, end: 2.8, text: "Prywatne pożyczki pod zastaw nieruchomości." },
      { start: 2.8, end: 4.6, text: "Czym jest pożyczka prywatna?" },
      { start: 4.6, end: 8, text: "To pożyczka udzielana poza typowym kredytem bankowym." },
    ];
    expect(overlaysWithCueTiming(OVERLAYS, cues).headlineEndSeconds).toBeCloseTo(4.85, 5);
    // Pytanie podzielone między kwestie też się dopasowuje (podciąg słów).
    const split = [
      { start: 0, end: 3, text: "Prywatne pożyczki. Czym jest" },
      { start: 3, end: 5, text: "pożyczka prywatna? To ważne." },
    ];
    expect(overlaysWithCueTiming(OVERLAYS, split).headlineEndSeconds).toBeCloseTo(5.25, 5);
    // Bez dopasowania zostaje szacunek.
    expect(
      overlaysWithCueTiming(OVERLAYS, [{ start: 0, end: 2, text: "zupełnie inny tekst" }])
        .headlineEndSeconds,
    ).toBe(6);
  });

  it("srtToAss dokłada style OvTag/OvHead/OvGlow i zdarzenia nakładek do napisów", () => {
    const ass = srtToAss(SRT, "reels", undefined, { aiBadge: true, overlays: OVERLAYS })!;
    const styles = ass.split("\n").filter((l) => l.startsWith("Style:"));
    expect(styles.map((s) => s.split(",")[0])).toEqual([
      "Style: Cap",
      "Style: OvTag",
      "Style: OvHead",
      "Style: OvGlow",
      "Style: OvCard",
      "Style: AiBadge",
    ]);
    // Plakietka znacznika: złoty tekst (#EABE4A), BorderStyle 3 (plakietka).
    const tagStyle = styles.find((s) => s.startsWith("Style: OvTag"))!.split(",");
    expect(tagStyle[3]).toBe("&H004ABEEA");
    expect(tagStyle[15]).toBe("3");
    expect(dialogues(ass).filter((l) => l.includes(",OvTag,"))).toHaveLength(2);
    expect(dialogues(ass).filter((l) => l.includes(",OvHead,"))).toHaveLength(1);
    expect(dialogues(ass).filter((l) => l.includes(",OvGlow,"))).toHaveLength(3);
  });

  it("extrasAss: same nakładki (bez znaczka), oba naraz i null, gdy nic", () => {
    const only = extrasAss({ overlays: OVERLAYS })!;
    expect(only).toContain("OvTag");
    expect(only).not.toContain("AiBadge");
    const both = extrasAss({ aiBadge: true, overlays: OVERLAYS })!;
    expect(both).toContain("OvTag");
    expect(both).toContain("AiBadge");
    expect(extrasAss({})).toBeNull();
  });

  const CARD = {
    title: "ZANIM ZDECYDUJESZ",
    rows: [
      { icon: "check" as const, text: "Umowa pożyczki" },
      { icon: "check" as const, text: "Księga wieczysta (KW)" },
      { icon: "check" as const, text: "Aktualne saldo", value: "LTV 60%" },
    ],
    startSeconds: 20,
    endSeconds: null,
    syncText: "Najpierw sprawdź umowę, KW i aktualne saldo.",
  };

  it("karta: poświata + panel + nagłówek + wiersze odsłaniane po kolei", () => {
    const events = dynamicOverlayEvents({ ...OVERLAYS, cards: [CARD] });
    expect(events).toHaveLength(6 + 2 + 1 + 3);
    const card = events.slice(6);
    // Panel: rysunek ASS (\p1) z granatowym wypełnieniem i krawędzią strony.
    expect(card[1]).toContain("\\p1");
    expect(card[1]).toContain("\\1c&H38160D&");
    expect(card[1]).toContain("\\3c&HD67C54&");
    expect(card[1]).toMatch(/,0:00:20\.00,9:59:59\.99,OvCard,/);
    // Nagłówek złoty, rozstrzelony.
    expect(card[2]).toContain("\\1c&H4ABEEA&");
    expect(card[2]).toContain("ZANIM ZDECYDUJESZ");
    // Wiersze: złoty ptaszek, biały tekst, starty rosną co revealStagger.
    const rows = card.slice(3);
    expect(rows[0]).toContain("}✓\\h\\h{\\1c&HFFFFFF&}Umowa pożyczki");
    expect(rows[0]).toContain(",0:00:20.25,");
    expect(rows[1]).toContain(",0:00:20.70,");
    expect(rows[2]).toContain(",0:00:21.15,");
    // Wartość po prawej — złota.
    expect(rows[2]).toContain("Aktualne saldo\\h\\h{\\1c&H4ABEEA&}LTV 60%");
  });

  it("overlaysWithCueTiming: start karty z kwestii CTA, bez dopasowania karta wypada", () => {
    const cues = [
      { start: 0, end: 4, text: "Czym jest pożyczka prywatna? To pożyczka udzielana" },
      { start: 4, end: 19.4, text: "poza typowym kredytem bankowym. Masz konkretną sytuację?" },
      { start: 19.4, end: 23, text: "Najpierw sprawdź umowę, KW i aktualne saldo." },
    ];
    const synced = overlaysWithCueTiming({ ...OVERLAYS, cards: [CARD] }, cues);
    expect(synced.cards).toHaveLength(1);
    expect(synced.cards![0].startSeconds).toBe(19.4);
    // CTA zmienione w panelu → tekst nie pada → karta znika, reszta zostaje.
    const dropped = overlaysWithCueTiming({ ...OVERLAYS, cards: [CARD] }, [
      { start: 0, end: 5, text: "Zupełnie inne zakończenie rolki." },
    ]);
    expect(dropped.cards).toHaveLength(0);
    // Karta bez syncText przechodzi bez zmian.
    const manual = overlaysWithCueTiming({ ...OVERLAYS, cards: [{ ...CARD, syncText: null }] }, [
      { start: 0, end: 5, text: "Cokolwiek." },
    ]);
    expect(manual.cards![0].startSeconds).toBe(20);
  });

  it("neutralizuje klamry i backslash w tekstach nakładek", () => {
    const big = dynamicOverlayEvents({ ...OVERLAYS, tag: "A {x} \\ B" }).find((l) =>
      l.includes(",OvTag,"),
    )!;
    expect(big).toContain("}A (x) / B");
  });
});

describe("parseSubtitles — formaty napisów HeyGena", () => {
  it("ASS (filmy spoza Studia): czasy z Dialogue, bez tagów i łamań", () => {
    const ass = [
      "[Script Info]",
      "ScriptType: v4.00+",
      "",
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      "Dialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,{\\b1}LTV, czyli{\\b0}\\Nstosunek kwoty",
      "Dialogue: 0,0:00:00.00,0:00:01.50,Default,,0,0,0,,Cześć!",
    ].join("\r\n");
    expect(parseSubtitles(ass)).toEqual([
      { start: 0, end: 1.5, text: "Cześć!" },
      { start: 1.5, end: 3, text: "LTV, czyli stosunek kwoty" },
    ]);
  });

  it("WebVTT z czasem bez godzin", () => {
    const vtt = "WEBVTT\n\n00:01.000 --> 00:02.500\nKsięga wieczysta\n";
    expect(parseSubtitles(vtt)).toEqual([{ start: 1, end: 2.5, text: "Księga wieczysta" }]);
  });

  it("SRT bez zmian", () => {
    expect(parseSubtitles(SRT)).toEqual(parseSrt(SRT));
  });

  it("srtToAss przyjmuje też ASS z HeyGena", () => {
    const ass =
      "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" +
      "Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,Pożyczka pod zastaw";
    expect(dialogues(srtToAss(ass, "reels")!)).toHaveLength(1);
  });
});

describe("defaultCaptionStyle", () => {
  it("zawsze własny styl jak w panelu — napisów HeyGena nie ma", () => {
    expect(defaultCaptionStyle()).toBe("reels");
  });
});
