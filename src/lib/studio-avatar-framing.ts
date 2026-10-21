// Kadrowanie ujęć awatara do pełnego pionu — czyste funkcje, bez I/O.
//
// HeyGen wkleja zdjęcie awatara (talking photo) do kadru 9:16 „contain”:
// poziome zdjęcie 16:9 zajmuje ~32% wysokości, reszta to ciemne pasy (~70%).
// Orientację wykrywamy z wymiarów zdjęcia awatara (nagłówek PNG/JPEG/WEBP),
// a Remotion w ujęciach takiego awatara powiększa obraz „cover” do pełnego
// kadru: środek w poziomie (twarz zwykle w środku), środek-góra w pionie.
// `focus_x` / `focus_y` per awatar pozwalają poprawić kadr ręcznie.

import type { SrtCue } from "./caption-style";

export type AvatarOrientation = "portrait" | "landscape" | "square";

export type AvatarFrameInfo = {
  orientation: AvatarOrientation;
  width: number;
  height: number;
  /** Punkt kadru (0–1) w obrazie awatara, który ma zostać w kadrze. */
  focusX: number;
  focusY: number;
};

/** Wymiary obrazu z nagłówka (PNG, JPEG, WEBP, GIF); null = nieznany format. */
export function imageSizeFromBytes(
  buf: ArrayBuffer | Uint8Array,
): { width: number; height: number } | null {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 3) === "PNG") {
    return { width: u32be(16), height: u32be(20) };
  }
  if (b.length >= 10 && ascii(0, 3) === "GIF") return { width: u16le(6), height: u16le(8) };
  if (b.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8X") return { width: u24le(24) + 1, height: u24le(27) + 1 };
    if (chunk === "VP8 ") return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      // SOF0–SOF15 bez DHT (C4), JPG (C8), DAC (CC)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: u16be(i + 7), height: u16be(i + 5) };
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      i += 2 + u16be(i + 2);
    }
  }
  return null;
}

export function classifyOrientation(width: number, height: number): AvatarOrientation {
  const r = width / Math.max(1, height);
  if (r > 1.1) return "landscape";
  if (r < 0.9) return "portrait";
  return "square";
}

/** Czy awatar nadaje się na prowadzącego (pion bez pasów). */
export const isLeadSafe = (o: AvatarOrientation | null | undefined) => o !== "landscape";

/**
 * Prowadzący rolki nie może być poziomy, jeśli w puli jest ktoś inny:
 * pierwszy nie-poziomy (znany) z puli przejmuje prowadzenie. Nieznana
 * orientacja traktowana jak pion (nie blokujemy rotacji bez danych).
 */
export function pickLeadAvatar(
  lead: string,
  pool: string[],
  orientation: (id: string) => AvatarOrientation | null,
): { lead: string; swapped: boolean } {
  if (isLeadSafe(orientation(lead))) return { lead, swapped: false };
  const alt =
    pool.find((id) => id && id !== lead && orientation(id) === "portrait") ??
    pool.find((id) => id && id !== lead && isLeadSafe(orientation(id)));
  return alt ? { lead: alt, swapped: true } : { lead, swapped: false };
}

/** Rotacja z prowadzącym na początku (bez duplikatów). */
export function withLeadFirst(lead: string, rotation: string[]): string[] {
  return [...new Set([lead, ...rotation.filter(Boolean)])];
}

/** Kadr bazowy planu — jak studio-reel-plan.ts. */
const FRAME = { width: 720, height: 1280 } as const;

/** Prostokąt obrazu awatara w kadrze HeyGena („contain”, środek). */
export function containBox(info: Pick<AvatarFrameInfo, "width" | "height">) {
  const s = Math.min(FRAME.width / info.width, FRAME.height / info.height);
  const w = info.width * s;
  const h = info.height * s;
  return { x: (FRAME.width - w) / 2, y: (FRAME.height - h) / 2, width: w, height: h };
}

export type ReelFraming = {
  start: number;
  /** null = do końca filmu. */
  end: number | null;
  /** Przekształcenie mastera: x' = tx + scale·x (piksele kadru 720×1280). */
  scale: number;
  tx: number;
  ty: number;
};

