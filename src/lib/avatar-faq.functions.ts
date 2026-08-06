import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r) => r.role === "administrator")) {
    throw new Error("Brak uprawnień");
  }
}

export type AvatarFaqRow = {
  id: string;
  question: string;
  answer_text: string;
  sort_order: number;
  is_published: boolean;
  is_intro: boolean;
  voice_id: string;
  avatar_id: string;
  video_id: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  video_status: string;
  last_error: string | null;
  updated_at: string;
};

export type PublicAvatarFaq = {
  id: string;
  question: string;
  answer_text: string;
  sort_order: number;
  is_intro: boolean;
  video_url: string | null;
  thumbnail_url: string | null;
};

// PUBLIC — landing page
export const listPublishedAvatarFaqs = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb
    .from("avatar_faqs")
    .select("id, question, answer_text, sort_order, is_intro, video_url, thumbnail_url")
    .eq("is_published", true)
    .not("video_url", "is", null)
    .order("is_intro", { ascending: false })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicAvatarFaq[];
});

// ADMIN — list all
export const listAllAvatarFaqs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("avatar_faqs")
      .select("*")
      .order("is_intro", { ascending: false })
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as AvatarFaqRow[];
  });

export const upsertAvatarFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      question: string;
      answer_text: string;
      sort_order?: number;
      is_published?: boolean;
      is_intro?: boolean;
      voice_id?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row: {
      question: string;
      answer_text: string;
      sort_order?: number;
      is_published?: boolean;
      is_intro?: boolean;
      voice_id?: string;
    } = {
      question: data.question,
      answer_text: data.answer_text,
    };
    if (data.sort_order !== undefined) row.sort_order = data.sort_order;
    if (data.is_published !== undefined) row.is_published = data.is_published;
    if (data.is_intro !== undefined) row.is_intro = data.is_intro;
    if (data.voice_id) row.voice_id = data.voice_id;
    if (data.id) {
      const { error } = await supabaseAdmin.from("avatar_faqs").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("avatar_faqs")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const setAvatarForAllFaqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { avatar_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, count } = await supabaseAdmin
      .from("avatar_faqs")
      .update({ avatar_id: data.avatar_id }, { count: "exact" })
      .not("id", "is", null);
    if (error) throw new Error(error.message);
    return { ok: true, updated: count ?? 0 };
  });

export const deleteAvatarFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("avatar_faqs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Kicks off the full pipeline: TTS -> upload -> generate. Returns video_id.
export const startAvatarFaqGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ttsElevenLabs, uploadAudioToHeygen, createHeygenVideoFromAudio } =
      await import("./avatar-faq.server");

    const { data: row, error: rErr } = await supabaseAdmin
      .from("avatar_faqs")
      .select("*")
      .eq("id", data.id)
      .single();
    if (rErr || !row) throw new Error(rErr?.message || "FAQ nie znalezione");

    await supabaseAdmin
      .from("avatar_faqs")
      .update({ video_status: "generating_audio", last_error: null })
      .eq("id", data.id);

    try {
      const audio = await ttsElevenLabs({
        text: row.answer_text,
        voiceId: row.voice_id,
      });
      await supabaseAdmin
        .from("avatar_faqs")
        .update({ video_status: "uploading" })
        .eq("id", data.id);

      const assetId = await uploadAudioToHeygen(audio);
      const { videoId } = await createHeygenVideoFromAudio({
        avatarId: row.avatar_id,
        audioAssetId: assetId,
      });

      await supabaseAdmin
        .from("avatar_faqs")
        .update({ video_id: videoId, video_status: "rendering" })
        .eq("id", data.id);
      return { ok: true, video_id: videoId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("avatar_faqs")
        .update({ video_status: "failed", last_error: msg })
        .eq("id", data.id);
      throw new Error(msg);
    }
  });

// Poll HeyGen and persist ready URL.
export const pollAvatarFaqStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getHeygenVideoStatus } = await import("./avatar-faq.server");

    const { data: row } = await supabaseAdmin
      .from("avatar_faqs")
      .select("video_id")
      .eq("id", data.id)
      .single();
    if (!row?.video_id) return { status: "no_video" as const };

    const status = await getHeygenVideoStatus(row.video_id);
    const update: {
      video_status?: string;
      video_url?: string | null;
      thumbnail_url?: string | null;
      last_error?: string | null;
    } = {};
    if (status.status === "completed" && status.video_url) {
      update.video_status = "ready";
      update.video_url = status.video_url;
      update.thumbnail_url = status.thumbnail_url ?? null;
    } else if (status.status === "failed") {
      update.video_status = "failed";
      update.last_error =
        typeof status.error === "string" ? status.error : JSON.stringify(status.error ?? {});
    } else {
      update.video_status = status.status === "processing" ? "rendering" : status.status;
    }
    await supabaseAdmin.from("avatar_faqs").update(update).eq("id", data.id);
    return {
      status: status.status,
      video_url: status.video_url,
      thumbnail_url: status.thumbnail_url,
    };
  });
