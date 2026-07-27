import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLATFORMS = ["facebook", "instagram", "linkedin", "x", "tiktok", "threads"] as const;
const STATUSES = ["draft", "scheduled", "published", "failed"] as const;

const postSchema = z.object({
  id: z.string().uuid().optional(),
  platform: z.enum(PLATFORMS),
  content: z.string().min(1).max(5000),
  hashtags: z.array(z.string().max(60)).max(30).default([]),
  image_url: z.string().url().optional().or(z.literal("")),
  link_url: z.string().url().optional().or(z.literal("")),
  scheduled_at: z.string().datetime().optional().or(z.literal("")),
  status: z.enum(STATUSES).default("draft"),
  ai_prompt: z.string().max(4000).optional(),
  ai_model: z.string().max(120).optional(),
  campaign: z.string().max(120).optional(),
});

export const listSocialPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("social_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { posts: data ?? [] };
  });

export const saveSocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => postSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...row } = data;
    const payload = {
      ...row,
      image_url: row.image_url || null,
      link_url: row.link_url || null,
      scheduled_at: row.scheduled_at || null,
      campaign: row.campaign || null,
      ai_prompt: row.ai_prompt || null,
      ai_model: row.ai_model || null,
    };
    if (id) {
      const { error } = await context.supabase.from("social_posts").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: ins, error } = await context.supabase
      .from("social_posts")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteSocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("social_posts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateSocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        platform: z.enum(PLATFORMS),
        brief: z.string().min(10).max(4000),
        campaign: z.string().max(120).optional(),
        tone: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { generateSocialContent } = await import("./social-posts.server");
    return await generateSocialContent(data);
  });

export const generateSocialImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ prompt: z.string().min(5).max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const { generateSocialImage } = await import("./social-posts.server");
    return await generateSocialImage(data.prompt);
  });
