// Napisy rolki z TEKSTU SCENARIUSZA i czasów znaków ElevenLabs — czysta
// logika (bez I/O, testowana w studio-subtitles.test.ts).
//
// DLACZEGO: wcześniej tekst napisów brał się z rozpoznawania mowy HeyGena,
// które przekręcało nazwę firmy („fajnasiu", „finansu.pl") i gubiło słowa.
// Lektor i tak powstaje u nas (ElevenLabs `/with-timestamps` oddaje czas
// początku i końca KAŻDEGO znaku), więc napisy budujemy z dokładnie tego
// tekstu, który zatwierdzono w panelu, z czasami prosto z syntezy. HeyGen
// dostaje gotowe audio i nie zamawiamy u niego żadnych napisów.
//
// Rolka ze scenami: jedno nagranie tniemy na sceny w pauzach (studio-narration),
// a HeyGen skleja sceny jedna za drugą — czasy z nagrania są więc czasami
// gotowego filmu. Przy syntezie per scena (zapas) kwestie każdej sceny
// przesuwamy o łączną długość poprzednich (`shiftCues`).

import type { SrtCue } from "./caption-style";
import type { CharAlignment } from "./studio-narration";

export type TimedWord = { text: string; start: number; end: number };

/** Słowa z czasami: znak po znaku, odstęp kończy słowo, interpunkcja zostaje przy słowie. */
export function wordsFromAlignment(a: CharAlignment): TimedWord[] {
  const chars = a.characters ?? [];
  const starts = a.character_start_times_seconds ?? [];
  const ends = a.character_end_times_seconds ?? [];
  const words: TimedWord[] = [];
  let text = "";
  let start = 0;
  let end = 0;
  const flush = () => {
    if (text) words.push({ text, start, end });
    text = "";
  };
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? "";
    if (/^\s*$/.test(ch)) {
      flush();
      continue;
    }
    const s = Number(starts[i]);
    const e = Number(ends[i]);
    if (!text) start = Number.isFinite(s) ? s : end;
    text += ch;
    if (Number.isFinite(e)) end = Math.max(end, e);
  }
  flush();
  return words;
}

export type CueBuildOptions = {
  /** Maks. znaków w jednej kwestii (styl tnie dalej na wiersze). */
  maxChars?: number;
  /** Pauza między słowami (s), po której zaczynamy nową kwestię. */
  maxGap?: number;
  /** O ile kwestia zostaje na ekranie po ostatnim słowie (s), jeśli jest miejsce. */
  tail?: number;
};

const SENTENCE_END = /[.!?…]["»”)]?$/;
const CLAUSE_END = /[,;:]["»”)]?$/;

/**
 * Grupuje słowa w kwestie: koniec zdania zamyka kwestię, przecinek — gdy
 * kwestia jest już w połowie długa, a poza tym limit znaków i dłuższa pauza.
 * Kwestia trwa od pierwszego słowa do ostatniego (+ krótki ogon, o ile nie
 * wchodzi na następną).
 */
export function cuesFromWords(words: TimedWord[], opts: CueBuildOptions = {}): SrtCue[] {
  const maxChars = Math.max(8, opts.maxChars ?? 42);
  const maxGap = opts.maxGap ?? 0.6;
  const tail = opts.tail ?? 0.25;

  type Group = { words: TimedWord[]; text: string };
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const w of words) {
    const prev = current?.words[current.words.length - 1];
    const breakBefore =
      !current ||
      !prev ||
      current.text.length + 1 + w.text.length > maxChars ||
      w.start - prev.end > maxGap ||
      SENTENCE_END.test(prev.text) ||
      (CLAUSE_END.test(prev.text) && current.text.length >= maxChars / 2);
    if (breakBefore || !current) {
      current = { words: [w], text: w.text };
      groups.push(current);
    } else {
      current.words.push(w);
      current.text += ` ${w.text}`;
    }
  }

  const cues: SrtCue[] = [];
  groups.forEach((g, i) => {
    const first = g.words[0];
    const last = g.words[g.words.length - 1];
    const next = groups[i + 1]?.words[0];
    const prevEnd = cues[cues.length - 1]?.end ?? 0;
    const start = Math.max(first.start, prevEnd);
    let end = last.end + tail;
    if (next) end = Math.min(end, Math.max(last.end, next.start - 0.02));
    if (end <= start) end = start + 0.3;
    cues.push({ start: round3(start), end: round3(end), text: g.text });
  });
  return cues;
}

/** Cała droga: wyrównanie znaków → kwestie. */
export function cuesFromAlignment(a: CharAlignment, opts: CueBuildOptions = {}): SrtCue[] {
  return cuesFromWords(wordsFromAlignment(a), opts);
}

/** Przesuwa kwestie w czasie (sceny syntezowane osobno, sklejone jedna za drugą). */
export function shiftCues(cues: SrtCue[], offsetSeconds: number): SrtCue[] {
  return cues.map((c) => ({
    ...c,
    start: round3(c.start + offsetSeconds),
    end: round3(c.end + offsetSeconds),
  }));
}

/** Jak `shiftCues`, dla słów. */
export function shiftWords(words: TimedWord[], offsetSeconds: number): TimedWord[] {
  return words.map((w) => ({
    ...w,
    start: round3(w.start + offsetSeconds),
    end: round3(w.end + offsetSeconds),
  }));
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const pad = (n: number, w: number) => String(n).padStart(w, "0");

/** `HH:MM:SS,mmm` jak w SRT. */
export function formatSrtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms % 1000, 3)}`;
}

/** Plik SRT z kwestii (kolejność czasowa, numeracja od 1). */
export function cuesToSrt(cues: SrtCue[]): string {
  const sorted = [...cues].filter((c) => c.text.trim()).sort((a, b) => a.start - b.start);
  return sorted
    .map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}\n`)
    .join("\n");
}
