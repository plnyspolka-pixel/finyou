// Pipeline YouTube — orkiestracja serwerowa (moduł 5 promptu SEO):
//   queued → (video-script-gen) → script_ready → (adapter renderu) →
//   rendering → rendered → (youtube_publish_queue, za flagą env) →
//   publish_queued → published (+ zapis youtube_video_id w treści źródłowej).
// Upload robi ISTNIEJĄCY moduł YouTube Shorts (OAuth + quota) — my tylko
// dokładamy wpis do jego kolejki.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseVideoScript } from "./core";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = process.env.VIDEO_SCRIPT_MODEL ?? "google/gemini-2.5-flash";

// Tabele modułu nie są jeszcze w wygenerowanych typach Supabase.
const db = supabaseAdmin as unknown as SupabaseClient;

export function autoUploadEnabled(): boolean {
  return process.env.VIDEO_PIPELINE_AUTO_UPLOAD === "1";
}

type PipelineRow = {
  id: string;
  source_type: "blog" | "location";
  source_slug: string;
  source_title: string;
  source_url: string;
  script_md: string | null;
  yt_title_options: string[];
  yt_title: string | null;
  yt_description: string | null;
  yt_tags: string[];
  status: string;
  render_provider: string | null;
  render_video_id: string | null;
  video_url: string | null;
  youtube_queue_id: string | null;
  youtube_video_id: string | null;
};

