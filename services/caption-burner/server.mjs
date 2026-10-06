#!/usr/bin/env node
// Finance You — caption-burner: mikrousługa FFmpeg dla Studia publikacji.
// Backend Finance You działa na Cloudflare Workers, gdzie nie ma FFmpega —
// to jedyne miejsce, w którym faktycznie przetwarzamy obraz. Dwa rodzaje zadań:
//
//   * caption   — wypalanie napisów ASS w MP4 (FFmpeg + libass). Usługa jest
//                 świadomie „głupia": dostaje adres wideo i GOTOWY plik ASS
//                 (wygląd napisów decyduje src/lib/caption-style.ts), oddaje MP4.
//   * transcode — kompresja do „profilu publikacji" (transcode-plan.mjs):
//                 jeden MP4 H.264/AAC, ≤ 1080p, ≤ 30 kl./s, ≤ max_bytes, który
//                 przyjmie każda platforma (YouTube / Reels / TikTok / X)
//                 i który zmieści się w buforze workera. Plik już zgodny
//                 z profilem wraca jako `unchanged` bez przekodowania. Wynik
//                 usługa może sama wgrać na podpisany URL Supabase Storage
//                 (`upload_url`), żeby bajty nie szły przez worker.
//
// Zero zależności npm, dwa pliki, Node 22+.
//
// API (nagłówek `Authorization: Bearer <CAPTION_BURNER_SECRET>`):
//   GET    /health          — stan usługi (bez autoryzacji)
//   POST   /jobs            — { video_url, ass, name? }                      → 202 { id, status }
//                             { video_url, target?, upload_url?, name? }     → 202 { id, status }
//   GET    /jobs/:id        — { id, kind, status: queued|processing|done|failed, error,
//                              bytes, unchanged, uploaded, input, output }
//   GET    /jobs/:id/file   — gotowy MP4 (tylko status done i gdy plik został w usłudze)
//   DELETE /jobs/:id        — sprząta pliki zadania
//
// Zadania trzymamy w pamięci I na dysku roboczym (job.json w katalogu
// zadania): po restarcie usługi — także po uśpieniu i wybudzeniu na Fly.io,
// Render czy Koyeb — wczytujemy je z powrotem, przerwane wracają do kolejki,
// gotowe pliki czekają na odbiór. Gdy dysk przepadł (nowy deploy), klient
// (studio-video-queue.server.ts / video-rendition.server.ts) traktuje
// „nieznane zadanie" jak nieudane, ponawia raz albo schodzi na wersję zapasową.

import http from "node:http";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { mkdir, rm, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  complianceIssues,
  ffmpegTranscodeArgs,
  formatMb,
  parseTarget,
  planEncode,
  summarizeProbe,
} from "./transcode-plan.mjs";
import { BANDS, parseSignalstats, sampleTimes, summarizeFrameCheck } from "./frame-check.mjs";

const env = (key, fallback) => {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
};

const PORT = Number(env("PORT", 8080));
const SECRET = env("CAPTION_BURNER_SECRET", "");
const WORK_DIR = env("CAPTION_WORK_DIR", "/tmp/caption-burner");
const FFMPEG = env("FFMPEG_BIN", "ffmpeg");
const FFPROBE = env("FFPROBE_BIN", "ffprobe");
const MAX_CONCURRENCY = Math.max(1, Number(env("MAX_CONCURRENCY", 1)));
const MAX_INPUT_BYTES = Math.max(1, Number(env("MAX_INPUT_MB", 500))) * 1024 * 1024;
const MAX_ASS_BYTES = 1024 * 1024;
const JOB_TTL_MS = Math.max(5, Number(env("JOB_TTL_MINUTES", 360))) * 60_000;
const DOWNLOAD_TIMEOUT_MS = Math.max(10, Number(env("DOWNLOAD_TIMEOUT_SECONDS", 300))) * 1000;
const FFMPEG_TIMEOUT_MS = Math.max(30, Number(env("FFMPEG_TIMEOUT_SECONDS", 1200))) * 1000;
// Kompresja długiego pliku na słabym CPU (0,1 vCPU na darmowym Renderze)
// potrafi trwać dłużej niż wypalanie napisów w rolce — osobny limit.
const TRANSCODE_TIMEOUT_MS = Math.max(60, Number(env("TRANSCODE_TIMEOUT_SECONDS", 3600))) * 1000;
const UPLOAD_TIMEOUT_MS = Math.max(30, Number(env("UPLOAD_TIMEOUT_SECONDS", 600))) * 1000;
const PRESET = env("FFMPEG_PRESET", "veryfast");
const CRF = String(Math.min(35, Math.max(10, Number(env("FFMPEG_CRF", 20)))));
const FONTS_DIR = env("CAPTION_FONTS_DIR", "");
// Do testów lokalnych — produkcja pobiera tylko z https i publicznych hostów.
const ALLOW_PRIVATE_URLS = env("ALLOW_PRIVATE_URLS", "0") === "1";

