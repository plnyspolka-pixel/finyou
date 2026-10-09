// Klient Remotion Lambda (services/remotion) — silnik wykończenia rolki
// `remotion`: kompozycja `StudioReel` kładzie na czysty master HeyGena
// napisy, znaczek „AI" i nakładki według planu z studio-reel-plan.ts.
// Zastępuje wtedy caption-burner (FFmpeg) — reszta potoku Studia (HeyGen,
// ElevenLabs, statusy `captioning` → `ready`, ponowienia) zostaje ta sama.
//
// Konfiguracja (sekrety środowiska):
//   REMOTION_AWS_ACCESS_KEY_ID / REMOTION_AWS_SECRET_ACCESS_KEY — klucz
//       użytkownika IAM z polityką `npx remotion lambda policies user`
//   REMOTION_FUNCTION_NAME — np. remotion-render-4-0-533-mem2048mb-disk2048mb-240sec
//   REMOTION_SERVE_URL     — adres strony z `npm run lambda:deploy`
//   REMOTION_REGION        — opcjonalnie, domyślnie eu-central-1 (region projektu)
//   REMOTION_FRAMES_PER_LAMBDA — opcjonalnie, domyślnie 300 (limit konta to
//       10 równoległych wywołań: 60 s rolki × 30 kl./s / 300 = 6 + orkiestrator)

import type { DynamicOverlays, CustomCaptionStyleId } from "./caption-style";
import { fetchBytes, storeMedia, type StoredMedia } from "./media-storage.server";
import { parseRemotionJobId, remotionJobId } from "./studio-render-engine";
import { buildReelPlan } from "./studio-reel-plan";
import { AwsClient } from "aws4fetch";

export const REMOTION_COMPOSITION = "StudioReel";
const MAX_SRT_BYTES = 2 * 1024 * 1024;
const MAX_RESULT_BYTES = 300 * 1024 * 1024;

export type RemotionEnv = {
  configured: boolean;
  region: string;
  functionName: string;
  serveUrl: string;
  framesPerLambda: number;
  missing: string[];
};