/** Dodaje opublikowany artykuł bloga do kolejki pipeline'u (status queued). */
export async function enqueueArticle(slug: string): Promise<{ ok: boolean; error?: string }> {
  const { data: article } = await db
    .from("ai_seo_articles")
    .select("slug, title, status")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!article) return { ok: false, error: "Artykuł nie istnieje albo nie jest opublikowany" };
  const { error } = await db.from("video_pipeline").upsert(
    {
      source_type: "blog",
      source_slug: article.slug,
      source_title: article.title,
      source_url: `https://financeyou.pl/blog/${article.slug}`,
      status: "queued",
    },
    { onConflict: "source_type,source_slug", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const SCRIPT_SYSTEM = `Jesteś scenarzystą YouTube kanału Finance You (pożyczki prywatne pod zastaw nieruchomości, rynek polski). Z przekazanego artykułu piszesz scenariusz filmu 5–8 minut (ok. 700–1100 słów mówionych).

WYMAGANA STRUKTURA scenariusza (markdown):
1. HOOK (pierwsze 15 sekund — konkretny problem/pytanie widza),
2. 3–4 SEKCJE merytoryczne (nagłówki ##; mówiony, naturalny język),
3. CTA na końcu (zaproszenie na stronę artykułu i do bezpłatnego wniosku na financeyou.pl).

ZASADY:
- Po polsku, profesjonalnie, bez żargonu i bez lania wody.
- Korzystaj WYŁĄCZNIE z faktów i liczb obecnych w artykule — nie dodawaj własnych statystyk.
- Zero obietnic niezgodnych z prawem ("gwarantowana pożyczka", "bez weryfikacji", "pewny zysk").
- Opis YT: 2–3 akapity streszczenia + zachęta do przeczytania artykułu.
- Tagi: 8–15 polskich fraz.
- 3 propozycje tytułów (maks. 90 znaków, bez clickbaitu niezgodnego z treścią).`;

/** Generuje scenariusz dla wpisu pipeline'u (status queued → script_ready). */
export async function generateVideoScript(
  pipelineId: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { ok: false, error: "LOVABLE_API_KEY missing" };

  const { data: item } = await db
    .from("video_pipeline")
    .select("id, source_type, source_slug, source_url, source_title, status")
    .eq("id", pipelineId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Wpis pipeline nie istnieje" };

  let articleBody = "";
  if (item.source_type === "blog") {
    const { data: article } = await db
      .from("ai_seo_articles")
      .select("title, content_md, excerpt")
      .eq("slug", item.source_slug)
      .maybeSingle();
    if (!article?.content_md) return { ok: false, error: "Brak treści artykułu źródłowego" };
    articleBody = `# ${article.title}\n\n${article.content_md}`.slice(0, 30000);
  } else {
    const { data: page } = await db
      .from("seo_location_pages")
      .select("name, content")
      .eq("slug", item.source_slug)
      .maybeSingle();
    if (!page?.content) return { ok: false, error: "Brak treści podstrony źródłowej" };
    articleBody = JSON.stringify(page.content).slice(0, 30000);
  }

  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SCRIPT_SYSTEM },
        {
          role: "user",
          content: `Artykuł źródłowy (URL: ${item.source_url}):\n\n${articleBody}\n\nNapisz scenariusz, opis, tagi i 3 tytuły.`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_script",
            description: "Zapisz scenariusz wideo",
            parameters: {
              type: "object",
              properties: {
                title_options: {
                  type: "array",
                  items: { type: "string" },
                  description: "Dokładnie 3 propozycje tytułów",
                },
                script_md: {
                  type: "string",
                  description: "Scenariusz markdown (hook, sekcje, CTA)",
                },
                description: { type: "string", description: "Opis YT (bez linku — dokleimy)" },
                tags: { type: "array", items: { type: "string" } },
              },
              required: ["title_options", "script_md", "description", "tags"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "save_script" } },
    }),
  });
  if (!res.ok) return { ok: false, error: `AI gateway: ${res.status}` };

  const json = (await res.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  let script = null;
  try {
    const args = JSON.parse(
      json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}",
    );
    script = parseVideoScript(args, item.source_url);
  } catch {
    /* spadnie niżej */
  }
  if (!script) return { ok: false, error: "AI nie zwróciło kompletnego scenariusza" };

  const { error } = await db
    .from("video_pipeline")
    .update({
      script_md: script.scriptMd,
      yt_title_options: script.titleOptions,
      yt_title: script.titleOptions[0],
      yt_description: script.description,
      yt_tags: script.tags,
      status: "script_ready",
      script_generated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", pipelineId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Startuje render przez adapter. Brak konfiguracji adaptera NIE jest błędem —
 * wpis zostaje w script_ready (render ręczny), zgodnie ze specyfikacją.
 */
export async function startRender(
  pipelineId: string,
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const { getRenderAdapter, scriptToVoiceText } = await import("./render.server");
  const adapter = getRenderAdapter();
  if (!adapter.isConfigured()) {
    return {
      ok: true,
      skipped: `Adapter ${adapter.name} nieskonfigurowany (brak kluczy env) — scenariusz czeka na render ręczny`,
    };
  }
  const { data: item } = await db
    .from("video_pipeline")
    .select("id, script_md, status")
    .eq("id", pipelineId)
    .maybeSingle();
  if (!item?.script_md) return { ok: false, error: "Brak scenariusza" };
  if (item.status !== "script_ready") return { ok: false, error: `Zły status: ${item.status}` };

  try {
    const started = await adapter.startRender(scriptToVoiceText(item.script_md));
    await db
      .from("video_pipeline")
      .update({
        status: "rendering",
        render_provider: started.provider,
        render_video_id: started.jobId,
        last_error: null,
      })
      .eq("id", pipelineId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("video_pipeline").update({ last_error: msg }).eq("id", pipelineId);
    return { ok: false, error: msg };
  }
}

/** Wpis rendered → kolejka istniejącego modułu YouTube (upload za flagą env). */
export async function enqueueYoutubeUpload(
  pipelineId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: item } = await db
    .from("video_pipeline")
    .select("id, yt_title, yt_description, yt_tags, video_url, status")
    .eq("id", pipelineId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Wpis nie istnieje" };
  if (item.status !== "rendered" || !item.video_url) {
    return { ok: false, error: "Wpis nie ma gotowego wideo (status rendered)" };
  }
  const { data: queued, error } = await db
    .from("youtube_publish_queue")
    .insert({
      title: item.yt_title ?? "Finance You",
      description: item.yt_description ?? "",
      tags: item.yt_tags ?? [],
      source_video_url: item.video_url,
      privacy_status: process.env.VIDEO_PIPELINE_YT_PRIVACY ?? "public",
      scheduled_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await db
    .from("video_pipeline")
    .update({ status: "publish_queued", youtube_queue_id: queued.id })
    .eq("id", pipelineId);
  return { ok: true };
}

/** Zapisuje youtube_video_id na stronie źródłowej (embed po publikacji). */
async function embedOnSource(item: PipelineRow, youtubeVideoId: string) {
  const table = item.source_type === "blog" ? "ai_seo_articles" : "seo_location_pages";
  await db.from(table).update({ youtube_video_id: youtubeVideoId }).eq("slug", item.source_slug);
}

/**
 * Cron tick (co godzinę):
 *  1) poll renderów w toku (rendering → rendered/failed),
 *  2) za flagą VIDEO_PIPELINE_AUTO_UPLOAD=1: rendered → kolejka YouTube,
 *  3) sync opublikowanych uploadów (publish_queued → published + embed).
 */
export async function runVideoPipelineTick(): Promise<{
  ok: boolean;
  polled: number;
  queuedUploads: number;
  published: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let polled = 0;
  let queuedUploads = 0;
  let published = 0;

  // 1) Poll renderów.
  const { data: rendering } = await db
    .from("video_pipeline")
    .select("id, render_video_id")
    .eq("status", "rendering")
    .not("render_video_id", "is", null)
    .limit(10);
  if (rendering?.length) {
    const { getRenderAdapter } = await import("./render.server");
    const adapter = getRenderAdapter();
    if (adapter.isConfigured()) {
      for (const r of rendering) {
        try {
          const s = await adapter.checkRender(r.render_video_id);
          polled++;
          if (s.status === "done" && s.videoUrl) {
            await db
              .from("video_pipeline")
              .update({
                status: "rendered",
                video_url: s.videoUrl,
                rendered_at: new Date().toISOString(),
              })
              .eq("id", r.id);
          } else if (s.status === "failed") {
            await db
              .from("video_pipeline")
              .update({ status: "failed", last_error: s.error ?? "render failed" })
              .eq("id", r.id);
          }
        } catch (e) {
          errors.push(`poll ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  // 2) Automatyczny upload wyłącznie za flagą env.
  if (autoUploadEnabled()) {
    const { data: rendered } = await db
      .from("video_pipeline")
      .select("id")
      .eq("status", "rendered")
      .limit(3);
    for (const r of rendered ?? []) {
      const res = await enqueueYoutubeUpload(r.id);
      if (res.ok) queuedUploads++;
      else errors.push(`upload ${r.id}: ${res.error}`);
    }
  }

  // 3) Sync opublikowanych uploadów + embed na stronie źródłowej.
  const { data: waiting } = await db
    .from("video_pipeline")
    .select("*")
    .eq("status", "publish_queued")
    .not("youtube_queue_id", "is", null)
    .limit(20);
  for (const item of (waiting ?? []) as PipelineRow[]) {
    const { data: queueRow } = await db
      .from("youtube_publish_queue")
      .select("status, youtube_video_id, last_error")
      .eq("id", item.youtube_queue_id)
      .maybeSingle();
    if (!queueRow) continue;
    if (queueRow.status === "published" && queueRow.youtube_video_id) {
      await db
        .from("video_pipeline")
        .update({
          status: "published",
          youtube_video_id: queueRow.youtube_video_id,
          published_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      await embedOnSource(item, queueRow.youtube_video_id);
      published++;
    } else if (queueRow.status === "failed" || queueRow.status === "cancelled") {
      await db
        .from("video_pipeline")
        .update({
          status: "failed",
          last_error: queueRow.last_error ?? `upload ${queueRow.status}`,
        })
        .eq("id", item.id);
    }
  }

  return { ok: true, polled, queuedUploads, published, errors };
}
