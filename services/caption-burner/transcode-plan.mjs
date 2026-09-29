// Finance You — plan transkodowania wideo do „profilu publikacji": czysta
// logika bez I/O (testowalna `node --test`), używana przez server.mjs.
//
// Cel: JEDEN plik MP4, który przyjmie każda platforma (YouTube, Instagram /
// Facebook Reels, TikTok, X) i który zmieści się w buforze workera Finance
// You (Cloudflare Workers: 128 MB pamięci, uploady TikTok/YouTube/X buforują
// plik w całości). Kontrakt profilu:
//   * kontener MP4 (moov na początku — +faststart), jedna ścieżka wideo,
//     najwyżej jedna ścieżka audio, bez napisów/danych/okładek,
//   * H.264 High 4.1, yuv420p, do 1080 px krótszy bok / 1920 px dłuższy,
//     do 30 kl./s, bez metadanych obrotu (obrót wypalamy w obraz),
//   * AAC-LC do 128 kb/s, stereo, 48 kHz,
//   * rozmiar ≤ max_bytes — bitrate liczymy z długości filmu, a gdy budżet
//     jest za mały na 1080p, schodzimy z rozdzielczością (720 → 540 → 480).
//
// Plik, który JUŻ spełnia profil, nie jest przekodowywany (`unchanged`) —
// rolki z HeyGena po wypaleniu napisów przechodzą tędy bez straty jakości.

const MB = 1024 * 1024;

/** Domyślny profil; klient (src/lib/video-rendition.ts) przysyła własny. */
export const DEFAULT_TARGET = Object.freeze({
  max_bytes: 60 * MB,
  max_long_edge: 1920,
  max_short_edge: 1080,
  max_fps: 30,
  audio_kbps: 128,
  video_kbps_cap: 6000,
});

const clampInt = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/** Waliduje `target` z żądania — brakujące/zepsute pola dostają domyślne. */
export function parseTarget(raw) {
  const t = raw && typeof raw === "object" ? raw : {};
  return {
    max_bytes: clampInt(t.max_bytes, 1 * MB, 2048 * MB, DEFAULT_TARGET.max_bytes),
    max_long_edge: clampInt(t.max_long_edge, 320, 4096, DEFAULT_TARGET.max_long_edge),
    max_short_edge: clampInt(t.max_short_edge, 240, 2160, DEFAULT_TARGET.max_short_edge),
    max_fps: clampInt(t.max_fps, 15, 60, DEFAULT_TARGET.max_fps),
    audio_kbps: clampInt(t.audio_kbps, 48, 320, DEFAULT_TARGET.audio_kbps),
    video_kbps_cap: clampInt(t.video_kbps_cap, 300, 40000, DEFAULT_TARGET.video_kbps_cap),
  };
}

// ── ffprobe → zwięzłe podsumowanie ──────────────────────────────────────────

function parseRate(raw) {
  if (typeof raw !== "string") return null;
  const [num, den] = raw.split("/").map(Number);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (den === undefined) return num;
  if (!Number.isFinite(den) || den <= 0) return null;
  return num / den;
}

function streamRotation(stream) {
  const fromTag = Number(stream?.tags?.rotate);
  if (Number.isFinite(fromTag) && fromTag !== 0) return fromTag;
  for (const side of stream?.side_data_list ?? []) {
    const r = Number(side?.rotation);
    if (Number.isFinite(r) && r !== 0) return r;
  }
  return 0;
}

/**
 * Sprowadza JSON ffprobe (-show_format -show_streams) do pól, na których
 * opiera się decyzja. Wymiary są PO uwzględnieniu obrotu (ffmpeg obraca
 * obraz automatycznie przy dekodowaniu, więc wynik ma właśnie te wymiary).
 */
