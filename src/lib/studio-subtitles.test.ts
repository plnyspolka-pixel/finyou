import { describe, it, expect } from "vitest";
import type { CharAlignment } from "./studio-narration";
import {
  cuesFromAlignment,
  cuesToSrt,
  formatSrtTime,
  shiftCues,
  wordsFromAlignment,
} from "./studio-subtitles";
import { parseSubtitles, srtToAss } from "./caption-style";

/**
 * Wyrównanie jak z ElevenLabs: każdy znak trwa `dt`, odstęp między zdaniami
 * (po kropce) ma dodatkową pauzę `pause`.
 */
function alignmentFor(text: string, dt = 0.05, pause = 0.5): CharAlignment {
  const characters = [...text];
  const starts: number[] = [];
  const ends: number[] = [];
  let t = 0;
  characters.forEach((ch, i) => {
    if (ch === " " && /[.!?…]$/.test(characters[i - 1] ?? "")) t += pause;
    starts.push(t);
    t += dt;
    ends.push(t);
  });
  return { characters, character_start_times_seconds: starts, character_end_times_seconds: ends };
}

describe("wordsFromAlignment", () => {
  it("składa znaki w słowa z czasem pierwszego i ostatniego znaku", () => {
    const words = wordsFromAlignment(alignmentFor("Wejdź na financeyou.pl"));
    expect(words.map((w) => w.text)).toEqual(["Wejdź", "na", "financeyou.pl"]);
    expect(words[0]).toMatchObject({ start: 0, end: 0.25 });
    expect(words[2].start).toBeCloseTo(0.45, 5);
    expect(words[2].end).toBeCloseTo(0.45 + 13 * 0.05, 5);
  });

  it("ignoruje puste wyrównanie i wielokrotne odstępy", () => {
    expect(wordsFromAlignment(alignmentFor(""))).toEqual([]);
    expect(wordsFromAlignment(alignmentFor("a  b\nc")).map((w) => w.text)).toEqual(["a", "b", "c"]);
  });
});

describe("cuesFromAlignment", () => {
  const script =
    "Jak stracić pieniądze, dając pożyczkę pod hipotekę? Najprostszy sposób: LTV powyżej stu procent. Obserwuj po więcej ciekawostek dla inwestorów, a po szczegóły wejdź na financeyou.pl";

  it("tekst napisów to dokładnie scenariusz — nic z rozpoznawania mowy", () => {
    const cues = cuesFromAlignment(alignmentFor(script));
    expect(cues.map((c) => c.text).join(" ")).toBe(script);
    expect(cues.some((c) => c.text.includes("financeyou.pl"))).toBe(true);
  });

  it("koniec zdania zamyka kwestię, limit znaków tnie dłuższe", () => {
    const cues = cuesFromAlignment(alignmentFor(script), { maxChars: 42 });
    for (const c of cues) expect(c.text.length).toBeLessThanOrEqual(42);
    const ends = cues.filter((c) => /[.?!]$/.test(c.text)).length;
    expect(ends).toBeGreaterThanOrEqual(2);
    expect(cues[0].text).toBe("Jak stracić pieniądze,");
  });

  it("czasy rosną, kwestie się nie nakładają i trzymają się czasów słów", () => {
    const cues = cuesFromAlignment(alignmentFor(script));
    for (let i = 0; i < cues.length; i++) {
      expect(cues[i].end).toBeGreaterThan(cues[i].start);
      if (i) expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].end);
    }
    const words = wordsFromAlignment(alignmentFor(script));
    expect(cues[0].start).toBe(words[0].start);
    const last = cues[cues.length - 1];
    expect(last.end).toBeCloseTo(words[words.length - 1].end + 0.25, 3);
  });

  it("dłuższa pauza między słowami zaczyna nową kwestię", () => {
    const a = alignmentFor("raz dwa trzy cztery");
    // Sztuczna dziura 1 s przed „trzy” (indeks 8).
    for (let i = 8; i < a.characters.length; i++) {
      a.character_start_times_seconds[i] += 1;
      a.character_end_times_seconds[i] += 1;
    }
    const cues = cuesFromAlignment(a, { maxGap: 0.6 });
    expect(cues.map((c) => c.text)).toEqual(["raz dwa", "trzy cztery"]);
  });
});

describe("shiftCues / SRT", () => {
  it("przesuwa kwestie o długość poprzednich scen", () => {
    const cues = shiftCues([{ start: 0.1, end: 1.2, text: "x" }], 12.345);
    expect(cues).toEqual([{ start: 12.445, end: 13.545, text: "x" }]);
  });

  it("formatuje czas jak SRT i zapisuje plik, który nasz parser czyta z powrotem", () => {
    expect(formatSrtTime(0)).toBe("00:00:00,000");
    expect(formatSrtTime(61.2345)).toBe("00:01:01,235");
    expect(formatSrtTime(3600 + 59.999)).toBe("01:00:59,999");
    const cues = cuesFromAlignment(alignmentFor("Wejdź na financeyou.pl. Zobacz Finance You."));
    const srt = cuesToSrt(cues);
    expect(srt.startsWith("1\n00:00:00,000 --> ")).toBe(true);
    expect(parseSubtitles(srt)).toEqual(cues);
  });

  it("cała droga: wyrównanie → SRT → ASS ma nazwę firmy ze scenariusza", () => {
    const srt = cuesToSrt(cuesFromAlignment(alignmentFor("Po szczegóły wejdź na financeyou.pl")));
    const ass = srtToAss(srt, "reels") ?? "";
    expect(ass).toContain("financeyou.pl");
    expect(ass).not.toMatch(/finansu|fajna/i);
  });
});
