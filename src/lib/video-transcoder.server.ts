// Kompresja wideo przed publikacją — wybór silnika.
//
// Od wersji z AWS kodowanie idzie na AWS Lambda (services/video-transcoder:
// FFmpeg na ~2 vCPU, preset `medium`, region projektu), a nie na darmowej
// usłudze caption-burner (Render, 0,1 vCPU). API obu jest takie samo
// (POST /jobs, GET /jobs/:id, DELETE /jobs/:id), więc reszta toru
// (src/lib/video-rendition*.ts) się nie zmienia.
//
// Konfiguracja (sekrety środowiska; wypisuje je services/video-transcoder/deploy.sh):
//   VIDEO_TRANSCODER_URL    — adres Function URL Lambdy
//   VIDEO_TRANSCODER_SECRET — Bearer (TRANSCODER_SECRET w Lambdzie)
// Bez nich kompresja zostaje na caption-burner jak dotąd.
//
// Zadania Lambdy mają id z prefiksem `aws-` — po nim rozpoznajemy, gdzie
// pytać o stan. Zadania zlecone przed przełączeniem domyka caption-burner.

import type { BurnerJobStatus } from "./caption-burner.server";

export const AWS_JOB_PREFIX = "aws-";

export type TranscoderEnv = { configured: boolean; url: string; secret: string };

export function getTranscoderEnv(): TranscoderEnv {
  const url = (process.env.VIDEO_TRANSCODER_URL ?? "").trim().replace(/\/+$/, "");
  const secret = (process.env.VIDEO_TRANSCODER_SECRET ?? "").trim();
  return { configured: Boolean(url && secret), url, secret };
}

export const isAwsTranscoderConfigured = (): boolean => getTranscoderEnv().configured;
export const isAwsTranscodeJob = (id: string): boolean => id.startsWith(AWS_JOB_PREFIX);

/** Gdzie trafią NOWE zlecenia kompresji. */
export async function transcodeEngine(): Promise<"aws-lambda" | "caption-burner" | null> {
  if (isAwsTranscoderConfigured()) return "aws-lambda";
  const { isCaptionBurnerConfigured } = await import("./caption-burner.server");
  return isCaptionBurnerConfigured() ? "caption-burner" : null;
}

export async function isTranscodeConfigured(): Promise<boolean> {
  return (await transcodeEngine()) !== null;
}

async function awsFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const env = getTranscoderEnv();
  if (!env.configured) {
    throw new Error("Kompresja AWS nie jest skonfigurowana (VIDEO_TRANSCODER_URL / _SECRET).");
  }
  try {
    return await fetch(`${env.url}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${env.secret}`,
        accept: "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `video-transcoder (AWS): ${/abort|timeout/i.test(msg) ? "przekroczony czas odpowiedzi" : msg}`,
    );
  }
}

async function errorOf(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { error?: unknown };
    if (json?.error) return String(json.error);
  } catch {
    // nie-JSON
  }
  return text.slice(0, 300) || `HTTP ${res.status}`;
}

type AwsJob = {
  status?: string;
  error?: string | null;
  unchanged?: boolean;
  uploaded?: boolean;
  upload_error?: string | null;
  bytes?: number | null;
  note?: string | null;
  file_url?: string | null;
};

