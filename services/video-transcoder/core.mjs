// Kompresja wideo przed publikacją — logika zadania niezależna od AWS.
// Ten sam plan kodowania co dawniej w caption-burner (transcode-plan.mjs,
// kopiowany do paczki przy budowie), tylko na mocniejszym CPU Lambdy.
//
// Zależności wstrzykiwane (`deps`), żeby dało się to uruchomić lokalnie
// z prawdziwym FFmpegiem i magazynem na dysku:
//   store.getJob(id) / store.putJob(job) / store.deleteJob(id)
//   store.putResult(id, file) / store.resultUrl(id) / store.deleteResult(id)
//   runFfmpeg(args, cwd, timeoutMs) / ffprobe(file) / download(url, dest) /
//   upload(file, url, contentType)
import path from "node:path";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  complianceIssues,
  ffmpegTranscodeArgs,
  formatMb,
  parseTarget,
  planEncode,
  summarizeProbe,
} from "./transcode-plan.mjs";

/** Identyfikatory zadań AWS mają prefiks — klient po nim rozpoznaje, gdzie pytać. */
export const JOB_PREFIX = "aws-";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const PRIVATE_HOST =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|fc|fd)/i;

export function validateHttpsUrl(raw, field, { allowPrivate = false } = {}) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    throw new HttpError(400, `${field} nie jest poprawnym adresem`);
  }
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    throw new HttpError(400, `${field} musi być adresem https`);
  }
  if (!allowPrivate && PRIVATE_HOST.test(url.hostname)) {
    throw new HttpError(400, `${field} wskazuje na adres prywatny`);
  }
  return url.toString();
}

export const safeName = (s) =>
  String(s ?? "video")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "video";

const isJobId = (id) => new RegExp(`^${JOB_PREFIX}[0-9a-f-]{36}$`).test(String(id ?? ""));

/** Pola z podsumowania ffprobe zwracane klientowi. */
export function compactSummary(s) {
  return {
    bytes: s.size,
    duration: Math.round(s.duration * 100) / 100,
    width: s.video?.width ?? null,
    height: s.video?.height ?? null,
    fps: s.video ? Math.round(s.video.fps * 100) / 100 : null,
    video_codec: s.video?.codec ?? null,
    audio_codec: s.audio?.codec ?? null,
    container: /^qt/i.test(s.major_brand)
      ? "mov"
      : /\bmp4\b/.test(s.format_name)
        ? "mp4"
        : s.format_name.split(",")[0],
  };
}

/** Widok zadania dla klienta — kształt jak w caption-burner (GET /jobs/:id). */
export function publicJob(job, fileUrl = null) {
  return {
    id: job.id,
    kind: "transcode",
    status: job.status,
    error: job.error ?? null,
    name: job.name,
    bytes: job.bytes ?? null,
    input_bytes: job.input_bytes ?? null,
    unchanged: job.unchanged === true,
    uploaded: job.uploaded === true,
    upload_error: job.upload_error ?? null,
    note: job.note ?? null,
    input: job.input ?? null,
    output: job.output ?? null,
    // Wynik w S3 (gdy upload do Storage się nie udał) — podpisany link, bez nagłówka auth.
    file_url: fileUrl,
    engine: "aws-lambda",
    created_at: job.created_at,
    started_at: job.started_at ?? null,
    finished_at: job.finished_at ?? null,
  };
}

/** POST /jobs — walidacja i zapis zadania (kodowanie rusza osobnym wywołaniem). */
export async function createJob(body, deps) {
  if (body?.ass !== undefined || body?.kind === "caption") {
    throw new HttpError(400, "ta usługa robi tylko kompresję (transcode), nie napisy");
  }
  const allowPrivate = deps.allowPrivate === true;
  const job = {
    id: `${JOB_PREFIX}${deps.uuid()}`,
    kind: "transcode",
    video_url: validateHttpsUrl(body?.video_url, "video_url", { allowPrivate }),
    upload_url: body?.upload_url
      ? validateHttpsUrl(body.upload_url, "upload_url", { allowPrivate })
      : null,
    target: parseTarget(body?.target),
    name: safeName(body?.name),
    status: "queued",
    created_at: new Date().toISOString(),
  };
  await deps.store.putJob(job);
  return job;
}

/**
 * Kodowanie jednego zadania (wywołanie asynchroniczne Lambdy): pobranie →
 * probe → (zgodny? koniec) → kodowanie z budżetem bitrate → druga próba,
 * gdy za duży → probe wyniku → upload na podpisany URL Storage, a gdy się
 * nie uda — do S3 (klient pobierze przez `file_url`).
 */
