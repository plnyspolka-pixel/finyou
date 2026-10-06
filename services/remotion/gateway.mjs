// Gateway — mała Lambda z adresem (Function URL), przez którą backend Finance
// You (Cloudflare Workers) zleca render rolki na Remotion Lambda i odbiera
// wynik. Dlaczego nie bezpośrednio: klient Remotion niesie w sobie cały AWS
// SDK (2,7 MB, moduły http2/fs Node), czego Worker nie udźwignie; tu działa
// natywnie, a Worker rozmawia z nim zwykłym HTTPS + Bearer — tym samym
// protokołem, co z usługą caption-burner, więc kod kolejki Studia nie zna
// różnicy.
//
//   GET    /health          → { ok, engine: "remotion", function, site, bucket }
//   POST   /jobs            → { video_url, cues, style, ai_badge, overlays, name }
//                             → 202 { id, kind: "caption", status: "queued" }
//   GET    /jobs/:id        → { id, status: queued|processing|done|failed, error,
//                               progress, bytes, cost }
//   GET    /jobs/:id/file   → { url, bytes } — podpisany link S3 (1 h); 409, gdy
//                             render jeszcze trwa
//   DELETE /jobs/:id        → 204 (kasuje pliki renderu w S3)
//
// Każde wywołanie poza /health wymaga `Authorization: Bearer <GATEWAY_SECRET>`.
// Zmienne środowiskowe ustawia deploy.mjs: GATEWAY_SECRET, REMOTION_REGION,
// REMOTION_FUNCTION_NAME, REMOTION_SERVE_URL, REMOTION_BUCKET,
// REMOTION_CONCURRENCY (ile Lambd renderuje jedną rolkę; limit konta 10
// równoległych wywołań minus jedno orkiestrujące → 8).

import { timingSafeEqual } from "node:crypto";
import {
  deleteRender,
  getRenderProgress,
  presignUrl,
  renderMediaOnLambda,
} from "@remotion/lambda-client";

const env = (name, fallback) => {
  const v = (process.env[name] ?? "").trim();
  return v || fallback;
};
const REGION = env("REMOTION_REGION", "eu-central-1");
const FUNCTION_NAME = env("REMOTION_FUNCTION_NAME", "");
const SERVE_URL = env("REMOTION_SERVE_URL", "");
const BUCKET = env("REMOTION_BUCKET", "");
const SECRET = env("GATEWAY_SECRET", "");
const COMPOSITION = env("REMOTION_COMPOSITION", "StudioReel");
const CONCURRENCY = Math.max(1, Number(env("REMOTION_CONCURRENCY", "8")) || 8);
/** Ile kwestii przyjmujemy — rolki mają kilkadziesiąt, limit chroni payload Lambdy (256 KB). */
const MAX_CUES = 3000;
const RENDER_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (status, body, headers = {}) => ({
  statusCode: status,
  headers: { "content-type": "application/json; charset=utf-8", ...headers },
  body: JSON.stringify(body),
});

function checkAuth(headers) {
  if (!SECRET) throw new HttpError(500, "GATEWAY_SECRET nie jest ustawiony");
  const auth = headers.authorization ?? headers.Authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const a = Buffer.from(token);
  const b = Buffer.from(SECRET);
  if (!token || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(401, "brak lub zły token");
  }
}

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "treść nie jest poprawnym JSON");
  }
}

function validateVideoUrl(v) {
  let url;
  try {
    url = new URL(String(v ?? ""));
  } catch {
    throw new HttpError(400, "video_url musi być adresem https");
  }
  if (url.protocol !== "https:") throw new HttpError(400, "video_url musi być adresem https");
  return url.toString();
}

function validateCues(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "cues musi być tablicą");
  if (raw.length > MAX_CUES) throw new HttpError(413, `za dużo kwestii (maks. ${MAX_CUES})`);
  return raw.map((c, i) => {
    const start = Number(c?.start);
    const end = Number(c?.end);
    const text = typeof c?.text === "string" ? c.text : "";
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text.trim()) {
      throw new HttpError(400, `kwestia ${i + 1} jest niepoprawna`);
    }
    return { start, end, text };
  });
}