async function getAwsJob(id: string): Promise<AwsJob | null> {
  const res = await awsFetch(`/jobs/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`video-transcoder (AWS): ${await errorOf(res)}`);
  return (await res.json().catch(() => null)) as AwsJob | null;
}

/** Zleca kompresję do profilu publikacji — na AWS, gdy skonfigurowany. Zwraca id zadania. */
export async function submitTranscodeJob(input: {
  videoUrl: string;
  uploadUrl: string | null;
  target: Record<string, number>;
  name?: string;
}): Promise<string> {
  if (!isAwsTranscoderConfigured()) {
    const { submitTranscode } = await import("./caption-burner.server");
    return submitTranscode(input);
  }
  const res = await awsFetch("/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "transcode",
      video_url: input.videoUrl,
      upload_url: input.uploadUrl ?? undefined,
      target: input.target,
      name: input.name ?? "publikacja",
    }),
  });
  if (!res.ok) throw new Error(`video-transcoder (AWS): ${await errorOf(res)}`);
  const json = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!json?.id) throw new Error("video-transcoder (AWS): odpowiedź bez id zadania.");
  return json.id;
}

const KNOWN = ["queued", "processing", "done", "failed"] as const;

/** Stan zadania — z AWS albo z caption-burner, zależnie od id. */
export async function getTranscodeJobStatus(id: string): Promise<BurnerJobStatus> {
  if (!isAwsTranscodeJob(id)) {
    const { getBurnerJobStatus } = await import("./caption-burner.server");
    return getBurnerJobStatus(id);
  }
  const job = await getAwsJob(id);
  if (!job) {
    return {
      status: "missing",
      error: "AWS nie zna tego zadania (wygasło po 2 dniach?)",
      unchanged: false,
      uploaded: false,
      upload_error: null,
      bytes: null,
      note: null,
    };
  }
  const status = KNOWN.find((s) => s === job.status) ?? "failed";
  return {
    status,
    error: job.error ?? (status === "failed" ? "nieznany błąd kompresji AWS" : null),
    unchanged: job.unchanged === true,
    uploaded: job.uploaded === true,
    upload_error: job.upload_error ?? null,
    bytes: typeof job.bytes === "number" ? job.bytes : null,
    note: job.note ? `${job.note} (AWS Lambda)` : "AWS Lambda",
  };
}

/** Wynik zadania, gdy usługa nie wgrała go sama do Storage (z limitem rozmiaru). */
export async function fetchTranscodeFile(id: string, maxBytes: number): Promise<ArrayBuffer> {
  if (!isAwsTranscodeJob(id)) {
    const { fetchBurnerFile } = await import("./caption-burner.server");
    return fetchBurnerFile(id, maxBytes);
  }
  const job = await getAwsJob(id);
  if (!job?.file_url) throw new Error("video-transcoder (AWS): brak pliku wyniku w S3.");
  // Podpisany link S3 — bez nagłówka autoryzacji.
  const res = await fetch(job.file_url, { signal: AbortSignal.timeout(5 * 60_000) });
  if (!res.ok) throw new Error(`video-transcoder (AWS): pobranie wyniku HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`video-transcoder (AWS): wynik za duży (${declared} B)`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error("video-transcoder (AWS): wynik za duży");
  return bytes;
}

/** Sprzątanie zadania (stan i ewentualny wynik w S3); błędy ignorujemy. */
export async function discardTranscodeJob(id: string): Promise<void> {
  if (!isAwsTranscodeJob(id)) {
    const { discardBurnerJob } = await import("./caption-burner.server");
    return discardBurnerJob(id);
  }
  try {
    await awsFetch(`/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // reguła cyklu życia S3 i tak skasuje po 2 dniach
  }
}

/** Do statusu integracji: czy Lambda odpowiada i ma FFmpega. */
export async function checkAwsTranscoderHealth(): Promise<{
  ok: boolean;
  ffmpeg: string | null;
  region: string | null;
  error: string | null;
}> {
  if (!isAwsTranscoderConfigured()) {
    return { ok: false, ffmpeg: null, region: null, error: "nie skonfigurowana" };
  }
  try {
    const res = await awsFetch("/health", { timeoutMs: 15_000 });
    if (!res.ok) return { ok: false, ffmpeg: null, region: null, error: await errorOf(res) };
    const json = (await res.json().catch(() => null)) as {
      ffmpeg?: string | null;
      region?: string | null;
    } | null;
    return { ok: true, ffmpeg: json?.ffmpeg ?? null, region: json?.region ?? null, error: null };
  } catch (e) {
    return {
      ok: false,
      ffmpeg: null,
      region: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
