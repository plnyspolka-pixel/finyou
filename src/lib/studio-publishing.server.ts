// Studio publikacji — publikacja przez Meta Graph API:
//   * facebook_post   — post na stronie FB (tekst / grafika / wideo),
//   * facebook_reels  — Facebook Reels (start → rupload z file_url → finish),
//   * instagram_reels — IG Reels dwuetapowo: kontener /media (REELS) →
//                       transkodowanie po stronie Meta → /media_publish.
//
// Konfiguracja (sekrety środowiska):
//   META_PAGE_ID            — id strony FB,
//   META_PAGE_ACCESS_TOKEN  — token strony (pages_manage_posts,
//                             pages_read_engagement; dla IG dodatkowo
//                             instagram_basic, instagram_content_publish),
//   META_IG_USER_ID         — id konta Instagram Business powiązanego ze stroną.
// Fallback tokena: META_ACCESS_TOKEN (jak w meta-send.server.ts).
//
// Kolejka: social_publish_queue (migracja 20260803130000_studio_publikacji).
// IG wymaga odpytywania statusu kontenera — tick najpierw tworzy kontener
// (status `processing`), a publikuje po FINISHED w kolejnych przebiegach.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH = "https://graph.facebook.com/v21.0";
const RUPLOAD = "https://rupload.facebook.com/video-reels/v21.0";

const MAX_ITEMS_PER_TICK = 3;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MIN = 30;
// Ile razy tick czeka na transkodowanie kontenera IG, zanim uzna błąd
// (co tick = 10 min, więc 12 prób ≈ 2 h — wystarczy nawet dla długich wideo).
const MAX_IG_PROCESSING_CHECKS = 12;

export function getMetaPublishEnv() {
  const pageId = process.env.META_PAGE_ID || "";
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || "";
  const igUserId = process.env.META_IG_USER_ID || "";
  return {
    pageId,
    pageToken,
    igUserId,
    facebookConfigured: !!(pageId && pageToken),
    instagramConfigured: !!(igUserId && pageToken),
  };
}

type GraphJson = Record<string, unknown> & {
  id?: string;
  error?: { message?: string; code?: number };
};

async function graphPost(path: string, params: Record<string, string>): Promise<GraphJson> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const json = (await res.json().catch(() => ({}))) as GraphJson;
  if (!res.ok || json.error) {
    throw new Error(`Graph ${path}: ${json.error?.message ?? `HTTP ${res.status}`}`);
  }
  return json;
}

async function graphGet(path: string, params: Record<string, string>): Promise<GraphJson> {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const json = (await res.json().catch(() => ({}))) as GraphJson;
  if (!res.ok || json.error) {
    throw new Error(`Graph ${path}: ${json.error?.message ?? `HTTP ${res.status}`}`);
  }
  return json;
}

// ── Facebook: post na stronie (tekst / grafika / wideo) ──────────────────────

async function publishFacebookPost(item: QueueRow): Promise<string> {
  const { pageId, pageToken, facebookConfigured } = getMetaPublishEnv();
  if (!facebookConfigured) throw new Error("Brak META_PAGE_ID / META_PAGE_ACCESS_TOKEN.");

  if (item.video_url) {
    const json = await graphPost(`${pageId}/videos`, {
      file_url: item.video_url,
      description: item.message,
      ...(item.title ? { title: item.title } : {}),
      access_token: pageToken,
    });
    if (!json.id) throw new Error("Facebook nie zwrócił id wideo.");
    return json.id;
  }
  if (item.image_url) {
    const json = await graphPost(`${pageId}/photos`, {
      url: item.image_url,
      caption: item.message,
      access_token: pageToken,
    });
    const id = (json.post_id as string | undefined) ?? json.id;
    if (!id) throw new Error("Facebook nie zwrócił id posta.");
    return id;
  }
  if (!item.message.trim()) throw new Error("Post na Facebooku wymaga treści lub mediów.");
  const json = await graphPost(`${pageId}/feed`, {
    message: item.message,
    access_token: pageToken,
  });
  if (!json.id) throw new Error("Facebook nie zwrócił id posta.");
  return json.id;
}