export function summarizeProbe(probe) {
  const format = probe?.format ?? {};
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const videos = streams.filter((s) => s.codec_type === "video");
  const audios = streams.filter((s) => s.codec_type === "audio");
  // Okładka (attached_pic) to też „video” dla ffprobe — nie jest ścieżką filmu.
  const mainVideo = videos.find((s) => !s.disposition?.attached_pic) ?? null;
  const rotation = mainVideo ? streamRotation(mainVideo) : 0;
  const swapped = Math.abs(rotation) % 180 === 90;
  const w = Number(mainVideo?.width) || 0;
  const h = Number(mainVideo?.height) || 0;
  return {
    format_name: String(format.format_name ?? ""),
    major_brand: String(format.tags?.major_brand ?? "").trim(),
    duration: Number(format.duration) || 0,
    size: Number(format.size) || 0,
    bit_rate: Number(format.bit_rate) || 0,
    video: mainVideo
      ? {
          codec: String(mainVideo.codec_name ?? ""),
          profile: String(mainVideo.profile ?? ""),
          pix_fmt: String(mainVideo.pix_fmt ?? ""),
          width: swapped ? h : w,
          height: swapped ? w : h,
          fps: parseRate(mainVideo.avg_frame_rate) ?? parseRate(mainVideo.r_frame_rate) ?? 0,
          rotation,
        }
      : null,
    audio: audios.length
      ? {
          codec: String(audios[0].codec_name ?? ""),
          channels: Number(audios[0].channels) || 0,
          sample_rate: Number(audios[0].sample_rate) || 0,
        }
      : null,
    streams: {
      video: videos.length,
      audio: audios.length,
      other: streams.length - videos.length - audios.length,
    },
  };
}

// ── Zgodność z profilem ─────────────────────────────────────────────────────

/** Lista powodów, dla których plik trzeba przekodować; pusta = zgodny. */
export function complianceIssues(summary, target) {
  const issues = [];
  const v = summary.video;
  if (!v) return ["brak ścieżki wideo"];
  if (!/\bmp4\b/.test(summary.format_name)) issues.push(`kontener ${summary.format_name || "?"}`);
  // ffprobe zgłasza mov i mp4 tym samym format_name — rozróżnia je major_brand.
  if (/^qt/i.test(summary.major_brand)) issues.push("kontener MOV (QuickTime)");
  if (v.codec !== "h264") issues.push(`kodek wideo ${v.codec || "?"}`);
  if (v.pix_fmt !== "yuv420p") issues.push(`format pikseli ${v.pix_fmt || "?"}`);
  if (v.rotation) issues.push(`metadane obrotu ${v.rotation}°`);
  const long = Math.max(v.width, v.height);
  const short = Math.min(v.width, v.height);
  if (!long || !short) issues.push("nieznane wymiary");
  else if (long > target.max_long_edge || short > target.max_short_edge) {
    issues.push(`rozdzielczość ${v.width}×${v.height}`);
  } else if (v.width % 2 || v.height % 2) issues.push("nieparzyste wymiary");
  if (v.fps > target.max_fps + 0.05) issues.push(`${Math.round(v.fps * 100) / 100} kl./s`);
  if (summary.streams.video > 1) issues.push("więcej niż jedna ścieżka wideo");
  if (summary.streams.audio > 1) issues.push("więcej niż jedna ścieżka audio");
  if (summary.streams.other > 0) issues.push("dodatkowe strumienie (napisy/dane)");
  const a = summary.audio;
  if (a) {
    if (a.codec !== "aac") issues.push(`kodek audio ${a.codec || "?"}`);
    if (a.channels > 2) issues.push(`${a.channels} kanałów audio`);
    if (a.sample_rate > 48000) issues.push(`próbkowanie ${a.sample_rate} Hz`);
  }
  if (summary.size > target.max_bytes) {
    issues.push(`${formatMb(summary.size)} > limit ${formatMb(target.max_bytes)}`);
  }
  return issues;
}

