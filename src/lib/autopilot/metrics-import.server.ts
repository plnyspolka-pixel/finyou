// Codzienny import metryk publikacji (brief 5.5) do ai_publication_metrics:
// Instagram (rolki, insights) i YouTube (statystyki filmów). Atrybuty
// (tor, seria, hasło, lead magnet, zadanie Studia) dopinane z kolejek
// publikacji po id posta. Tylko odczyt z platform.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { igMetricRow, insightsMap, ytMetricRow, type MetricRow } from "./metrics-import";
import { logAutopilot } from "./state.server";

const db = supabaseAdmin as unknown as { from: (t: string) => any };
const IG_MAX_PER_RUN = 30;

async function attributes(
  platform: MetricRow["platform"],
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  if (!ids.length) return out;
  const q =
    platform === "youtube"
      ? db
          .from("youtube_publish_queue")
          .select("id, youtube_video_id, track, series, keyword, lead_magnet_id, studio_job_id")
          .in("youtube_video_id", ids)
      : db
          .from("social_publish_queue")
          .select("id, external_post_id, track, series, keyword, lead_magnet_id, studio_job_id")
          .eq("platform", "instagram_reels")
          .in("external_post_id", ids);
  const { data, error } = await q;
  if (error) return out; // migracja niewdrożona – metryki bez atrybutów
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const key = String(platform === "youtube" ? r.youtube_video_id : r.external_post_id);
    out.set(key, {
      [platform === "youtube" ? "youtube_queue_id" : "social_queue_id"]: r.id,
      track: r.track ?? null,
      series: r.series ?? null,
      keyword: r.keyword ?? null,
      lead_magnet_id: r.lead_magnet_id ?? null,
      studio_job_id: r.studio_job_id ?? null,
    });
  }
  return out;
}

async function upsert(rows: MetricRow[]): Promise<number> {
  if (!rows.length) return 0;
  const attrs = await attributes(
    rows[0].platform,
    rows.map((r) => r.external_post_id),
  );
  const payload = rows.map((r) => ({ ...r, ...(attrs.get(r.external_post_id) ?? {}) }));
  const { error } = await db
    .from("ai_publication_metrics")
    .upsert(payload, { onConflict: "platform,external_post_id,captured_on" });
  if (error) throw new Error(error.message);
  return payload.length;
}

export async function importPublicationMetrics(): Promise<{
  instagram: number;
  youtube: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let instagram = 0;
  let youtube = 0;

  try {
    const m = await import("@/lib/meta-api.server");
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const media = (await m.listIgMedia({ limit: 50, since })) as Array<{
      id: string;
      media_product_type?: string;
      timestamp?: string;
      like_count?: number;
      comments_count?: number;
    }>;
    const reels = media.filter((x) => x.media_product_type === "REELS").slice(0, IG_MAX_PER_RUN);
    const rows: MetricRow[] = [];
    for (const r of reels) {
      try {
        rows.push(igMetricRow(r, insightsMap(await m.getIgMediaInsights(r.id))));
      } catch (e) {
        errors.push(`ig ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    instagram = await upsert(rows);
  } catch (e) {
    errors.push(`instagram: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const yt = await import("@/lib/youtube-api.server");
    const { videos } = await yt.listMyVideos({ limit: 50 });
    youtube = await upsert((videos as Parameters<typeof ytMetricRow>[0][]).map(ytMetricRow));
  } catch (e) {
    errors.push(`youtube: ${e instanceof Error ? e.message : String(e)}`);
  }

  await logAutopilot({
    action: "metrics_import",
    status: errors.length ? "warning" : "ok",
    summary: `Metryki: IG ${instagram}, YouTube ${youtube}${errors.length ? `, błędy: ${errors.length}` : ""}`,
    payload: { errors: errors.slice(0, 10) },
  });
  return { instagram, youtube, errors };
}
