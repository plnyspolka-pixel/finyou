// AWS Lambda — kompresja wideo przed publikacją (zastępuje zadanie `transcode`
// usługi caption-burner na darmowym Renderze, 0,1 vCPU).
//
// Jedna funkcja, dwa wejścia:
//   * Function URL (HTTP) — API zgodne z caption-burner: POST /jobs,
//     GET /jobs/:id, DELETE /jobs/:id, GET /health. POST zapisuje zadanie
//     w S3 i wywołuje SAMĄ SIEBIE asynchronicznie (InvocationType: Event),
//     więc odpowiada od razu,
//   * wywołanie asynchroniczne `{ worker: "<id>" }` — właściwe kodowanie
//     FFmpegiem (statyczna binarka w paczce, katalog bin/).
//
// Stan zadań: s3://$BUCKET/jobs/<id>.json, wynik zapasowy:
// s3://$BUCKET/results/<id>.mp4 (reguła cyklu życia kasuje po 2 dniach).
// Konfiguracja (zmienne środowiska Lambdy, ustawia deploy.sh):
//   TRANSCODER_SECRET — Bearer dla klienta (Finance You: VIDEO_TRANSCODER_SECRET)
//   BUCKET            — bucket na stan zadań i wyniki zapasowe
//   FFMPEG_PRESET     — domyślnie medium (lepsza jakość przy tym samym bitrate)
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HttpError, processJob, route } from "./core.mjs";

const env = (k, d) => (process.env[k] === undefined || process.env[k] === "" ? d : process.env[k]);
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const FFMPEG = env("FFMPEG_BIN", path.join(ROOT, "bin", "ffmpeg"));
const FFPROBE = env("FFPROBE_BIN", path.join(ROOT, "bin", "ffprobe"));
const SECRET = env("TRANSCODER_SECRET", "");
const BUCKET = env("BUCKET", "");
const REGION = env("AWS_REGION", "eu-central-1");
const MAX_INPUT_BYTES = Math.max(1, Number(env("MAX_INPUT_MB", 1500))) * 1024 * 1024;
// Lambda ma twardy limit 15 min — FFmpeg dostaje 13, reszta na pobranie i upload.
const FFMPEG_TIMEOUT_MS = Math.max(60, Number(env("FFMPEG_TIMEOUT_SECONDS", 780))) * 1000;

const s3 = new S3Client({ region: REGION });
const lambda = new LambdaClient({ region: REGION });

const jobKey = (id) => `jobs/${id}.json`;
const resultKey = (id) => `results/${id}.mp4`;

const store = {
  async getJob(id) {
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: jobKey(id) }));
      return JSON.parse(await out.Body.transformToString());
    } catch (e) {
      if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  },
  async putJob(job) {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: jobKey(job.id),
        Body: JSON.stringify(job),
        ContentType: "application/json",
      }),
    );
  },
  async deleteJob(id) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: jobKey(id) })).catch(() => {});
  },
  async putResult(id, file) {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: resultKey(id),
        Body: await readFile(file),
        ContentType: "video/mp4",
      }),
    );
  },
  async resultUrl(id) {
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: resultKey(id) }), {
      expiresIn: 3600,
    });
  },
  async deleteResult(id) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: resultKey(id) })).catch(() => {});
  },
};

function authorized(header) {
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(token);
  const b = Buffer.from(SECRET);
  return Boolean(SECRET) && a.length === b.length && timingSafeEqual(a, b);
}

function runFfmpeg(args, cwd, timeoutMs = FFMPEG_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr = (stderr + d.toString()).slice(-16_000)));
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
      else
        reject(
          new Error(
            `ffmpeg zakończył się kodem ${code}: ${stderr.trim().split("\n").slice(-4).join(" | ")}`,
          ),
        );
    });
  });
}

function ffprobe(file) {
  return new Promise((resolve, reject) => {
    execFile(
      FFPROBE,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
      { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err)
          return reject(
            new Error(
              `ffprobe: ${
                String(stderr ?? "")
                  .trim()
                  .slice(-300) || err.message
              }`,
            ),
          );
        try {
          resolve(JSON.parse(String(stdout)));
        } catch {
          reject(new Error("ffprobe: odpowiedź nie jest JSON-em"));
        }
      },
    );
  });
}

function ffmpegVersion() {
  return new Promise((resolve) =>
    execFile(FFMPEG, ["-version"], { timeout: 5000 }, (err, stdout) =>
      resolve(err ? null : (String(stdout).split("\n")[0] ?? null)),
    ),
  );
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(5 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`pobranie wideo: HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_INPUT_BYTES) throw new Error(`plik za duży (${declared} B)`);
  let received = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (received > MAX_INPUT_BYTES) return cb(new Error("plik za duży"));
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), counter, createWriteStream(dest));
  if (!received) throw new Error("pobranie wideo: pusty plik");
  return received;
}

/** Upload na podpisany URL Supabase Storage (PUT + x-upsert), strumieniowo. */
async function upload(file, url, contentType) {
  const { size } = await stat(file);
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "content-type": contentType,
      "content-length": String(size),
      "x-upsert": "true",
      "cache-control": "max-age=3600",
    },
    body: Readable.toWeb(createReadStream(file)),
    duplex: "half",
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!res.ok)
    throw new Error(
      `upload: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`,
    );
}

async function invokeWorker(id) {
  await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify({ worker: id })),
    }),
  );
}

const deps = {
  store,
  authorized,
  invokeWorker,
  runFfmpeg,
  ffprobe,
  ffmpegVersion,
  download,
  upload,
  uuid: randomUUID,
  region: REGION,
  preset: env("FFMPEG_PRESET", "medium"),
  timeoutMs: FFMPEG_TIMEOUT_MS,
  workDir: "/tmp",
};

export async function handler(event) {
  // Asynchroniczne kodowanie zlecone przez POST /jobs.
  if (event?.worker) {
    const job = await processJob(String(event.worker), deps);
    console.log(
      `[${event.worker}] ${job?.status ?? "brak zadania"} ${job?.error ?? job?.note ?? ""}`,
    );
    return { ok: true };
  }
  // Function URL (payload 2.0).
  const http = event?.requestContext?.http;
  const req = {
    method: http?.method ?? "GET",
    path: event?.rawPath ?? "/",
    headers: event?.headers ?? {},
    body: event?.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : (event?.body ?? ""),
  };
  try {
    if (req.body.length > 256 * 1024) throw new HttpError(413, "body za duże");
    const out = await route(req, deps);
    return {
      statusCode: out.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      body: out.body == null ? "" : JSON.stringify(out.body),
    };
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error(e);
    return {
      statusCode: status,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: e?.message ?? String(e) }),
    };
  }
}
