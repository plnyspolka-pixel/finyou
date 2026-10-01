import { describe, it, expect } from "vitest";
import {
  base64ToBytes,
  joinNarration,
  narrationCutTimes,
  parseMp3Frames,
  splitMp3AtTimes,
  type CharAlignment,
} from "./studio-narration";

// Ramka MPEG-1 Layer III, 128 kbps, 44.1 kHz, bez paddingu: 417 B, 1152 próbki.
const FRAME_LEN = 417;
const FRAME_SEC = 1152 / 44100;

function frame(fill: number): Uint8Array {
  const f = new Uint8Array(FRAME_LEN).fill(fill);
  f.set([0xff, 0xfb, 0x90, 0x64]);
  return f;
}

function mp3(frames: number, prefix: Uint8Array = new Uint8Array()): Uint8Array {
  const out = new Uint8Array(prefix.length + frames * FRAME_LEN);
  out.set(prefix);
  for (let i = 0; i < frames; i++) out.set(frame(i % 200), prefix.length + i * FRAME_LEN);
  return out;
}

/** Wyrównanie: każdy znak trwa `dt`, spacja między scenami trwa `gap`. */
function alignmentFor(segments: string[], dt = 0.05, gap = 0.4): CharAlignment {
  const chars = [...joinNarration(segments)];
  const starts: number[] = [];
  const ends: number[] = [];
  let t = 0;
  let seg = 0;
  let inSeg = 0;
  for (const c of chars) {
    const isJoin = inSeg === segments[seg]?.length;
    const len = isJoin ? gap : dt;
    starts.push(t);
    ends.push(t + len);
    t += len;
    if (isJoin) {
      seg++;
      inSeg = 0;
    } else inSeg++;
    void c;
  }
  return {
    characters: chars,
    character_start_times_seconds: starts,
    character_end_times_seconds: ends,
  };
}

describe("narrationCutTimes", () => {
  it("tnie w środku pauzy między scenami", () => {
    const segments = ["Ala ma kota.", "Kot ma Alę."];
    const cuts = narrationCutTimes(segments, alignmentFor(segments));
    // 12 znaków × 0.05 s, potem 0.4 s pauzy → środek pauzy 0.6 + 0.2.
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toBeCloseTo(0.8, 5);
  });

  it("daje n-1 rosnących cięć", () => {
    const segments = ["Raz.", "Dwa.", "Trzy.", "Cztery."];
    const cuts = narrationCutTimes(segments, alignmentFor(segments));
    expect(cuts).toHaveLength(3);
    expect([...cuts].sort((a, b) => a - b)).toEqual(cuts);
  });

  it("odrzuca wyrównanie innego tekstu", () => {
    const a = alignmentFor(["Inny tekst."]);
    expect(() => narrationCutTimes(["Ala.", "Kot."], a)).toThrow();
  });
});

describe("parseMp3Frames", () => {
  it("czyta ramki i pomija tag ID3", () => {
    const id3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 5, 1, 2, 3, 4, 5]);
    const frames = parseMp3Frames(mp3(10, id3));
    expect(frames).toHaveLength(10);
    expect(frames[0].offset).toBe(id3.length);
    expect(frames[0].length).toBe(FRAME_LEN);
  });

  it("pomija ramkę nagłówka Xing (opisuje cały plik)", () => {
    const bytes = mp3(5);
    bytes.set(new TextEncoder().encode("Xing"), 36);
    expect(parseMp3Frames(bytes)).toHaveLength(4);
  });
});

describe("splitMp3AtTimes", () => {
  it("dzieli po granicach ramek bez gubienia bajtów", () => {
    const bytes = mp3(100);
    const pieces = splitMp3AtTimes(bytes, [30 * FRAME_SEC, 70 * FRAME_SEC]);
    expect(pieces.map((p) => p.length / FRAME_LEN)).toEqual([30, 40, 30]);
    const total = pieces.reduce((n, p) => n + p.length, 0);
    expect(total).toBe(bytes.length);
    for (const p of pieces) expect(parseMp3Frames(p).length).toBe(p.length / FRAME_LEN);
  });

  it("nie zostawia sceny bez dźwięku", () => {
    expect(() => splitMp3AtTimes(mp3(10), [0.0001])).toThrow();
  });
});

describe("base64ToBytes", () => {
  it("dekoduje", () => {
    expect([...base64ToBytes("AQID")]).toEqual([1, 2, 3]);
  });
});