if (!SECRET) {
  console.error("caption-burner: ustaw CAPTION_BURNER_SECRET (losowy, min. 24 znaki).");
  process.exit(1);
}

/** @type {Map<string, Job>} */
const jobs = new Map();
const queue = [];
let running = 0;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ── Pomocnicze ──────────────────────────────────────────────────────────────

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
  });
  res.end(data);
}

function authorized(req) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(token);
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, `body większe niż ${limit} B`);
    chunks.push(chunk);
  }
  if (!size) throw new HttpError(400, "puste body");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "body nie jest poprawnym JSON");
  }
}

const PRIVATE_HOST =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|fc|fd)/i;

function validateHttpsUrl(raw, field) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new HttpError(400, `${field} nie jest poprawnym adresem`);
  }
  const secure = url.protocol === "https:";
  if (!secure && !(ALLOW_PRIVATE_URLS && url.protocol === "http:")) {
    throw new HttpError(400, `${field} musi być adresem https`);
  }
  if (!ALLOW_PRIVATE_URLS && PRIVATE_HOST.test(url.hostname)) {
    throw new HttpError(400, `${field} wskazuje na adres prywatny`);
  }
  return url.toString();
}

const validateVideoUrl = (raw) => validateHttpsUrl(raw, "video_url");

function validateAss(raw) {
  if (typeof raw !== "string" || !raw.trim()) throw new HttpError(400, "brak pola ass");
  if (Buffer.byteLength(raw) > MAX_ASS_BYTES) throw new HttpError(413, "plik ass za duży");
  if (!/\[Events\]/i.test(raw) || !/^Dialogue:/m.test(raw)) {
    throw new HttpError(400, "ass nie zawiera sekcji [Events] z kwestiami");
  }
  return raw;
}

const safeName = (s) =>
  String(s ?? "video")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "video";

