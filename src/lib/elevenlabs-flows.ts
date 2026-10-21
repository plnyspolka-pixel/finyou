// ElevenLabs Flows (obraz i wideo) — kształt zapytań i odpowiedzi, bez I/O.
// Dokumentacja: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/image-and-video
//   POST /v1/flows/video   {model_id, prompt, duration_secs, aspect_ratio, resolution, generate_audio}
//   POST /v1/flows/image   {model_id, prompt, aspect_ratio, …}
//   GET  /v1/flows/{video|image}/{generation_id}
//        → {id, status: pending|generating|completed|failed, content_url?, failure_reason?}
// `content_url` wygasa ok. 1 h — plik kopiujemy do naszego Storage od razu.
// Konto bez planu Pro dostaje 402 („requires a Pro plan”) — wtedy hook schodzi
// na obraz z innego źródła, a raport autopilota zgłasza brak planu.

export const FLOWS_VIDEO_PATH = "/v1/flows/video";
export const FLOWS_IMAGE_PATH = "/v1/flows/image";
export const FLOWS_VIDEO_STATUS_PATH = "/v1/flows/video/{id}";
export const FLOWS_IMAGE_STATUS_PATH = "/v1/flows/image/{id}";

export const FLOWS_VIDEO_MODEL = "veo-3.1-fast-generate-001";
export const FLOWS_IMAGE_MODEL = "gemini-3.1-flash-image";

/** Veo 3.1 przyjmuje 4, 6 albo 8 s. */
const VEO_DURATIONS = [4, 6, 8] as const;

export function snapVeoDuration(seconds: number | undefined | null): number {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return 4;
  return VEO_DURATIONS.find((d) => d >= s) ?? 8;
}

export function flowsVideoBody(input: {
  prompt: string;
  model?: string | null;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  generateAudio?: boolean;
  startFrameUrl?: string | null;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model_id: input.model?.trim() || FLOWS_VIDEO_MODEL,
    prompt: input.prompt,
    duration_secs: snapVeoDuration(input.durationSeconds),
    aspect_ratio: input.aspectRatio?.trim() || "9:16",
    resolution: input.resolution?.trim() || "720p",
    // Dźwięk hooka robi osobno Sound Effects (zgrany z uderzeniem w Remotion).
    generate_audio: input.generateAudio === true,
  };
  if (input.startFrameUrl) body.start_frame = { url: input.startFrameUrl };
  return body;
}

export function flowsImageBody(input: {
  prompt: string;
  model?: string | null;
  aspectRatio?: string | null;
}): Record<string, unknown> {
  return {
    model_id: input.model?.trim() || FLOWS_IMAGE_MODEL,
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio?.trim() || "9:16",
  };
}

export type FlowsGeneration = {
  id: string | null;
  status: "pending" | "generating" | "completed" | "failed" | "unknown";
  contentUrl: string | null;
  mimeType: string | null;
  failure: string | null;
};

export function parseFlowsGeneration(json: unknown): FlowsGeneration {
  const j = (json ?? {}) as Record<string, unknown>;
  const statuses = ["pending", "generating", "completed", "failed"] as const;
  const status = statuses.find((s) => s === j.status) ?? "unknown";
  const pick = (...keys: string[]) => {
    for (const k of keys) if (typeof j[k] === "string" && j[k]) return j[k] as string;
    return null;
  };
  return {
    id: pick("id", "generation_id"),
    status,
    contentUrl: pick("content_url", "url", "video_url", "image_url"),
    mimeType: pick("content_mime_type", "mime_type"),
    failure: [pick("failure_reason"), pick("error_message")].filter(Boolean).join(": ") || null,
  };
}

/** 402 / „Pro plan” — konto bez dostępu do Flows (nie błąd do ponawiania). */
export function isFlowsPlanError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /HTTP 402|paid_plan_required|pro plan/i.test(msg);
}

export const FLOWS_PRO_NOTE =
  "ElevenLabs Flows (wideo/obraz) wymaga planu Pro — konto zwraca 402; hook z zapasowego źródła.";
