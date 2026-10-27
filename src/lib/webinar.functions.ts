// Pokój webinaru: dostęp po linku z maila (token z zapisu na lead magnet
// „webinar”), nagranie z training_videos (WEBINAR_VIDEO_ID). Bez nagrania
// albo przy wyłączonym webinarze — zaślepka „Webinar startuje wkrótce”.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { VIDEO_URL_TTL_SECONDS, videoTokenHash } from "./free-lesson";
import { WEBINAR_ENABLED, WEBINAR_VIDEO_ID, webinarGrantValid } from "./webinar";

const tokenInput = z.object({ token: z.string().regex(/^[a-z0-9]{32,64}$/) });

export const getWebinarRoom = createServerFn({ method: "POST" })
  .inputValidator((v) => tokenInput.parse(v))
  .handler(async ({ data }) => {
    if (!WEBINAR_ENABLED || !WEBINAR_VIDEO_ID) return { ready: false as const };
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: grant } = await db
      .from("lead_magnet_signups")
      .select("id,consent,video_expires_at,lead_magnets(slug,published)")
      .eq("video_token_hash", await videoTokenHash(data.token))
      .maybeSingle();
    if (!webinarGrantValid(grant))
      throw new Error("Link nieważny lub wygasł. Zapisz się ponownie.");
    const { data: video } = await db
      .from("training_videos")
      .select("id,title,file_path,thumbnail_url,duration_seconds")
      .eq("id", WEBINAR_VIDEO_ID)
      .maybeSingle();
    if (!video?.file_path) return { ready: false as const };
    const { data: signed, error } = await db.storage
      .from("training-videos")
      .createSignedUrl(video.file_path, VIDEO_URL_TTL_SECONDS);
    if (error || !signed?.signedUrl) return { ready: false as const };
    return {
      ready: true as const,
      url: signed.signedUrl,
      title: video.title,
      poster: video.thumbnail_url,
      durationSec: video.duration_seconds ?? null,
    };
  });