async function download(url, dest) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) throw new Error(`pobranie wideo: HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_INPUT_BYTES) {
    throw new Error(`plik za duży (${declared} B, limit ${MAX_INPUT_BYTES} B)`);
  }
  let received = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (received > MAX_INPUT_BYTES) {
        cb(new Error(`plik za duży (limit ${MAX_INPUT_BYTES} B)`));
        return;
      }
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), counter, createWriteStream(dest));
  if (!received) throw new Error("pobranie wideo: pusty plik");
  return received;
}

function runFfmpeg(args, cwd, timeoutMs = FFMPEG_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr = (stderr + d.toString()).slice(-16_000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg: przekroczony czas ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else {
        const tail = stderr.trim().split("\n").slice(-4).join(" | ");
        reject(new Error(`ffmpeg zakończył się kodem ${code}: ${tail}`));
      }
    });
  });
}

function ffmpegArgs(audio) {
  const filter = FONTS_DIR ? `ass=subs.ass:fontsdir=${FONTS_DIR}` : "ass=subs.ass";
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    "in.mp4",
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-preset",
    PRESET,
    "-crf",
    CRF,
    "-pix_fmt",
    "yuv420p",
    ...(audio === "copy" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "160k"]),
    "-movflags",
    "+faststart",
    "out.mp4",
  ];
}

function ffmpegVersion() {
  return new Promise((resolve) => {
    execFile(FFMPEG, ["-version"], { timeout: 5000 }, (err, stdout) => {
      if (err) resolve(null);
      else resolve(String(stdout).split("\n")[0] ?? null);
    });
  });
}

function ffprobeAvailable() {
  return new Promise((resolve) => {
    execFile(FFPROBE, ["-version"], { timeout: 5000 }, (err) => resolve(!err));
  });
}

/** ffprobe → JSON (format + strumienie); błąd = plik nie jest wideo. */
function ffprobe(file) {
  return new Promise((resolve, reject) => {
    execFile(
      FFPROBE,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
      { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const tail = String(stderr ?? "")
            .trim()
            .split("\n")
            .slice(-2)
            .join(" | ");
          reject(new Error(`ffprobe: ${tail || err.message}`));
          return;
        }
        try {
          resolve(JSON.parse(String(stdout)));
        } catch {
          reject(new Error("ffprobe: odpowiedź nie jest JSON-em"));
        }
      },
    );
  });
}

/** Wgrywa gotowy plik na podpisany URL (Supabase Storage: PUT + x-upsert). */
async function uploadResult(file, uploadUrl, contentType) {
  const info = await stat(file);
  // Bufor zamiast strumienia: wynik jest ograniczony profilem (dziesiątki MB),
  // a Storage wymaga znanego Content-Length.
  const body = await readFile(file);
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": contentType,
      "content-length": String(info.size),
      "x-upsert": "true",
      "cache-control": "max-age=3600",
    },
    body,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`upload: HTTP ${res.status} ${text.slice(0, 200)}`.trim());
  }
  return info.size;
}

// ── Zadania ─────────────────────────────────────────────────────────────────

/** Stan zadania na dysku — przeżywa restart / uśpienie usługi. */
async function persist(job) {
  const { dir: _dir, ...data } = job;
  await writeFile(path.join(job.dir, "job.json"), JSON.stringify(data), "utf8").catch((e) =>
    console.warn(`[${job.id}] zapis job.json: ${e.message}`),
  );
}

/** Po starcie: wczytaj zadania z dysku, przerwane wróć do kolejki. */
async function restoreJobs() {
  const entries = await readdir(WORK_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(WORK_DIR, entry.name);
    let data;
    try {
      data = JSON.parse(await readFile(path.join(dir, "job.json"), "utf8"));
    } catch {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      continue;
    }
    const job = { ...data, dir };
    // Zadania sprzed rozróżnienia rodzajów to wypalanie napisów.
    if (!job.kind) job.kind = "caption";
    // Wynik wgrany do Storage albo zwrócony jako `unchanged` nie ma pliku
    // w usłudze — to nie błąd.
    if (job.status === "done" && !job.unchanged && !job.uploaded) {
      const ok = await stat(path.join(dir, "out.mp4")).catch(() => null);
      if (!ok) {
        job.status = "failed";
        job.error = "plik wynikowy zniknął po restarcie usługi";
        await persist(job);
      }
    } else if (job.status === "queued" || job.status === "processing") {
      job.status = "queued";
      job.error = null;
      queue.push(job);
    }
    jobs.set(job.id, job);
  }
  if (jobs.size) console.log(`caption-burner: wczytano ${jobs.size} zadań z dysku`);
  pump();
}

async function burnCaptions(job) {
  try {
    await runFfmpeg(ffmpegArgs("copy"), job.dir);
  } catch (e) {
    // Ścieżka audio, której MP4 nie przyjmie bez przekodowania — kosztuje
    // ułamek sekundy, więc próbujemy raz jeszcze z AAC zamiast padać.
    console.warn(`[${job.id}] kopiowanie audio nieudane, przekodowuję: ${e.message}`);
    await runFfmpeg(ffmpegArgs("aac"), job.dir);
  }
  const out = await stat(path.join(job.dir, "out.mp4"));
  job.bytes = out.size;
}

/** Pola z podsumowania ffprobe, które wracają do klienta (bez nadmiaru). */
function compactSummary(s) {
  return {
    bytes: s.size,
    duration: Math.round(s.duration * 100) / 100,
    width: s.video?.width ?? null,
    height: s.video?.height ?? null,
    fps: s.video ? Math.round(s.video.fps * 100) / 100 : null,
    video_codec: s.video?.codec ?? null,
    audio_codec: s.audio?.codec ?? null,
    // ffprobe zgłasza mov i mp4 jednym format_name — rozróżnia je major_brand.
    container: /^qt/i.test(s.major_brand)
      ? "mov"
      : /\bmp4\b/.test(s.format_name)
        ? "mp4"
        : s.format_name.split(",")[0],
  };
}

/**
 * Pasy brzegowe jednej klatki (chwila `t`): jeden przebieg FFmpega, cztery
 * wycinki z `signalstats` zapisane do plików w katalogu zadania.
 */
async function bandsAt(job, t) {
  const names = Object.keys(BANDS);
  const labels = names.map((_, i) => `b${i}`);
  const graph = [
    `[0:v]split=${names.length}${labels.map((l) => `[${l}]`).join("")}`,
    ...names.map(
      (name, i) =>
        `[${labels[i]}]${BANDS[name]},signalstats,metadata=mode=print:file=band-${name}.txt[o${i}]`,
    ),
  ].join(";");
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(t), "-i", "in.mp4"];
  args.push("-filter_complex", graph);
  names.forEach((_, i) => args.push("-map", `[o${i}]`, "-frames:v", "1", "-f", "null", "-"));
  const bands = {};
  try {
    await runFfmpeg(args, job.dir, 120_000);
    for (const name of names) {
      const file = path.join(job.dir, `band-${name}.txt`);
      bands[name] = parseSignalstats(await readFile(file, "utf8").catch(() => ""));
      await rm(file, { force: true }).catch(() => {});
    }
  } catch (e) {
    console.warn(`[${job.id}] kontrola kadru w ${t}s: ${e.message}`);
  }
  return { t, bands };
}

/** Pomiar gotowego filmu: ffprobe (wymiary, kodeki, bitrate) + kontrola pasów w kadrze. */
async function probeVideo(job) {
  const summary = summarizeProbe(await ffprobe(path.join(job.dir, "in.mp4")));
  const samples = [];
  for (const t of sampleTimes(summary.duration, job.samples ?? 8)) {
    samples.push(await bandsAt(job, t));
  }
  job.output = {
    ...compactSummary(summary),
    bit_rate_kbps: summary.bit_rate ? Math.round(summary.bit_rate / 1000) : null,
    pix_fmt: summary.video?.pix_fmt ?? null,
    profile: summary.video?.profile ?? null,
    audio_channels: summary.audio?.channels ?? null,
    audio_sample_rate: summary.audio?.sample_rate ?? null,
    frame_check: summarizeFrameCheck(samples),
  };
  job.bytes = summary.size;
  job.note = "pomiar pliku (ffprobe + kontrola pasów)";
}

/**
 * Kompresja do profilu: probe → (zgodny? koniec) → kodowanie z budżetem
 * bitrate → gdy nadal za duży, druga próba z bitrate skorygowanym o nadwyżkę
 * → probe wyniku → upload na podpisany URL (gdy podany).
 */
async function transcodeToProfile(job) {
  const input = path.join(job.dir, "in.mp4");
  const output = path.join(job.dir, "out.mp4");
  const target = job.target;
  const summary = summarizeProbe(await ffprobe(input));
  job.input = compactSummary(summary);
  const issues = complianceIssues(summary, target);
  if (!issues.length) {
    job.unchanged = true;
    job.bytes = summary.size;
    job.output = job.input;
    job.note = "plik spełnia profil — bez przekodowania";
    return;
  }
  job.note = `przekodowanie: ${issues.join(", ")}`;

  let previous = null;
  let plan = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    plan = planEncode(summary, target, previous);
    job.plan = plan;
    await persist(job);
    await runFfmpeg(ffmpegTranscodeArgs(plan, { preset: PRESET }), job.dir, TRANSCODE_TIMEOUT_MS);
    const size = (await stat(output)).size;
    if (size <= target.max_bytes) break;
    previous = { bytes: size, video_kbps: plan.video_kbps };
    console.warn(
      `[${job.id}] po kodowaniu ${formatMb(size)} > ${formatMb(target.max_bytes)} — ponawiam z niższym bitrate`,
    );
    if (attempt === 1) {
      throw new Error(
        `po kompresji plik ma ${formatMb(size)} — nie mieści się w ${formatMb(target.max_bytes)} (za długi materiał dla tego limitu)`,
      );
    }
  }

  const outSummary = summarizeProbe(await ffprobe(output));
  job.output = compactSummary(outSummary);
  job.bytes = outSummary.size;
  const leftovers = complianceIssues(outSummary, target);
  if (leftovers.length) {
    throw new Error(`wynik nadal niezgodny z profilem: ${leftovers.join(", ")}`);
  }

  if (job.upload_url) {
    try {
      await uploadResult(output, job.upload_url, "video/mp4");
      job.uploaded = true;
      // Plik poszedł prosto do Storage — nie trzymamy kopii na dysku usługi.
      await rm(output, { force: true }).catch(() => {});
    } catch (e) {
      // Wynik zostaje pod /jobs/:id/file — klient pobierze go sam.
      job.uploaded = false;
      job.upload_error = String(e?.message ?? e).slice(0, 500);
      console.warn(`[${job.id}] upload wyniku nieudany: ${job.upload_error}`);
    }
  }
}

async function processJob(job) {
  job.status = "processing";
  job.started_at = new Date().toISOString();
  await persist(job);
  const input = path.join(job.dir, "in.mp4");
  try {
    job.input_bytes = await download(job.video_url, input);
    if (job.kind === "transcode") await transcodeToProfile(job);
    else if (job.kind === "probe") await probeVideo(job);
    else await burnCaptions(job);
    job.status = "done";
  } catch (e) {
    job.status = "failed";
    job.error = String(e?.message ?? e).slice(0, 2000);
    console.error(`[${job.id}] ${job.error}`);
  } finally {
    job.finished_at = new Date().toISOString();
    await rm(input, { force: true }).catch(() => {});
    await persist(job);
  }
}

function pump() {
  while (running < MAX_CONCURRENCY && queue.length) {
    const job = queue.shift();
    running++;
    processJob(job).finally(() => {
      running--;
      pump();
    });
  }
}

async function discardJob(job) {
  jobs.delete(job.id);
  await rm(job.dir, { recursive: true, force: true }).catch(() => {});
}

async function sweep() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const job of jobs.values()) {
    const ended = job.finished_at ? Date.parse(job.finished_at) : null;
    if (ended && ended < cutoff) await discardJob(job);
  }
}

function publicJob(job) {
  return {
    id: job.id,
    kind: job.kind ?? "caption",
    status: job.status,
    error: job.error ?? null,
    name: job.name,
    bytes: job.bytes ?? null,
    input_bytes: job.input_bytes ?? null,
    // Transkodowanie: czy plik był już zgodny, czy wynik poszedł na upload_url.
    unchanged: job.unchanged === true,
    uploaded: job.uploaded === true,
    upload_error: job.upload_error ?? null,
    note: job.note ?? null,
    input: job.input ?? null,
    output: job.output ?? null,
    created_at: job.created_at,
    started_at: job.started_at ?? null,
    finished_at: job.finished_at ?? null,
  };
}

// ── Routing ─────────────────────────────────────────────────────────────────

async function route(req, res) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && url.pathname === "/health") {
    const counts = { queued: 0, processing: 0, done: 0, failed: 0 };
    for (const j of jobs.values()) counts[j.status] = (counts[j.status] ?? 0) + 1;
    sendJson(res, 200, {
      ok: true,
      ffmpeg: await ffmpegVersion(),
      ffprobe: await ffprobeAvailable(),
      transcode: true,
      // Pomiar pliku (zadanie `probe`) — klient sprawdza tę flagę, zanim zleci.
      probe: true,
      jobs: counts,
    });
    return;
  }

  if (!authorized(req)) throw new HttpError(401, "brak albo zły sekret");

  if (req.method === "POST" && parts.length === 1 && parts[0] === "jobs") {
    const body = await readJson(req, MAX_ASS_BYTES + 64 * 1024);
    const video_url = validateVideoUrl(body.video_url);
    // Rodzaj zadania rozpoznajemy po treści: `ass` = napisy, `probe` = pomiar,
    // inaczej kompresja.
    const kind =
      body.ass !== undefined || body.kind === "caption"
        ? "caption"
        : body.kind === "probe"
          ? "probe"
          : "transcode";
    const id = randomUUID();
    const dir = path.join(WORK_DIR, id);
    const job = {
      id,
      dir,
      kind,
      video_url,
      name: safeName(body.name),
      status: "queued",
      created_at: new Date().toISOString(),
    };
    if (kind === "caption") {
      const ass = validateAss(body.ass);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "subs.ass"), ass, "utf8");
    } else if (kind === "probe") {
      job.samples = Math.max(1, Math.min(24, Number(body.samples) || 8));
      await mkdir(dir, { recursive: true });
    } else {
      job.target = parseTarget(body.target);
      job.upload_url = body.upload_url ? validateHttpsUrl(body.upload_url, "upload_url") : null;
      await mkdir(dir, { recursive: true });
    }
    await persist(job);
    jobs.set(id, job);
    queue.push(job);
    pump();
    sendJson(res, 202, { id, kind, status: job.status });
    return;
  }

  if (parts.length >= 2 && parts[0] === "jobs") {
    const job = jobs.get(parts[1]);
    if (!job) throw new HttpError(404, "nie ma takiego zadania");

    if (req.method === "GET" && parts.length === 2) {
      sendJson(res, 200, publicJob(job));
      return;
    }
    if (req.method === "GET" && parts.length === 3 && parts[2] === "file") {
      if (job.status !== "done") throw new HttpError(409, `zadanie ma status ${job.status}`);
      if (job.unchanged) throw new HttpError(409, "plik był zgodny z profilem — użyj oryginału");
      if (job.uploaded) throw new HttpError(409, "wynik został wgrany na upload_url");
      const file = path.join(job.dir, "out.mp4");
      const info = await stat(file);
      res.writeHead(200, {
        "content-type": "video/mp4",
        "content-length": info.size,
        "content-disposition": `attachment; filename="${job.name}.mp4"`,
        "cache-control": "no-store",
      });
      await pipeline(createReadStream(file), res);
      return;
    }
    if (req.method === "DELETE" && parts.length === 2) {
      if (job.status === "processing") throw new HttpError(409, "zadanie w trakcie przetwarzania");
      await discardJob(job);
      res.writeHead(204).end();
      return;
    }
  }

  throw new HttpError(404, "nie ma takiej ścieżki");
}

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error(e);
    if (!res.headersSent) sendJson(res, status, { error: e?.message ?? String(e) });
    else res.end();
  }
});

await mkdir(WORK_DIR, { recursive: true });
await restoreJobs();
await sweep().catch(() => {});
setInterval(() => sweep().catch(() => {}), 10 * 60_000).unref();

server.listen(PORT, () => {
  console.log(
    `caption-burner nasłuchuje na :${PORT} (ffmpeg=${FFMPEG}, ffprobe=${FFPROBE}, równolegle=${MAX_CONCURRENCY}, preset=${PRESET}, crf=${CRF}, limit wejścia=${formatMb(MAX_INPUT_BYTES)})`,
  );
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
