import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FREE_LESSON_ID, VIDEO_URL_TTL_SECONDS, lessonGrantValid, videoTokenHash } from "./free-lesson";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const tokenInput = z.object({ token: z.string().regex(/^[a-z0-9]{32,64}$/), lessonId: z.string().uuid().default(FREE_LESSON_ID) });
export const getFreeLessonVideo = createServerFn({ method: "POST" }).inputValidator((v) => tokenInput.parse(v)).handler(async ({ data }) => {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "no-store");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const hash = await videoTokenHash(data.token);
  const { data: grant } = await db.from("lead_magnet_signups").select("id,consent,video_expires_at,lead_magnets(slug,published)").eq("video_token_hash", hash).maybeSingle();
  if (!lessonGrantValid(grant, data.lessonId)) throw new Error("Link nieważny lub wygasł. Zapisz się ponownie.");
  const { data: lesson } = await db.from("training_videos").select("id,title,file_path,thumbnail_url,description").eq("id", FREE_LESSON_ID).eq("free_lesson", true).eq("is_published", true).maybeSingle();
  if (!lesson?.file_path) throw new Error("Lekcja chwilowo niedostępna.");
  const { data: signed, error } = await db.storage.from("training-videos").createSignedUrl(lesson.file_path, VIDEO_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) throw new Error("Lekcja chwilowo niedostępna.");
  return { url: signed.signedUrl, title: lesson.title, poster: lesson.thumbnail_url, description: lesson.description };
});
export const saveFreeLessonProgress = createServerFn({ method: "POST" }).inputValidator(v => tokenInput.extend({ percent: z.number().int().min(0).max(100) }).parse(v)).handler(async ({ data }) => {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "no-store");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: grant } = await db.from("lead_magnet_signups").select("id,consent,video_expires_at,lead_magnets(slug,published)").eq("video_token_hash", await videoTokenHash(data.token)).maybeSingle();
  if (!lessonGrantValid(grant, data.lessonId) || !grant) throw new Error("Brak dostępu.");
  const { error } = await db.rpc("update_free_video_progress", { p_signup: grant.id, p_percent: data.percent });
  if (error) throw new Error("Nie udało się zapisać postępu.");
  return { ok: true };
});
export const setFreeTrainingLesson = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(v => z.object({ id: z.string().uuid(), free: z.boolean() }).parse(v)).handler(async ({ data, context }) => {
  const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "administrator" });
  if (roleError || !admin) throw new Error("Brak uprawnień.");
  // The unique partial index enforces exactly one selection under concurrent requests.
  const { error } = await context.supabase.from("training_videos").update({ free_lesson: data.free }).eq("id", data.id);
  if (error) throw new Error(error.code === "23505" ? "Najpierw wyłącz obecną darmową lekcję. Tylko jedna może być darmowa." : error.message);
  return { ok: true };
});