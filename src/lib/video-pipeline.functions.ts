// Server functions panelu /admin/video-pipeline (moduł 5 promptu SEO).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r) => r.role === "administrator")) {
    throw new Error("Brak uprawnień");
  }
}

async function untypedAdmin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

export type VideoPipelineItem = {
  id: string;
  source_type: string;
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
  video_url: string | null;
  youtube_video_id: string | null;
  last_error: string | null;
  created_at: string;
};

export type VideoSourceArticle = { slug: string; title: string; published_at: string | null };

export const listVideoPipeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ items: VideoPipelineItem[]; sources: VideoSourceArticle[] }> => {
      await assertAdmin(context.userId);
      const db = await untypedAdmin();
      const { data: items, error } = await db
        .from("video_pipeline")
        .select(
          "id, source_type, source_slug, source_title, source_url, script_md, yt_title_options, yt_title, yt_description, yt_tags, status, render_provider, video_url, youtube_video_id, last_error, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);

      // Opublikowane artykuły, które nie mają jeszcze wpisu w pipeline.
      const { data: articles } = await db
        .from("ai_seo_articles")
        .select("slug, title, published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(50);
      const used = new Set(
        ((items ?? []) as VideoPipelineItem[])
          .filter((i) => i.source_type === "blog")
          .map((i) => i.source_slug),
      );
      const sources = ((articles ?? []) as VideoSourceArticle[]).filter((a) => !used.has(a.slug));
      return { items: (items ?? []) as VideoPipelineItem[], sources };
    },
  );

export const enqueueVideoSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ slug: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { enqueueArticle } = await import("@/lib/video-pipeline/server");
    const res = await enqueueArticle(data.slug);
    if (!res.ok) throw new Error(res.error ?? "Nie udało się dodać do kolejki");
    return { ok: true };
  });

export const generateVideoScriptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { generateVideoScript } = await import("@/lib/video-pipeline/server");
    const res = await generateVideoScript(data.id);
    if (!res.ok) throw new Error(res.error ?? "Generowanie scenariusza nie powiodło się");
    return { ok: true };
  });

export const startVideoRenderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { startRender } = await import("@/lib/video-pipeline/server");
    const res = await startRender(data.id);
    if (!res.ok) throw new Error(res.error ?? "Start renderu nie powiódł się");
    return res;
  });

export const enqueueVideoUploadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { enqueueYoutubeUpload } = await import("@/lib/video-pipeline/server");
    const res = await enqueueYoutubeUpload(data.id);
    if (!res.ok) throw new Error(res.error ?? "Dodanie do kolejki YouTube nie powiodło się");
    return { ok: true };
  });

export const updateVideoPipelineItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        yt_title: z.string().max(100).optional(),
        video_url: z.string().url().optional(),
        status: z.enum(["rendered"]).optional(), // ręczne oznaczenie po renderze poza systemem
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const db = await untypedAdmin();
    const { id, ...patch } = data;
    if (patch.status === "rendered" && !patch.video_url) {
      throw new Error("Podaj URL gotowego wideo (MP4), żeby oznaczyć jako zrenderowane");
    }
    const { error } = await db
      .from("video_pipeline")
      .update(
        patch.status === "rendered"
          ? { ...patch, rendered_at: new Date().toISOString(), last_error: null }
          : patch,
      )
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
