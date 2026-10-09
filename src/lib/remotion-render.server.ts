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

type LambdaClient = typeof import("@remotion/lambda-client");
let clientPromise: Promise<LambdaClient> | null = null;
const lambdaClient = (): Promise<LambdaClient> =>
  (clientPromise ??= import("@remotion/lambda-client"));

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
  const { renderMediaOnLambda } = await lambdaClient();
  const { renderId, bucketName } = await renderMediaOnLambda({
    region: env.region as never,
    functionName: env.functionName,
    serveUrl: env.serveUrl,
    composition: REMOTION_COMPOSITION,
    inputProps: { videoUrl: input.videoUrl, plan, name: input.name ?? "studio" },
    codec: "h264",
    // Plik i tak kopiujemy do `studio-media`; publiczny obiekt w S3 da się
    // pobrać bez podpisywania (S3 SDK nie jest potrzebny w workerze).
    privacy: "public",
    framesPerLambda: env.framesPerLambda,
    downloadBehavior: { type: "download", fileName: null },
  });
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
  const { getRenderProgress } = await lambdaClient();
  const p = await getRenderProgress({
    renderId: ref.renderId,
    bucketName: ref.bucketName,
    functionName: env.functionName,
    region: env.region as never,
  });
  if (p.fatalErrorEncountered) {
    const msg = p.errors?.map((e: { message?: string }) => e.message).filter(Boolean)[0];
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

/** Sprzątanie w S3 — nie może psuć przebiegu. */
export async function discardRemotionRender(id: string): Promise<void> {
  const ref = parseRemotionJobId(id);
  if (!ref) return;
  try {
    const env = requireEnv();
    const { deleteRender } = await lambdaClient();
    await deleteRender({
      region: env.region as never,
      bucketName: ref.bucketName,
      renderId: ref.renderId,
    });
  } catch (e) {
    console.warn(
      `[remotion] sprzątanie renderu ${ref.renderId} nieudane: ${e instanceof Error ? e.message : e}`,
    );
  }
}