// ── Facebook Reels ───────────────────────────────────────────────────────────

async function publishFacebookReel(item: QueueRow): Promise<string> {
  const { pageId, pageToken, facebookConfigured } = getMetaPublishEnv();
  if (!facebookConfigured) throw new Error("Brak META_PAGE_ID / META_PAGE_ACCESS_TOKEN.");
  if (!item.video_url) throw new Error("Facebook Reels wymaga URL wideo (MP4, pion 9:16).");

  const start = await graphPost(`${pageId}/video_reels`, {
    upload_phase: "start",
    access_token: pageToken,
  });
  const videoId = start.video_id as string | undefined;
  if (!videoId) throw new Error("Facebook nie zwrócił video_id (upload_phase=start).");

  // Hosted upload: Meta samo pobiera plik z podanego URL (nagłówek file_url).
  const upRes = await fetch(`${RUPLOAD}/${videoId}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${pageToken}`,
      file_url: item.video_url,
    },
  });
  const upJson = (await upRes.json().catch(() => ({}))) as {
    success?: boolean;
    debug_info?: { message?: string };
  };
  if (!upRes.ok || upJson.success === false) {
    throw new Error(`Reels upload: ${upJson.debug_info?.message ?? `HTTP ${upRes.status}`}`);
  }

  await graphPost(`${pageId}/video_reels`, {
    upload_phase: "finish",
    video_id: videoId,
    video_state: "PUBLISHED",
    description: item.message,
    access_token: pageToken,
  });
  return videoId;
}

// ── Instagram Reels (dwuetapowo, przez kolejne ticki) ────────────────────────

async function createInstagramContainer(item: QueueRow): Promise<string> {
  const { igUserId, pageToken, instagramConfigured } = getMetaPublishEnv();
  if (!instagramConfigured) throw new Error("Brak META_IG_USER_ID / META_PAGE_ACCESS_TOKEN.");
  if (!item.video_url) throw new Error("Instagram Reels wymaga URL wideo (MP4, pion 9:16).");

  const json = await graphPost(`${igUserId}/media`, {
    media_type: "REELS",
    video_url: item.video_url,
    caption: item.message,
    access_token: pageToken,
  });
  if (!json.id) throw new Error("Instagram nie zwrócił id kontenera mediów.");
  return json.id;
}

async function checkAndPublishInstagram(
  item: QueueRow,
): Promise<{ done: boolean; mediaId?: string }> {
  const { igUserId, pageToken } = getMetaPublishEnv();
  if (!item.ig_creation_id) throw new Error("Brak ig_creation_id dla wpisu w statusie processing.");

  const status = await graphGet(item.ig_creation_id, {
    fields: "status_code,status",
    access_token: pageToken,
  });
  const code = String(status.status_code ?? "");
  if (code === "ERROR" || code === "EXPIRED") {
    throw new Error(`Kontener IG w stanie ${code}: ${String(status.status ?? "")}`);
  }
  if (code !== "FINISHED") return { done: false };

  const pub = await graphPost(`${igUserId}/media_publish`, {
    creation_id: item.ig_creation_id,
    access_token: pageToken,
  });
  if (!pub.id) throw new Error("Instagram nie zwrócił id opublikowanego media.");
  return { done: true, mediaId: pub.id };
}

// ── Kolejka ──────────────────────────────────────────────────────────────────