export function getRemotionEnv(): RemotionEnv {
  const e = process.env;
  const functionName = (e.REMOTION_FUNCTION_NAME ?? "").trim();
  const serveUrl = (e.REMOTION_SERVE_URL ?? "").trim();
  const missing = [
    ["REMOTION_AWS_ACCESS_KEY_ID", (e.REMOTION_AWS_ACCESS_KEY_ID ?? "").trim()],
    ["REMOTION_AWS_SECRET_ACCESS_KEY", (e.REMOTION_AWS_SECRET_ACCESS_KEY ?? "").trim()],
    ["REMOTION_FUNCTION_NAME", functionName],
    ["REMOTION_SERVE_URL", serveUrl],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  const fpl = Number(e.REMOTION_FRAMES_PER_LAMBDA);
  return {
    configured: missing.length === 0,
    region: (e.REMOTION_REGION ?? "").trim() || "eu-central-1",
    functionName,
    serveUrl,
    framesPerLambda: Number.isFinite(fpl) && fpl >= 20 ? Math.round(fpl) : 300,
    missing,
  };
}

export const isRemotionConfigured = (): boolean => getRemotionEnv().configured;

function requireEnv(): RemotionEnv {
  const env = getRemotionEnv();
  if (!env.configured) {
    throw new Error(`Remotion Lambda nie jest skonfigurowany (brak: ${env.missing.join(", ")}).`);
  }
  return env;
}

// Bez `@remotion/lambda-client`: paczka wciąga Node'owy AWS SDK, który już
// przy imporcie robi `require("process")`, `child_process`, `http2` — na
// Cloudflare Workerze kończy się to „No such module node:process". Lambdę
// i S3 wołamy więc wprost przez `fetch` z podpisem SigV4 (aws4fetch), a
// payload odwzorowuje `makeLambdaRenderMediaPayload` z tej samej wersji co
// wdrożona funkcja (Lambda odrzuca payload z inną wersją).
export const REMOTION_VERSION = "4.0.533";

let awsClient: { key: string; client: AwsClient } | null = null;
function aws(env: RemotionEnv): AwsClient {
  const accessKeyId = (process.env.REMOTION_AWS_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = (process.env.REMOTION_AWS_SECRET_ACCESS_KEY ?? "").trim();
  const key = `${accessKeyId}:${env.region}`;
  if (awsClient?.key !== key) {
    awsClient = {
      key,
      client: new AwsClient({ accessKeyId, secretAccessKey, region: env.region, retries: 2 }),
    };
  }
  return awsClient.client;
}

/** Synchroniczne wywołanie funkcji Remotion (Lambda Invoke, RequestResponse). */
async function invokeRemotion<T>(env: RemotionEnv, payload: Record<string, unknown>): Promise<T> {
  const url = `https://lambda.${env.region}.amazonaws.com/2015-03-31/functions/${encodeURIComponent(env.functionName)}/invocations`;
  const res = await aws(env).fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-amz-invocation-type": "RequestResponse" },
    body: JSON.stringify(payload),
    aws: { service: "lambda" },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Remotion Lambda: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  const fnError = res.headers.get("x-amz-function-error");
  if (fnError) {
    throw new Error(`Remotion Lambda: błąd funkcji (${fnError}) ${text.slice(0, 500)}`);
  }
  let body: { type?: string; message?: string } & Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Remotion Lambda: niepoprawny JSON w odpowiedzi: ${text.slice(0, 300)}`);
  }
  if (body?.type === "error") {
    throw new Error(`Remotion Lambda: ${body.message ?? "nieznany błąd"}`);
  }
  return body as T;
}

/** Odpowiednik `makeLambdaRenderMediaPayload` (4.0.533) dla naszych ustawień. */
export function buildRenderMediaPayload(input: {
  serveUrl: string;
  inputProps: unknown;
  framesPerLambda: number;
}): Record<string, unknown> {
  const props = JSON.stringify(input.inputProps ?? {});
  // Lambda przyjmuje do ~200 KB w payloadzie; większe propsy SDK wrzuca do S3.
  // Plan rolki to kilka KB — nie obsługujemy tej ścieżki, tylko ją blokujemy.
  if (props.length > 150_000) {
    throw new Error(`Remotion: propsy renderu są za duże (${Math.ceil(props.length / 1024)} KB).`);
  }
  return {
    type: "start",
    version: REMOTION_VERSION,
    enableCancellation: false,
    rendererFunctionName: null,
    framesPerLambda: input.framesPerLambda,
    concurrency: null,
    composition: REMOTION_COMPOSITION,
    serveUrl: input.serveUrl,
    inputProps: { type: "payload", payload: props },
    codec: "h264",
    imageFormat: "jpeg",
    crf: null,
    envVariables: {},
    pixelFormat: null,
    proResProfile: null,
    x264Preset: null,
    gopSize: null,
    jpegQuality: 80,
    maxRetries: 1,
    // Plik i tak kopiujemy do `studio-media`; publiczny obiekt w S3 da się
    // pobrać bez podpisywania.
    privacy: "public",
    logLevel: "info",
    frameRange: null,
    outName: null,
    timeoutInMilliseconds: 30000,
    chromiumOptions: {},
    scale: 1,
    everyNthFrame: 1,
    numberOfGifLoops: null,
    concurrencyPerLambda: 1,
    downloadBehavior: { type: "download", fileName: null },
    muted: false,
    overwrite: false,
    audioBitrate: null,
    videoBitrate: null,
    encodingBufferSize: null,
    encodingMaxRate: null,
    webhook: null,
    forceHeight: null,
    forceWidth: null,
    forceFps: null,
    forceDurationInFrames: null,
    bucketName: null,
    audioCodec: null,
    offthreadVideoCacheSizeInBytes: null,
    deleteAfter: null,
    colorSpace: null,
    preferLossless: false,
    forcePathStyle: false,
    metadata: null,
    licenseKey: null,
    offthreadVideoThreads: null,
    mediaCacheSizeInBytes: null,
    storageClass: null,
    isProduction: null,
    sampleRate: 48000,
  };
}

type RenderProgress = {
  done?: boolean;
  outputFile?: string | null;
  overallProgress?: number | null;
  fatalErrorEncountered?: boolean;
  errors?: { message?: string }[];
};

/** Zleca render `StudioReel` na Lambdzie; zwraca id do `caption_burn_id`. */
export async function submitRemotionReel(input: {
  videoUrl: string;
  srtUrl?: string | null;
  styleId?: CustomCaptionStyleId | null;
  aiBadge?: boolean;
  overlays?: DynamicOverlays | null;
  name?: string;
}): Promise<string> {
  const env = requireEnv();
  let srt: string | null = null;
  if (input.srtUrl && (input.styleId || input.overlays)) {
    try {
      srt = new TextDecoder().decode((await fetchBytes(input.srtUrl, MAX_SRT_BYTES)).bytes);
    } catch (e) {
      // Bez SRT nie ma napisów; same nakładki zostają przy szacunkowych czasach.
      if (input.styleId) throw e;
    }
  }
  const plan = buildReelPlan({
    srt,
    styleId: input.styleId ?? null,
    aiBadge: input.aiBadge === true,
    overlays: input.overlays ?? null,
  });
  const { renderId, bucketName } = await invokeRemotion<{
    renderId?: string;
    bucketName?: string;
  }>(
    env,
    buildRenderMediaPayload({
      serveUrl: env.serveUrl,
      inputProps: { videoUrl: input.videoUrl, plan, name: input.name ?? "studio" },
      framesPerLambda: env.framesPerLambda,
    }),
  );
  if (!renderId || !bucketName) {
    throw new Error("Remotion Lambda: odpowiedź bez renderId/bucketName.");
  }
  return remotionJobId(bucketName, renderId);
}

export type RemotionStatus = {
  status: "processing" | "done" | "failed" | "missing";
  error: string | null;
  outputFile: string | null;
  progress: number | null;
};

export async function getRemotionRenderStatus(id: string): Promise<RemotionStatus> {
  const ref = parseRemotionJobId(id);
  if (!ref)
    return {
      status: "missing",
      error: "złe id renderu Remotion",
      outputFile: null,
      progress: null,
    };
  const env = requireEnv();
  const p = await invokeRemotion<RenderProgress>(env, {
    type: "status",
    version: REMOTION_VERSION,
    bucketName: ref.bucketName,
    renderId: ref.renderId,
    s3OutputProvider: null,
    logLevel: "info",
    forcePathStyle: false,
  });
  if (p.fatalErrorEncountered) {
    const msg = p.errors?.map((e) => e.message).filter(Boolean)[0];
    return {
      status: "failed",
      error: msg ?? "nieznany błąd renderu Remotion",
      outputFile: null,
      progress: null,
    };
  }
  if (p.done && p.outputFile) {
    return { status: "done", error: null, outputFile: p.outputFile, progress: 1 };
  }
  return {
    status: "processing",
    error: null,
    outputFile: null,
    progress: p.overallProgress ?? null,
  };
}

/** Gotowy MP4 z S3 → publiczny bucket `studio-media` (jak wynik caption-burnera). */
export async function storeRemotionResult(id: string, name: string): Promise<StoredMedia> {
  const s = await getRemotionRenderStatus(id);
  if (s.status !== "done" || !s.outputFile) {
    throw new Error(`Remotion: render nie jest gotowy (${s.error ?? s.status}).`);
  }
  const file = await fetchBytes(s.outputFile, MAX_RESULT_BYTES);
  return storeMedia(file.bytes, {
    contentType: "video/mp4",
    visibility: "public",
    prefix: "studio-napisy",
    name,
    ext: "mp4",
  });
}

/** Sprzątanie w S3 (cały prefiks `renders/<id>/`, z out.mp4) — nie może psuć przebiegu. */
export async function discardRemotionRender(id: string): Promise<void> {
  const ref = parseRemotionJobId(id);
  if (!ref) return;
  try {
    const env = requireEnv();
    const client = aws(env);
    const base = `https://${ref.bucketName}.s3.${env.region}.amazonaws.com`;
    const prefix = `renders/${ref.renderId}/`;
    // Render ma kilkadziesiąt obiektów; kilka stron listy to i tak górny limit.
    for (let page = 0; page < 10; page++) {
      const list = await client.fetch(
        `${base}/?list-type=2&max-keys=1000&prefix=${encodeURIComponent(prefix)}`,
        { aws: { service: "s3" } },
      );
      if (!list.ok) throw new Error(`S3 list: HTTP ${list.status}`);
      const keys = [...(await list.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) =>
        decodeXml(m[1]),
      );
      if (keys.length === 0) break;
      for (const key of keys) {
        const path = key.split("/").map(encodeURIComponent).join("/");
        const del = await client.fetch(`${base}/${path}`, {
          method: "DELETE",
          aws: { service: "s3" },
        });
        if (!del.ok && del.status !== 404) throw new Error(`S3 delete: HTTP ${del.status}`);
      }
    }
  } catch (e) {
    console.warn(
      `[remotion] sprzątanie renderu ${ref.renderId} nieudane: ${e instanceof Error ? e.message : e}`,
    );
  }
}

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
