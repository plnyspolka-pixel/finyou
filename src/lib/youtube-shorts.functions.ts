// Server functions panelu /admin/youtube-shorts — status połączenia OAuth,
// kolejka publikacji shortów. Logika uploadu: src/lib/youtube-shorts.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r) => r.role === "administrator")) {
    throw new Error("Brak uprawnień");
  }
}

export type YoutubeIntegrationStatus = {
  envConfigured: boolean;
  redirectUri: string;
  connected: boolean;
  channelId: string | null;
  channelTitle: string | null;
  connectedAt: string | null;
  lastError: string | null;
};

export type YoutubeQueueItem = {
  id: string;
  title: string;
  description: string;
  source_video_url: string;
  privacy_status: string;
  scheduled_at: string;
  status: string;
  attempt_count: number;
  youtube_video_id: string | null;
  last_error: string | null;
  published_at: string | null;
  created_at: string;
};

export type ShortSource = { id: string; question: string; video_url: string };

export const getYoutubeIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<YoutubeIntegrationStatus> => {
    await assertAdmin(context.userId);
    const { getYoutubeEnv, getIntegrationRow } = await import("@/lib/youtube-shorts.server");
    const env = getYoutubeEnv();
    const row = await getIntegrationRow();
    return {
      envConfigured: env.configured,
      redirectUri: env.redirectUri,
      connected: !!row.refresh_token,
      channelId: row.channel_id,
      channelTitle: row.channel_title,
      connectedAt: row.connected_at,
      lastError: row.last_error,
    };
  });

export const startYoutubeConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { buildConnectUrl } = await import("@/lib/youtube-shorts.server");
    return { url: await buildConnectUrl() };
  });

export const disconnectYoutube = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { disconnectYoutubeChannel } = await import("@/lib/youtube-shorts.server");
    await disconnectYoutubeChannel();
    return { ok: true };
  });

export const listYoutubeQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<YoutubeQueueItem[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("youtube_publish_queue")
      .select(
        "id, title, description, source_video_url, privacy_status, scheduled_at, status, attempt_count, youtube_video_id, last_error, published_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as YoutubeQueueItem[];
  });

// Gotowe wideo z modułu Awatar FAQ do szybkiego podstawienia jako źródło.
export const listShortSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ShortSource[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("avatar_faqs")
      .select("id, question, video_url")
      .not("video_url", "is", null)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).filter((r) => r.video_url) as ShortSource[];
  });

export const addYoutubeQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      title: string;
      description?: string;
      source_video_url: string;
      privacy_status?: "public" | "unlisted" | "private";
      scheduled_at?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (!data.title.trim()) throw new Error("Tytuł jest wymagany.");
    if (!/^https:\/\//.test(data.source_video_url)) {
      throw new Error("URL wideo musi zaczynać się od https://");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("youtube_publish_queue").insert({
      title: data.title.trim(),
      description: data.description?.trim() ?? "",
      source_video_url: data.source_video_url.trim(),
      privacy_status: data.privacy_status ?? "public",
      scheduled_at: data.scheduled_at ?? new Date().toISOString(),
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteYoutubeQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("youtube_publish_queue")
      .delete()
      .eq("id", data.id)
      .neq("status", "uploading");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelYoutubeQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("youtube_publish_queue")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const retryYoutubeQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("youtube_publish_queue")
      .update({ status: "pending", last_error: null, scheduled_at: new Date().toISOString() })
      .eq("id", data.id)
      .in("status", ["failed", "cancelled"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const publishYoutubeQueueItemNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { processQueueItem } = await import("@/lib/youtube-shorts.server");
    const result = await processQueueItem(data.id);
    if (!result.ok) throw new Error(result.error ?? "Publikacja nieudana.");
    return { ok: true, videoId: result.videoId };
  });
