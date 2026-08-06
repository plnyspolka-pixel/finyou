// Studio publikacji — kolejka wsadowa wideo HeyGen + auto-publikacja.
//
// Joby ze statusem 'queued' (wstawiane hurtowo z bazy pytań lub pojedynczo)
// przetwarza processStudioVideoQueue: scenariusz AI (jeśli pusty) → ElevenLabs
// TTS → HeyGen. Renderujące joby domyka pollStudioRenderingJobs, a gotowe
// z ustawionymi auto_publish_platforms trafiają automatycznie do kolejek
// publikacji (youtube_publish_queue / social_publish_queue).
//
// Wołane z dwóch miejsc: tick social-publish-tick (pg_cron co 10 min,
// działa też przy zamkniętej przeglądarce) oraz otwarty panel admina
// (processStudioVideoQueueNow — szybszy postęp).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseShortsPromptTag, findShortsQuestion } from "./shorts-question-bank";

type JobRow = {
  id: string;
  prompt: string;
  script: string;
  avatar_id: string;
  voice_id: string;
  heygen_video_id: string | null;
  status: string;
  video_url: string | null;
  auto_publish_platforms: string[];
  publish_privacy: string;
  publish_title: string;
  publish_description: string;
  auto_published_at: string | null;
  created_by: string | null;
};

// Tytuł do publikacji: publish_title, a w ostateczności prompt bez tagu "#N · ".
function fallbackTitle(job: JobRow): string {
  if (job.publish_title.trim()) return job.publish_title.trim();
  return job.prompt.replace(/^#\d{1,3} · /, "").slice(0, 92);
}

// Przetwarza do `limit` jobów 'queued': scenariusz → TTS → HeyGen → rendering.
// Zwraca liczbę przetworzonych i pozostałych w kolejce.
export async function processStudioVideoQueue(
  limit: number,
): Promise<{ processed: number; failed: number; remaining: number }> {
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < limit; i++) {
    // Claim najstarszego joba z kolejki — warunek status='queued' w UPDATE
    // chroni przed podwójnym przetworzeniem (tick vs otwarty panel).
    const { data: queued } = await supabaseAdmin
      .from("studio_video_jobs")
      .select("id")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!queued) break;

    const { data: claimed } = await supabaseAdmin
      .from("studio_video_jobs")
      .update({ status: "generating_script" })
      .eq("id", queued.id)
      .eq("status", "queued")
      .select("*");
    const job: JobRow | null = claimed?.[0] ?? null;
    if (!job) continue; // ktoś inny zdążył — bierz następnego

    try {
      await processClaimedJob(job);
      processed++;
    } catch (e) {
      failed++;
      await supabaseAdmin
        .from("studio_video_jobs")
        .update({ status: "failed", last_error: e instanceof Error ? e.message : String(e) })
        .eq("id", job.id);
    }
  }

  const { count } = await supabaseAdmin
    .from("studio_video_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");
  return { processed, failed, remaining: count ?? 0 };
}

async function processClaimedJob(job: JobRow): Promise<void> {
  let script = job.script.trim();
  let publishTitle = job.publish_title;
  let publishDescription = job.publish_description;

  if (!script) {
    const questionId = parseShortsPromptTag(job.prompt);
    const q = questionId != null ? findShortsQuestion(questionId) : undefined;
    let gen: { script: string; title: string; description: string; hashtags: string[] };
    if (q) {
      // Pytanie z paczki 250: gotowy, sprawdzony scenariusz 1:1 z pliku — bez AI.
      const { buildShortsScript } = await import("./shorts-script");
      gen = buildShortsScript(q);
    } else {
      const { generateVideoScript } = await import("./studio-ai.server");
      gen = await generateVideoScript(job.prompt);
    }
    script = gen.script;
    if (!publishTitle.trim()) publishTitle = gen.title;
    if (!publishDescription.trim())
      publishDescription = [gen.description, gen.hashtags.join(" ")].filter(Boolean).join("\n\n");
  }

  await supabaseAdmin
    .from("studio_video_jobs")
    .update({
      script,
      publish_title: publishTitle,
      publish_description: publishDescription,
      status: "generating_audio",
    })
    .eq("id", job.id);

  const { ttsElevenLabs, uploadAudioToHeygen, createHeygenVideoFromAudio } =
    await import("./avatar-faq.server");
  const audio = await ttsElevenLabs({ text: script, voiceId: job.voice_id });
  await supabaseAdmin.from("studio_video_jobs").update({ status: "uploading" }).eq("id", job.id);

  const assetId = await uploadAudioToHeygen(audio);
  const { resolveHeygenKind } = await import("./heygen-catalog.server");
  const videoId = await createHeygenVideoFromAudio({
    avatarId: job.avatar_id,
    audioAssetId: assetId,
    kind: await resolveHeygenKind(job.avatar_id),
  });
  await supabaseAdmin
    .from("studio_video_jobs")
    .update({ heygen_video_id: videoId, status: "rendering" })
    .eq("id", job.id);
}

