// Klient ElevenLabs Flows (obraz / wideo) — patrz elevenlabs-flows.ts.
import {
  FLOWS_IMAGE_PATH,
  FLOWS_VIDEO_PATH,
  flowsImageBody,
  flowsVideoBody,
  parseFlowsGeneration,
  type FlowsGeneration,
} from "./elevenlabs-flows";
import { elevenRequest } from "./elevenlabs-api.server";

export async function startFlowsVideo(
  input: Parameters<typeof flowsVideoBody>[0],
): Promise<FlowsGeneration> {
  const r = await elevenRequest(FLOWS_VIDEO_PATH, {
    method: "POST",
    json: flowsVideoBody(input),
    accept: "application/json",
    timeoutMs: 60_000,
  });
  return parseFlowsGeneration(r.json);
}

export async function startFlowsImage(
  input: Parameters<typeof flowsImageBody>[0],
): Promise<FlowsGeneration> {
  const r = await elevenRequest(FLOWS_IMAGE_PATH, {
    method: "POST",
    json: flowsImageBody(input),
    accept: "application/json",
    timeoutMs: 60_000,
  });
  return parseFlowsGeneration(r.json);
}

export async function getFlowsGeneration(
  kind: "video" | "image",
  id: string,
): Promise<FlowsGeneration> {
  const base = kind === "video" ? FLOWS_VIDEO_PATH : FLOWS_IMAGE_PATH;
  const r = await elevenRequest(`${base}/${encodeURIComponent(id)}`, {
    accept: "application/json",
    timeoutMs: 30_000,
  });
  return parseFlowsGeneration(r.json);
}

/**
 * Gotowa generacja → kopia w `studio-media` (content_url wygasa po ~1 h).
 */
export async function storeFlowsResult(
  gen: FlowsGeneration,
  name: string,
): Promise<{ url: string; contentType: string }> {
  if (gen.status !== "completed" || !gen.contentUrl) {
    throw new Error(`Flows: generacja nie jest gotowa (${gen.failure ?? gen.status}).`);
  }
  const { fetchBytes, storeMedia } = await import("./media-storage.server");
  const file = await fetchBytes(gen.contentUrl, 120 * 1024 * 1024);
  const contentType = gen.mimeType ?? file.contentType ?? "application/octet-stream";
  const stored = await storeMedia(file.bytes, {
    contentType,
    visibility: "public",
    prefix: "studio-hook",
    name,
  });
  return { url: stored.url, contentType };
}
