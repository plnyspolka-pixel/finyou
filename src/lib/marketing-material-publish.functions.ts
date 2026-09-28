// Server functions przycisku „Publikuj" przy materiałach marketingowych
// (/admin/materialy): publiczna kopia pliku + wpisy w kolejkach Studia
// publikacji, opcjonalnie z zapisem tytułu i opisu w samym materiale.
// Logika kolejek: src/lib/studio-enqueue.server.ts (wspólna ze Studiem).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StudioPlatform } from "./studio-platforms";
import { materialPlatformsError } from "./marketing-material-publish";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r) => r.role === "administrator")) {
    throw new Error("Brak uprawnień");
  }
}

export type EnqueueMaterialPublicationInput = {
  materialId: string;
  platforms: StudioPlatform[];
  title?: string;
  message?: string;
  privacy_status?: "public" | "unlisted" | "private";
  scheduled_at?: string;
  tiktok_post_options?: unknown;
  /** Zapisz tytuł i treść także w materiale (żeby następna publikacja je podstawiła). */
  save_to_material?: boolean;
};

export type EnqueueMaterialPublicationResult = {
  ok: true;
  queued: number;
  social: { id: string; platform: StudioPlatform }[];
  youtube: { id: string }[];
  /** Publiczny URL kopii pliku, którą pobiorą platformy. */
  media_url: string;
};

export const enqueueMaterialPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: EnqueueMaterialPublicationInput) => d)
  .handler(async ({ data, context }): Promise<EnqueueMaterialPublicationResult> => {
    await assertAdmin(context.userId);
    const { loadMaterial, ensureMaterialPublicUrl } =
      await import("./marketing-material-publish.server");
    const m = await loadMaterial(data.materialId);
    const platformsErr = materialPlatformsError(m.media_type, data.platforms);
    if (platformsErr) throw new Error(platformsErr);

    const title = (data.title ?? "").trim();
    const message = (data.message ?? "").trim();
    if (data.save_to_material) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("marketing_materials")
        .update({ title: title || m.title, description: message || null })
        .eq("id", m.id);
      if (error) throw new Error(`Zapis opisu materiału: ${error.message}`);
    }

    const mediaUrl = await ensureMaterialPublicUrl(m);
    const { enqueuePublication } = await import("./studio-enqueue.server");
    const result = await enqueuePublication({
      platforms: data.platforms,
      title: title || m.title,
      message,
      video_url: m.media_type === "video" ? mediaUrl : undefined,
      image_url: m.media_type === "image" ? mediaUrl : undefined,
      privacy_status: data.privacy_status,
      scheduled_at: data.scheduled_at,
      tiktok_post_options: data.tiktok_post_options,
      userId: context.userId,
    });
    return { ok: true, ...result, media_url: mediaUrl };
  });

/** Sam zapis tytułu i opisu materiału (bez publikacji). */
export const updateMaterialText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { materialId: string; title: string; description: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const title = data.title.trim();
    if (!title) throw new Error("Tytuł nie może być pusty.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("marketing_materials")
      .update({ title, description: data.description.trim() || null })
      .eq("id", data.materialId);
    if (error) throw new Error(error.message);
    return { ok: true, title, description: data.description.trim() || null };
  });
