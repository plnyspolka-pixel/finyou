import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { defaultProfiles, resolveProfiles } from "./autopilot/profiles";
import type { Track } from "./autopilot/types";

export function resolveCommentTrack(queueTrack: unknown, job?: { track?: unknown; material_audience?: unknown } | null): Track {
  if (queueTrack === "inwestor" || queueTrack === "pozyczkobiorca") return queueTrack;
  if (job?.track === "inwestor" || job?.track === "pozyczkobiorca") return job.track;
  return job?.material_audience === "inwestor" ? "inwestor" : "pozyczkobiorca";
}

// Only invoked immediately after a NEW successful upload. Never scans old videos.
// A durable one-shot claim also protects ambiguous POST outcomes (no blind retry).
export async function addYoutubeFirstComment(queueId: string, videoId: string): Promise<void> {
  try {
    const { data: item, error } = await supabaseAdmin.from("youtube_publish_queue")
      .update({ first_comment_started_at: new Date().toISOString() })
      .eq("id", queueId).eq("youtube_video_id", videoId).eq("status", "published")
      .is("first_comment_id", null).is("first_comment_started_at", null)
      .select("track,studio_job_id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!item) return;
    let job: { track?: unknown; material_audience?: unknown } | null = null;
    if (item.studio_job_id && item.track !== "inwestor" && item.track !== "pozyczkobiorca") {
      const result = await supabaseAdmin.from("studio_video_jobs")
        .select("track,material_audience").eq("id", item.studio_job_id).maybeSingle();
      if (result.error) throw new Error(result.error.message);
      job = result.data;
    }
    const track = resolveCommentTrack(item.track, job);
    const settings = await supabaseAdmin.from("ai_growth_settings")
      .select("audience_profiles").limit(1).maybeSingle();
    if (settings.error) throw new Error(settings.error.message);
    const { profiles } = resolveProfiles(settings.data ?? {});
    const comment = profiles[track].youtubeFirstComment ?? defaultProfiles()[track].youtubeFirstComment;
    if (!comment) throw new Error("Brak konfiguracji komentarza YouTube.");
    const { youtubeRequest } = await import("./youtube-api.server");
    const result = await youtubeRequest("/commentThreads", {
      method: "POST", query: { part: "snippet" },
      json: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: `${comment.text} ${comment.url}` } } } },
    });
    const commentId = result?.snippet?.topLevelComment?.id;
    if (typeof commentId !== "string" || !commentId) throw new Error("YouTube nie zwrócił ID komentarza.");
    const saved = await supabaseAdmin.from("youtube_publish_queue")
      .update({ first_comment_id: commentId, first_comment_error: null }).eq("id", queueId);
    if (saved.error) throw new Error(saved.error.message);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    // Neither a comment failure nor a logging/storage failure may fail publication.
    try {
      await supabaseAdmin.from("youtube_publish_queue")
        .update({ first_comment_error: message }).eq("id", queueId);
      const logged = await supabaseAdmin.from("ai_growth_action_log").insert({
        module: "growth_engine", action: "youtube_first_comment", status: "warning",
        summary: "Film opublikowany, ale pierwszy komentarz YouTube nie został potwierdzony.",
        payload: { queue_id: queueId, youtube_video_id: videoId, error: message },
      });
      if (logged.error) console.warn("[growth_engine] Nie udało się zapisać ostrzeżenia komentarza YouTube.");
    } catch {
      console.warn("[growth_engine] Nie udało się zapisać ostrzeżenia komentarza YouTube.");
    }
  }
}