/** Nazwa pliku wynikowego: slug z `name` + znacznik czasu (czytelne w S3). */
function outName(name) {
  const slug = String(name ?? "studio")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "studio"}-${Date.now()}.mp4`;
}

async function startRender(body) {
  const videoUrl = validateVideoUrl(body.video_url);
  const cues = validateCues(body.cues);
  const style = body.style && typeof body.style === "object" ? body.style : null;
  if (style && !cues.length) throw new HttpError(400, "styl napisów bez kwestii");
  const overlays = body.overlays && typeof body.overlays === "object" ? body.overlays : null;
  const aiBadge = body.ai_badge === true;
  if (!style && !aiBadge && !overlays) {
    throw new HttpError(400, "nie ma czego renderować: brak napisów, znaczka AI i nakładek");
  }
  const { renderId } = await renderMediaOnLambda({
    region: REGION,
    functionName: FUNCTION_NAME,
    serveUrl: SERVE_URL,
    forceBucketName: BUCKET,
    composition: COMPOSITION,
    inputProps: { videoUrl, cues, style, aiBadge, overlays },
    codec: "h264",
    privacy: "private",
    concurrency: CONCURRENCY,
    outName: outName(body.name),
    // Bucket ma reguły wygasania (deploy.mjs); Worker i tak kasuje render po
    // skopiowaniu pliku — to tylko bezpiecznik przed płaceniem za zapomniane pliki.
    deleteAfter: "1-day",
    downloadBehavior: { type: "download", fileName: outName(body.name) },
  });
  return { id: renderId, kind: "caption", status: "queued" };
}

function parseRenderId(id) {
  if (!RENDER_ID_RE.test(id)) throw new HttpError(400, "złe id zadania");
  return id;
}

async function progress(renderId) {
  const p = await getRenderProgress({
    region: REGION,
    functionName: FUNCTION_NAME,
    bucketName: BUCKET,
    renderId,
  });
  let status = "processing";
  let error = null;
  if (p.fatalErrorEncountered) {
    status = "failed";
    error = p.errors.map((e) => e.message ?? String(e)).join("; ").slice(0, 1000) || "błąd renderu";
  } else if (p.done) {
    status = "done";
  } else if (!p.renderMetadata) {
    status = "queued";
  }
  return {
    id: renderId,
    kind: "caption",
    status,
    error,
    progress: p.overallProgress,
    bytes: p.outputSizeInBytes ?? null,
    cost: p.costs?.displayCost ?? null,
    out: p.done && p.outKey ? { bucket: p.outBucket ?? BUCKET, key: p.outKey } : null,
  };
}

async function route(event) {
  const method = event.requestContext?.http?.method ?? "GET";
  const path = event.rawPath ?? "/";
  const parts = path.split("/").filter(Boolean);

  if (method === "GET" && path === "/health") {
    return json(200, {
      ok: Boolean(FUNCTION_NAME && SERVE_URL && BUCKET && SECRET),
      engine: "remotion",
      function: FUNCTION_NAME || null,
      site: SERVE_URL || null,
      bucket: BUCKET || null,
      composition: COMPOSITION,
      concurrency: CONCURRENCY,
    });
  }

  checkAuth(event.headers ?? {});

  if (method === "POST" && path === "/jobs") {
    const started = await startRender(parseBody(event));
    return json(202, started);
  }
  if (parts[0] === "jobs" && parts[1]) {
    const renderId = parseRenderId(parts[1]);
    if (method === "GET" && parts.length === 2) return json(200, await progress(renderId));
    if (method === "GET" && parts[2] === "file") {
      const p = await progress(renderId);
      if (p.status !== "done" || !p.out) {
        throw new HttpError(409, p.status === "failed" ? `render nieudany: ${p.error}` : "render jeszcze trwa");
      }
      const url = await presignUrl({
        region: REGION,
        bucketName: p.out.bucket,
        objectKey: p.out.key,
        expiresInSeconds: 3600,
      });
      return json(200, { url, bytes: p.bytes });
    }
    if (method === "DELETE" && parts.length === 2) {
      await deleteRender({ region: REGION, bucketName: BUCKET, renderId });
      return { statusCode: 204, body: "" };
    }
  }
  throw new HttpError(404, "nie ma takiej ścieżki");
}

export async function handler(event) {
  try {
    return await route(event);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : String(e);
    if (status >= 500) console.error("[gateway]", e);
    return json(status, { error: message });
  }
}