/**
 * Przekształcenie „cover” dla awatara: obraz awatara wypełnia kadr, okno
 * kadru ustawione na punkt `focus`, nie wychodzi poza obraz. null = nie
 * trzeba (pasy < 4%).
 */
export function coverTransform(info: AvatarFrameInfo): Omit<ReelFraming, "start" | "end"> | null {
  const box = containBox(info);
  const exact = Math.max(FRAME.width / box.width, FRAME.height / box.height);
  if (exact < 1.04) return null;
  // W górę do 0,001 — zaokrąglenie w dół zostawiłoby cienki pasek przy krawędzi.
  const scale = Math.ceil(exact * 1000) / 1000;
  const halfW = FRAME.width / 2 / scale;
  const halfH = FRAME.height / 2 / scale;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const fx = clamp(box.x + info.focusX * box.width, box.x + halfW, box.x + box.width - halfW);
  const fy = clamp(box.y + info.focusY * box.height, box.y + halfH, box.y + box.height - halfH);
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    scale,
    tx: r(FRAME.width / 2 - scale * fx),
    ty: r(FRAME.height / 2 - scale * fy),
  };
}

export type FramingScene = { kind: "avatar" | "broll"; text: string; avatarId: string | null };

const norm = (t: string) =>
  t
    .toLocaleLowerCase("pl-PL")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

/**
 * Czasy scen z SRT: sceny to kolejne fragmenty scenariusza, więc start sceny
 * = czas słowa o tym samym numerze w napisach (z proporcją, gdy liczba słów
 * w SRT różni się od scenariusza — np. poprawka nazwy firmy).
 */
export function sceneTimeline(
  scenes: FramingScene[],
  cues: SrtCue[],
): Array<FramingScene & { start: number; end: number | null }> {
  const timed: { start: number; end: number }[] = [];
  for (const cue of cues) {
    const ws = norm(cue.text);
    const dur = (cue.end - cue.start) / Math.max(1, ws.length);
    ws.forEach((_, i) =>
      timed.push({ start: cue.start + i * dur, end: cue.start + (i + 1) * dur }),
    );
  }
  const counts = scenes.map((s) => norm(s.text).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const ratio = total > 0 && timed.length > 0 ? timed.length / total : 0;
  let acc = 0;
  const starts = counts.map((c) => {
    const idx = Math.min(timed.length - 1, Math.round(acc * ratio));
    acc += c;
    return idx >= 0 && timed[idx] ? timed[idx].start : 0;
  });
  starts[0] = 0;
  return scenes.map((s, i) => ({
    ...s,
    start: starts[i],
    end: i + 1 < scenes.length ? starts[i + 1] : null,
  }));
}

/**
 * Odcinki kadrowania: ujęcia awatarów poziomych/kwadratowych (wg `infos`)
 * dostają „cover”. Bez planu scen (pojedyncze ujęcie) — cały film awatara
 * prowadzącego. Sąsiednie odcinki z tym samym kadrem są sklejane.
 */
export function framingSegments(input: {
  scenes: FramingScene[] | null;
  leadAvatarId: string;
  cues: SrtCue[];
  infos: Record<string, AvatarFrameInfo | undefined>;
}): ReelFraming[] {
  const scenes = input.scenes?.length
    ? sceneTimeline(input.scenes, input.cues)
    : [{ kind: "avatar" as const, text: "", avatarId: input.leadAvatarId, start: 0, end: null }];
  const out: ReelFraming[] = [];
  for (const s of scenes) {
    if (s.kind !== "avatar") continue;
    const info = input.infos[s.avatarId ?? input.leadAvatarId];
    const t = info ? coverTransform(info) : null;
    if (!t) continue;
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.end === s.start &&
      prev.scale === t.scale &&
      prev.tx === t.tx &&
      prev.ty === t.ty
    ) {
      prev.end = s.end;
      continue;
    }
    out.push({ start: s.start, end: s.end, ...t });
  }
  return out;
}
