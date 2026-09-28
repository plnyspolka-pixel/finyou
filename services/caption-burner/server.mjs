#!/usr/bin/env node
// Finance You — caption-burner: mikrousługa wypalająca napisy ASS w MP4
// (FFmpeg + libass). Backend Finance You działa na Cloudflare Workers, gdzie
// nie ma FFmpega — to jedyne miejsce, w którym faktycznie przetwarzamy obraz.
//
// Usługa jest świadomie „głupia": dostaje adres wideo i GOTOWY plik ASS
// (wygląd napisów decyduje kod Finance You — src/lib/caption-style.ts),
// oddaje MP4. Zero zależności npm, jeden plik, Node 22+.
//
// API (nagłówek `Authorization: Bearer <CAPTION_BURNER_SECRET>`):
//   GET    /health          — stan usługi (bez autoryzacji)
//   POST   /jobs            — { video_url, ass, name? } → 202 { id, status }
//   GET    /jobs/:id        — { id, status: queued|processing|done|failed, error, bytes }
//   GET    /jobs/:id/file   — gotowy MP4 (tylko status done)
//   DELETE /jobs/:id        — sprząta pliki zadania
//
// Zadania żyją w pamięci i na dysku roboczym; po restarcie usługi znikają —
// klient (studio-video-queue.server.ts) traktuje „nieznane zadanie" jak
// nieudane i ponawia raz albo schodzi na napisy HeyGena.

import http from "node:http";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { mkdir, rm, writeFile, stat } from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { randomUUID, timingSafeEqual } from "node:crypto";

const env = (key, fallback) => {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
};

const PORT = Number(env("PORT", 8080));
const SECRET = env("CAPTION_BURNER_SECRET", "");
const WORK_DIR = env("CAPTION_WORK_DIR", "/tmp/caption-burner");
const FFMPEG = env("FFMPEG_BIN", "ffmpeg");
const MAX_CONCURRENCY = Math.max(1, Number(env("MAX_CONCURRENCY", 1)));
const MAX_INPUT_BYTES = Math.max(1, Number(env("MAX_INPUT_MB", 300))) * 1024 * 1024;
const MAX_ASS_BYTES = 1024 * 1024;
const JOB_TTL_MS = Math.max(5, Number(env("JOB_TTL_MINUTES", 360))) * 60_000;
const DOWNLOAD_TIMEOUT_MS = Math.max(10, Number(env("DOWNLOAD_TIMEOUT_SECONDS", 300))) * 1000;
const FFMPEG_TIMEOUT_MS = Math.max(30, Number(env("FFMPEG_TIMEOUT_SECONDS", 1200))) * 1000;
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

function validateVideoUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new HttpError(400, "video_url nie jest poprawnym adresem");
  }
  const secure = url.protocol === "https:";
  if (!secure && !(ALLOW_PRIVATE_URLS && url.protocol === "http:")) {
    throw new HttpError(400, "video_url musi być adresem https");
  }
  if (!ALLOW_PRIVATE_URLS && PRIVATE_HOST.test(url.hostname)) {
    throw new HttpError(400, "video_url wskazuje na adres prywatny");
  }
  return url.toString();
}

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

function runFfmpeg(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr = (stderr + d.toString()).slice(-16_000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg: przekroczony czas ${Math.round(FFMPEG_TIMEOUT_MS / 1000)} s`));
    }, FFMPEG_TIMEOUT_MS);
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

// ── Zadania ─────────────────────────────────────────────────────────────────

async function processJob(job) {
  job.status = "processing";
  job.started_at = new Date().toISOString();
  const input = path.join(job.dir, "in.mp4");
  try {
    job.input_bytes = await download(job.video_url, input);
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
    job.status = "done";
  } catch (e) {
    job.status = "failed";
    job.error = String(e?.message ?? e).slice(0, 2000);
    console.error(`[${job.id}] ${job.error}`);
  } finally {
    job.finished_at = new Date().toISOString();
    await rm(input, { force: true }).catch(() => {});
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
    status: job.status,
    error: job.error ?? null,
    name: job.name,
    bytes: job.bytes ?? null,
    input_bytes: job.input_bytes ?? null,
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
    sendJson(res, 200, { ok: true, ffmpeg: await ffmpegVersion(), jobs: counts });
    return;
  }

  if (!authorized(req)) throw new HttpError(401, "brak albo zły sekret");

  if (req.method === "POST" && parts.length === 1 && parts[0] === "jobs") {
    const body = await readJson(req, MAX_ASS_BYTES + 64 * 1024);
    const video_url = validateVideoUrl(body.video_url);
    const ass = validateAss(body.ass);
    const id = randomUUID();
    const dir = path.join(WORK_DIR, id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "subs.ass"), ass, "utf8");
    const job = {
      id,
      dir,
      video_url,
      name: safeName(body.name),
      status: "queued",
      created_at: new Date().toISOString(),
    };
    jobs.set(id, job);
    queue.push(job);
    pump();
    sendJson(res, 202, { id, status: job.status });
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

await rm(WORK_DIR, { recursive: true, force: true }).catch(() => {});
await mkdir(WORK_DIR, { recursive: true });
setInterval(() => sweep().catch(() => {}), 10 * 60_000).unref();

server.listen(PORT, () => {
  console.log(
    `caption-burner nasłuchuje na :${PORT} (ffmpeg=${FFMPEG}, równolegle=${MAX_CONCURRENCY}, preset=${PRESET}, crf=${CRF})`,
  );
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