export function formatMb(bytes) {
  const mb = bytes / MB;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

// ── Plan kodowania ──────────────────────────────────────────────────────────

/** Wpasowuje wymiary w pudełko (dłuższy/krótszy bok), bez powiększania, parzyste. */
export function fitDimensions(width, height, maxLong, maxShort) {
  const landscape = width >= height;
  const boxW = landscape ? maxLong : maxShort;
  const boxH = landscape ? maxShort : maxLong;
  const scale = Math.min(1, boxW / width, boxH / height);
  // W dół do parzystych: libx264 wymaga parzystych wymiarów, a zaokrąglenie
  // w górę powiększyłoby obraz o piksel ponad limit.
  const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
  return { width: even(width * scale), height: even(height * scale) };
}

// Sensowny bitrate dla H.264 przy 30 kl./s (krótszy bok → kb/s): sufit, żeby
// nie pompować bajtów w plik bez zysku, i próg, poniżej którego lepiej
// zmniejszyć obraz niż rozmazać go artefaktami.
const LADDER = [
  { short: 1080, cap: 6000, floor: 2200 },
  { short: 720, cap: 3200, floor: 1100 },
  { short: 540, cap: 1800, floor: 600 },
  { short: 480, cap: 1200, floor: 0 },
];

function rungFor(shortEdge) {
  return LADDER.find((r) => shortEdge >= r.short) ?? LADDER[LADDER.length - 1];
}

/**
 * Plan kodowania: wymiary, klatkaż, bitrate wideo/audio. `previous` to wynik
 * poprzedniej próby (gdy plik po kodowaniu nadal był za duży) — wtedy skalujemy
 * bitrate proporcjonalnie do przekroczenia.
 */
export function planEncode(summary, target, previous = null) {
  const v = summary.video;
  if (!v) throw new Error("brak ścieżki wideo — nie ma czego kodować");
  // Bez czasu trwania nie policzymy budżetu — zakładamy minutę, a druga próba
  // (jeśli plik wyjdzie za duży) skoryguje proporcjonalnie.
  const duration = summary.duration > 0 ? summary.duration : 60;
  const audioKbps = summary.audio ? target.audio_kbps : 0;
  // 7 % zapasu na kontener, nierówności VBV i zaokrąglenia.
  const totalKbps = Math.floor(((target.max_bytes * 8) / 1000 / duration) * 0.93);
  let budget = totalKbps - audioKbps;
  if (previous?.bytes > target.max_bytes && previous.video_kbps) {
    const ratio = target.max_bytes / previous.bytes;
    budget = Math.min(budget, Math.floor(previous.video_kbps * ratio * 0.9));
  }

  let dims = fitDimensions(v.width, v.height, target.max_long_edge, target.max_short_edge);
  let rung = rungFor(Math.min(dims.width, dims.height));
  let videoKbps = Math.min(rung.cap, budget);
  // Za mało bajtów na tę rozdzielczość → schodzimy szczebel niżej.
  while (videoKbps < rung.floor) {
    const next = LADDER[LADDER.indexOf(rung) + 1];
    if (!next) break;
    const shortNow = Math.min(dims.width, dims.height);
    const factor = next.short / shortNow;
    dims = fitDimensions(
      Math.round(dims.width * factor),
      Math.round(dims.height * factor),
      target.max_long_edge,
      target.max_short_edge,
    );
    rung = next;
    videoKbps = Math.min(rung.cap, budget);
  }
  videoKbps = Math.max(200, videoKbps);
  const fps = v.fps > 0 ? Math.min(v.fps, target.max_fps) : target.max_fps;
  return {
    width: dims.width,
    height: dims.height,
    scale: dims.width !== v.width || dims.height !== v.height,
    fps: Math.round(fps * 1000) / 1000,
    limit_fps: v.fps > target.max_fps + 0.05,
    video_kbps: videoKbps,
    audio_kbps: audioKbps,
    has_audio: Boolean(summary.audio),
    crf: 23,
    expected_bytes: Math.round(((videoKbps + audioKbps) * 1000 * duration) / 8),
  };
}

/** Argumenty ffmpeg dla planu (wejście/wyjście względem katalogu zadania). */
export function ffmpegTranscodeArgs(plan, opts = {}) {
  const preset = opts.preset ?? "veryfast";
  const input = opts.input ?? "in.mp4";
  const output = opts.output ?? "out.mp4";
  const filters = [];
  if (plan.scale) filters.push(`scale=${plan.width}:${plan.height}:flags=lanczos`);
  filters.push("format=yuv420p");
  const gop = Math.max(12, Math.round(plan.fps * 2));
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    // Tylko główny obraz i (opcjonalnie) pierwsze audio; napisy, dane
    // i okładki odpadają — platformy potrafią odrzucić plik z dodatkowymi
    // strumieniami.
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-sn",
    "-dn",
    "-map_metadata",
    "-1",
    "-vf",
    filters.join(","),
    ...(plan.limit_fps ? ["-r", String(plan.fps)] : []),
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-pix_fmt",
    "yuv420p",
    // CRF = sufit jakości, maxrate/bufsize (VBV) = sufit rozmiaru.
    "-crf",
    String(plan.crf),
    "-maxrate",
    `${plan.video_kbps}k`,
    "-bufsize",
    `${plan.video_kbps * 2}k`,
    "-g",
    String(gop),
    ...(plan.has_audio
      ? ["-c:a", "aac", "-b:a", `${plan.audio_kbps}k`, "-ac", "2", "-ar", "48000"]
      : ["-an"]),
    "-movflags",
    "+faststart",
    output,
  ];
}