// Odpytuje HeyGen o wszystkie joby 'rendering' i domyka gotowe/nieudane.
// Gotowe joby z auto-publikacją wpadają do kolejek publikacji.
export async function pollStudioRenderingJobs(): Promise<{
  completed: number;
  autoPublished: number;
}> {
  const { data: rendering } = await supabaseAdmin
    .from("studio_video_jobs")
    .select("*")
    .eq("status", "rendering")
    .not("heygen_video_id", "is", null)
    .limit(20);

  let completed = 0;
  let autoPublished = 0;
  const { getHeygenVideoStatus } = await import("./avatar-faq.server");

  for (const job of (rendering ?? []) as JobRow[]) {
    try {
      const status = await getHeygenVideoStatus(job.heygen_video_id!);
      if (status.status === "completed" && status.video_url) {
        await supabaseAdmin
          .from("studio_video_jobs")
          .update({
            status: "ready",
            video_url: status.video_url,
            thumbnail_url: status.thumbnail_url ?? null,
          })
          .eq("id", job.id);
        completed++;
        const published = await maybeAutoPublishJob({
          ...job,
          status: "ready",
          video_url: status.video_url,
        });
        if (published) autoPublished++;
      } else if (status.status === "failed") {
        await supabaseAdmin
          .from("studio_video_jobs")
          .update({
            status: "failed",
            last_error:
              typeof status.error === "string" ? status.error : JSON.stringify(status.error ?? {}),
          })
          .eq("id", job.id);
      }
    } catch {
      // Pojedynczy błąd pollingu nie blokuje pozostałych jobów.
    }
  }
  return { completed, autoPublished };
}

// Wstawia gotowy job do kolejek publikacji zgodnie z auto_publish_platforms.
// Idempotentne: auto_published_at ustawiane warunkowo (WHERE IS NULL) chroni
// przed podwójną publikacją przy wyścigu tick vs panel.
export async function maybeAutoPublishJob(job: JobRow): Promise<boolean> {
  if (!job.auto_publish_platforms.length || !job.video_url || job.auto_published_at) return false;

  const { data: stamped } = await supabaseAdmin
    .from("studio_video_jobs")
    .update({ auto_published_at: new Date().toISOString() })
    .eq("id", job.id)
    .is("auto_published_at", null)
    .select("id");
  if (!stamped?.length) return false;

  const title = fallbackTitle(job);
  const message = job.publish_description;
  const now = new Date().toISOString();
  const errors: string[] = [];

  if (job.auto_publish_platforms.includes("youtube")) {
    const { error } = await supabaseAdmin.from("youtube_publish_queue").insert({
      title,
      description: message,
      source_video_url: job.video_url,
      privacy_status: job.publish_privacy || "public",
      scheduled_at: now,
      created_by: job.created_by,
    });
    if (error) errors.push(`youtube: ${error.message}`);
  }

  const metaPlatforms = job.auto_publish_platforms.filter(
    (p): p is "facebook_post" | "facebook_reels" | "instagram_reels" => p !== "youtube",
  );
  if (metaPlatforms.length) {
    const { error } = await supabaseAdmin.from("social_publish_queue").insert(
      metaPlatforms.map((platform) => ({
        platform,
        title,
        message,
        video_url: job.video_url,
        image_url: null,
        scheduled_at: now,
        created_by: job.created_by,
      })),
    );
    if (error) errors.push(`meta: ${error.message}`);
  }

  if (errors.length) {
    await supabaseAdmin
      .from("studio_video_jobs")
      .update({ last_error: `Auto-publikacja: ${errors.join("; ")}` })
      .eq("id", job.id);
  }
  return errors.length < job.auto_publish_platforms.length;
}

// Pełny przebieg ticka: przetwórz kolejkę + domknij rendery.
export async function runStudioVideoTick(): Promise<{
  processed: number;
  failed: number;
  remaining: number;
  completed: number;
  autoPublished: number;
}> {
  const queue = await processStudioVideoQueue(2);
  const poll = await pollStudioRenderingJobs();
  return { ...queue, ...poll };
}
