// Kontrola kadru gotowego filmu (czysta logika, bez FFmpega) — czy rolka ma
// pasy (letterbox u góry/u dołu, pillarbox po bokach).
//
// Metoda: w kilku chwilach filmu FFmpeg wycina z klatki cztery pasy brzegowe
// (górne i dolne 10% wysokości, lewe i prawe 8% szerokości) i liczy dla nich
// `signalstats` (min/max jasności i chrominancji). Pas tła wstawiony przez
// HeyGen jest JEDNOLITY (rozpiętość wartości ~0), a prawdziwy obraz — nawet
// ciemny — ma szum i fakturę. Dlatego patrzymy na płaskość, nie na czerń:
// pasy w kolorze granatu #101728 nie są czarne i `cropdetect` by ich nie
// złapał.

/**
 * Pasy brzegowe: nazwa → wyrażenie `crop` FFmpega. Górny pas bierze lewe 70%
 * szerokości — w prawym górnym rogu rolek siedzi znaczek „AI”, który
 * zamaskowałby jednolite tło.
 */
export const BANDS = {
  top: "crop=trunc(iw*0.35)*2:trunc(ih/20)*2:0:0",
  bottom: "crop=iw:trunc(ih/20)*2:0:ih-oh",
  left: "crop=trunc(iw/25)*2:ih:0:0",
  right: "crop=trunc(iw/25)*2:ih:iw-ow:0",
};

/** Maksymalna rozpiętość Y/U/V, przy której pas uznajemy za jednolite tło. */
export const FLAT_SPREAD = 6;

/** Chwile próbek: `count` punktów równo w filmie, z marginesem od początku i końca. */
export function sampleTimes(duration, count = 8) {
  const d = Number(duration);
  if (!Number.isFinite(d) || d <= 0) return [0];
  const n = Math.max(1, Math.min(24, Math.round(count)));
  const margin = Math.min(0.5, d / 10);
  const span = Math.max(0, d - 2 * margin);
  if (n === 1) return [Math.round((margin + span / 2) * 100) / 100];
  return Array.from(
    { length: n },
    (_, i) => Math.round((margin + (span * i) / (n - 1)) * 100) / 100,
  );
}

/** Parsuje wyjście `metadata=mode=print` (signalstats) — pierwszą klatkę. */
export function parseSignalstats(text) {
  const read = (key) => {
    const m = new RegExp(`lavfi\\.signalstats\\.${key}=([0-9.]+)`).exec(String(text ?? ""));
    return m ? Number(m[1]) : null;
  };
  const stats = {
    ymin: read("YMIN"),
    ymax: read("YMAX"),
    umin: read("UMIN"),
    umax: read("UMAX"),
    vmin: read("VMIN"),
    vmax: read("VMAX"),
    yavg: read("YAVG"),
  };
  return stats.ymin == null || stats.ymax == null ? null : stats;
}

/** Czy pas jest jednolitym tłem (pasem dodanym przy wpasowaniu kadru). */
export function isFlatBand(stats) {
  if (!stats) return false;
  const spread = (a, b) => (a == null || b == null ? 0 : b - a);
  return (
    spread(stats.ymin, stats.ymax) <= FLAT_SPREAD &&
    spread(stats.umin, stats.umax) <= FLAT_SPREAD &&
    spread(stats.vmin, stats.vmax) <= FLAT_SPREAD
  );
}

/**
 * Werdykt z próbek. `samples`: [{ t, bands: { top, bottom, left, right } }],
 * gdzie każdy pas to wynik `parseSignalstats` (albo null, gdy się nie udało).
 * Letterbox w próbce = jednolity pas u góry I u dołu; pillarbox = po obu bokach.
 */
export function summarizeFrameCheck(samples) {
  const rows = samples.map((s) => {
    const flat = Object.fromEntries(
      Object.entries(s.bands ?? {}).map(([k, v]) => [k, isFlatBand(v)]),
    );
    return {
      t: s.t,
      letterbox: Boolean(flat.top && flat.bottom),
      pillarbox: Boolean(flat.left && flat.right),
      measured: Object.values(s.bands ?? {}).some(Boolean),
    };
  });
  const measured = rows.filter((r) => r.measured);
  const letterbox = measured.filter((r) => r.letterbox).map((r) => r.t);
  const pillarbox = measured.filter((r) => r.pillarbox).map((r) => r.t);
  const bad = new Set([...letterbox, ...pillarbox]);
  const verdict = !measured.length
    ? "nie zmierzono"
    : !bad.size
      ? "pełny kadr we wszystkich próbkach"
      : bad.size === measured.length
        ? "pasy w całym filmie"
        : "pasy w części ujęć";
  return {
    samples: measured.length,
    letterbox_at: letterbox,
    pillarbox_at: pillarbox,
    bars_ratio: measured.length ? Math.round((bad.size / measured.length) * 100) / 100 : null,
    has_bars: bad.size > 0,
    verdict,
  };
}