export async function processJob(id, deps) {
  const job = await deps.store.getJob(id);
  if (!job) return null;
  if (job.status === "done" || job.status === "failed") return job;
  job.status = "processing";
  job.started_at = new Date().toISOString();
  await deps.store.putJob(job);

  const dir = await mkdtemp(path.join(deps.workDir ?? tmpdir(), "transcode-"));
  const input = path.join(dir, "in.mp4");
  const output = path.join(dir, "out.mp4");
  try {
    job.input_bytes = await deps.download(job.video_url, input);
    const summary = summarizeProbe(await deps.ffprobe(input));
    job.input = compactSummary(summary);
    const issues = complianceIssues(summary, job.target);
    if (!issues.length) {
      job.unchanged = true;
      job.bytes = summary.size;
      job.output = job.input;
      job.note = "plik spełnia profil — bez przekodowania";
    } else {
      job.note = `przekodowanie: ${issues.join(", ")}`;
      let previous = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const plan = planEncode(summary, job.target, previous);
        job.plan = plan;
        await deps.runFfmpeg(
          ffmpegTranscodeArgs(plan, { preset: deps.preset ?? "medium" }),
          dir,
          deps.timeoutMs,
        );
        const size = (await stat(output)).size;
        if (size <= job.target.max_bytes) break;
        if (attempt === 1) {
          throw new Error(
            `po kompresji plik ma ${formatMb(size)} — nie mieści się w ${formatMb(job.target.max_bytes)} (za długi materiał dla tego limitu)`,
          );
        }
        previous = { bytes: size, video_kbps: plan.video_kbps };
      }
      const outSummary = summarizeProbe(await deps.ffprobe(output));
      job.output = compactSummary(outSummary);
      job.bytes = outSummary.size;
      const leftovers = complianceIssues(outSummary, job.target);
      if (leftovers.length) {
        throw new Error(`wynik nadal niezgodny z profilem: ${leftovers.join(", ")}`);
      }
      job.uploaded = false;
      if (job.upload_url) {
        try {
          await deps.upload(output, job.upload_url, "video/mp4");
          job.uploaded = true;
        } catch (e) {
          job.upload_error = String(e?.message ?? e).slice(0, 500);
        }
      }
      if (!job.uploaded) {
        await deps.store.putResult(job.id, output);
        job.result_in_store = true;
      }
    }
    job.status = "done";
  } catch (e) {
    job.status = "failed";
    job.error = String(e?.message ?? e).slice(0, 2000);
  } finally {
    job.finished_at = new Date().toISOString();
    // Podpisany URL uploadu nie jest już potrzebny — nie trzymamy go w S3.
    job.upload_url = null;
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await deps.store.putJob(job);
  }
  return job;
}

/**
 * Router HTTP (Function URL). `invokeWorker(id)` uruchamia kodowanie
 * asynchronicznie (Lambda Event) — odpowiedź na POST nie czeka na FFmpega.
 */
export async function route(req, deps) {
  const parts = req.path.split("/").filter(Boolean);
  if (req.method === "GET" && req.path === "/health") {
    return {
      status: 200,
      body: {
        ok: true,
        engine: "aws-lambda",
        region: deps.region ?? null,
        ffmpeg: await deps.ffmpegVersion(),
        transcode: true,
        probe: false,
      },
    };
  }
  if (!deps.authorized(req.headers.authorization ?? "")) {
    throw new HttpError(401, "brak albo zły sekret");
  }
  if (req.method === "POST" && parts.length === 1 && parts[0] === "jobs") {
    let body;
    try {
      body = JSON.parse(req.body || "{}");
    } catch {
      throw new HttpError(400, "body nie jest poprawnym JSON");
    }
    const job = await createJob(body, deps);
    await deps.invokeWorker(job.id);
    return { status: 202, body: { id: job.id, kind: job.kind, status: job.status } };
  }
  if (parts.length >= 2 && parts[0] === "jobs") {
    if (!isJobId(parts[1])) throw new HttpError(404, "nie ma takiego zadania");
    const job = await deps.store.getJob(parts[1]);
    if (!job) throw new HttpError(404, "nie ma takiego zadania");
    if (req.method === "GET" && parts.length === 2) {
      const fileUrl =
        job.status === "done" && job.result_in_store ? await deps.store.resultUrl(job.id) : null;
      return { status: 200, body: publicJob(job, fileUrl) };
    }
    if (req.method === "DELETE" && parts.length === 2) {
      if (job.status === "processing") throw new HttpError(409, "zadanie w trakcie przetwarzania");
      await deps.store.deleteResult(job.id);
      await deps.store.deleteJob(job.id);
      return { status: 204, body: null };
    }
  }
  throw new HttpError(404, "nie ma takiej ścieżki");
}
