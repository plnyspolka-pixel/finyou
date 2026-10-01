// Lektor rolki jednym ciągiem.
//
// Rolka ze scenami (przebitki / struktura) potrzebuje osobnego audio na każdą
// scenę — HeyGen liczy długość sceny z jej nagrania. Dawniej każda scena
// szła do ElevenLabs osobno i głos „skakał" na złączeniach (inne tempo,
// intonacja zaczynana od nowa). Teraz cały scenariusz syntezujemy JEDNYM
// wywołaniem z czasami znaków, a potem tniemy gotowe MP3 w pauzach między
// scenami. Prozodia pochodzi z jednej generacji, sceny tylko ją dzielą.
//
// Wszystko tu jest czyste (bez sieci) — testowalne w vitest.

/** Ustawienia głosu dla lektora rolek: stabilnie, bez podkręconej ekspresji. */
export const NARRATION_VOICE_SETTINGS = {
  // Wyżej = mniej losowej zmienności tempa; 0.5 bywa za nisko na dłuższy tekst.
  stability: 0.72,
  // Trzyma barwę i rytm spójne na całym scenariuszu.
  similarity_boost: 0.8,
  // Nisko — „żywość" emocjonalna psuje równe tempo.
  style: 0.15,
  use_speaker_boost: true,
  speed: 1.0,
} as const;

/** Wyrównanie znaków z ElevenLabs (`/with-timestamps`). */
export type CharAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

/** Tekst wysyłany do syntezy — sceny sklejone spacją (jak w scenariuszu). */
export function joinNarration(segments: string[]): string {
  return segments.join(" ");
}

/**
 * Momenty cięcia (sekundy) między kolejnymi scenami: środek pauzy między
 * końcem ostatniego znaku sceny a początkiem pierwszego znaku następnej.
 * Zwraca segments.length - 1 rosnących czasów.
 */
export function narrationCutTimes(segments: string[], alignment: CharAlignment): number[] {
  const text = joinNarration(segments);
  const {
    characters,
    character_start_times_seconds: starts,
    character_end_times_seconds: ends,
  } = alignment;
  if (
    characters.join("") !== text ||
    starts.length !== text.length ||
    ends.length !== text.length
  ) {
    throw new Error("Wyrównanie lektora nie pasuje do tekstu scenariusza.");
  }

  const cuts: number[] = [];
  let offset = 0;
  for (let i = 0; i < segments.length - 1; i++) {
    const lastChar = offset + segments[i].length - 1;
    const nextStart = offset + segments[i].length + 1; // +1 = spacja łącząca
    const t = (ends[lastChar] + starts[nextStart]) / 2;
    if (!Number.isFinite(t) || (cuts.length && t <= cuts[cuts.length - 1])) {
      throw new Error("Wyrównanie lektora ma nierosnące czasy.");
    }
    cuts.push(t);
    offset = nextStart;
  }
  return cuts;
}

// ── MP3 ─────────────────────────────────────────────────────────────────────

type Mp3Frame = { offset: number; length: number; duration: number };

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

/** Nagłówek ramki MPEG Layer III pod `i`; null = to nie jest ramka. */
function readFrame(bytes: Uint8Array, i: number): Mp3Frame | null {
  if (i + 4 > bytes.length) return null;
  if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) return null;
  const version = (bytes[i + 1] >> 3) & 0b11;
  const layer = (bytes[i + 1] >> 1) & 0b11;
  if (version === 1 || layer !== 0b01) return null; // zarezerwowane / nie Layer III
  const bitrateIdx = bytes[i + 2] >> 4;
  const srIdx = (bytes[i + 2] >> 2) & 0b11;
  if (bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) return null;
  const padding = (bytes[i + 2] >> 1) & 1;
  const mpeg1 = version === 3;
  const bitrate = (mpeg1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIdx] * 1000;
  const sampleRate = SAMPLE_RATES[version][srIdx];
  const samples = mpeg1 ? 1152 : 576;
  const length = Math.floor(((samples / 8) * bitrate) / sampleRate) + padding;
  return { offset: i, length, duration: samples / sampleRate };
}

/** Rozmiar tagu ID3v2 na początku pliku (0, gdy go nie ma). */
function id3Size(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
  return 10 + size + (bytes[5] & 0x10 ? 10 : 0);
}

/** Ramka Xing/Info/VBRI opisuje CAŁY plik — w kawałku podałaby złą długość. */
function isVbrHeaderFrame(bytes: Uint8Array, f: Mp3Frame): boolean {
  const body = new TextDecoder("latin1").decode(bytes.subarray(f.offset, f.offset + f.length));
  return body.includes("Xing") || body.includes("Info") || body.includes("VBRI");
}

/** Ramki audio pliku MP3 (bez ID3 i bez ramki nagłówka VBR). */
export function parseMp3Frames(bytes: Uint8Array): Mp3Frame[] {
  const frames: Mp3Frame[] = [];
  let i = id3Size(bytes);
  while (i < bytes.length) {
    const f = readFrame(bytes, i);
    if (!f || f.length <= 4 || f.offset + f.length > bytes.length) {
      if (frames.length && f) break; // ucięta ostatnia ramka
      i++; // śmieci przed synchronizacją
      continue;
    }
    frames.push(f);
    i += f.length;
  }
  if (frames.length && isVbrHeaderFrame(bytes, frames[0])) frames.shift();
  return frames;
}

/**
 * Tnie MP3 po granicach ramek w podanych momentach (sekundy). Każdy kawałek
 * jest samodzielnym, poprawnym plikiem MP3. Cięcia wypadają w pauzach między
 * zdaniami, więc granica ramki (~26 ms) jest niesłyszalna.
 */
export function splitMp3AtTimes(bytes: Uint8Array, cutTimes: number[]): Uint8Array<ArrayBuffer>[] {
  const frames = parseMp3Frames(bytes);
  if (!frames.length) throw new Error("Lektor: brak ramek MP3 do pocięcia.");

  // Początek każdej ramki na osi czasu.
  const startTimes: number[] = [];
  let t = 0;
  for (const f of frames) {
    startTimes.push(t);
    t += f.duration;
  }
  const frameAt = (time: number) => {
    let best = 0;
    for (let k = 0; k < startTimes.length; k++) {
      if (Math.abs(startTimes[k] - time) < Math.abs(startTimes[best] - time)) best = k;
    }
    return best;
  };

  const bounds = [0, ...cutTimes.map(frameAt), frames.length];
  const pieces: Uint8Array<ArrayBuffer>[] = [];
  for (let k = 0; k < bounds.length - 1; k++) {
    const from = bounds[k];
    const to = bounds[k + 1];
    if (to <= from) throw new Error("Lektor: scena wyszłaby bez dźwięku.");
    const start = frames[from].offset;
    const last = frames[to - 1];
    pieces.push(bytes.slice(start, last.offset + last.length));
  }
  return pieces;
}

/** Base64 → bajty (działa w Node i w Workerach). */
export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