export type QueueRow = {
  id: string;
  platform: "facebook_post" | "facebook_reels" | "instagram_reels";
  title: string;
  message: string;
  video_url: string | null;
  image_url: string | null;
  scheduled_at: string;
  status: string;
  attempt_count: number;
  ig_creation_id: string | null;
  external_post_id: string | null;
  last_error: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

async function markPublished(id: string, externalId: string, attempts: number) {
  await supabaseAdmin
    .from("social_publish_queue")
    .update({
      status: "published",
      external_post_id: externalId,
      published_at: new Date().toISOString(),
      last_error: null,
      attempt_count: attempts,
    })
    .eq("id", id);
}

async function markFailed(item: QueueRow, msg: string, opts?: { noRetry?: boolean }) {
  const attempts = item.attempt_count + 1;
  const exhausted = opts?.noRetry || attempts >= MAX_ATTEMPTS;
  await supabaseAdmin
    .from("social_publish_queue")
    .update({
      status: exhausted ? "failed" : "pending",
      attempt_count: attempts,
      last_error: msg,
      ig_creation_id: null,
      // Odrocz kolejną próbę, żeby nie mielić limitów API na tym samym błędzie.
      ...(exhausted
        ? {}
        : { scheduled_at: new Date(Date.now() + RETRY_DELAY_MIN * 60 * 1000).toISOString() }),
    })
    .eq("id", item.id);
}

// Publikacja jednego wpisu: optymistyczne przejęcie (pending → publishing)
// chroni przed podwójną publikacją przy nakładających się tickach.
export async function processSocialQueueItem(
  id: string,
): Promise<{ ok: boolean; externalId?: string; processing?: boolean; error?: string }> {
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("social_publish_queue")
    .update({ status: "publishing" })
    .eq("id", id)
    .in("status", ["pending", "failed"])
    .select("*")
    .maybeSingle();
  if (claimErr) return { ok: false, error: claimErr.message };
  if (!claimed) return { ok: false, error: "Wpis nie jest w stanie do publikacji." };

  const item = claimed as QueueRow;
  try {
    if (item.platform === "facebook_post") {
      const postId = await publishFacebookPost(item);
      await markPublished(id, postId, item.attempt_count + 1);
      return { ok: true, externalId: postId };
    }
    if (item.platform === "facebook_reels") {
      const videoId = await publishFacebookReel(item);
      await markPublished(id, videoId, item.attempt_count + 1);
      return { ok: true, externalId: videoId };
    }
    // instagram_reels: krok 1 — kontener; publish robi kolejny tick po FINISHED.
    const creationId = await createInstagramContainer(item);
    await supabaseAdmin
      .from("social_publish_queue")
      .update({
        status: "processing",
        ig_creation_id: creationId,
        attempt_count: item.attempt_count + 1,
        last_error: null,
      })
      .eq("id", id);
    return { ok: true, processing: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markFailed(item, msg);
    return { ok: false, error: msg };
  }
}

// Wpisy IG w statusie processing: sprawdź transkodowanie i opublikuj.
async function processInstagramProcessingItems(): Promise<{ published: number; errors: string[] }> {
  const { data: rows, error } = await supabaseAdmin
    .from("social_publish_queue")
    .select("*")
    .eq("status", "processing")
    .eq("platform", "instagram_reels")
    .limit(10);
  if (error) throw new Error(error.message);

  let published = 0;
  const errors: string[] = [];
  for (const raw of rows ?? []) {
    const item = raw as QueueRow;
    try {
      const result = await checkAndPublishInstagram(item);
      if (result.done && result.mediaId) {
        await markPublished(item.id, result.mediaId, item.attempt_count);
        published += 1;
      } else {
        // Wciąż się transkoduje; po zbyt wielu przebiegach uznaj błąd.
        const checks =
          (new Date().getTime() - new Date(item.updated_at).getTime()) / (10 * 60 * 1000);
        if (checks > MAX_IG_PROCESSING_CHECKS) {
          await markFailed(item, "Kontener IG nie zakończył transkodowania w limicie czasu.", {
            noRetry: true,
          });
          errors.push("IG: timeout transkodowania");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await markFailed(item, msg);
      errors.push(msg);
    }
  }
  return { published, errors };
}

export async function runSocialPublishTick(): Promise<{
  ok: boolean;
  processed: number;
  published: number;
  errors: string[];
}> {
  const { data: due, error } = await supabaseAdmin
    .from("social_publish_queue")
    .select("id")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(MAX_ITEMS_PER_TICK);
  if (error) throw new Error(error.message);

  let published = 0;
  const errors: string[] = [];
  for (const item of due ?? []) {
    const result = await processSocialQueueItem(item.id);
    if (result.ok && !result.processing) published += 1;
    else if (result.error) errors.push(result.error);
  }

  const ig = await processInstagramProcessingItems();
  published += ig.published;
  errors.push(...ig.errors);

  return { ok: true, processed: (due ?? []).length, published, errors };
}
