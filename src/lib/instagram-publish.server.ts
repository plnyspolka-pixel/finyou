// Publikacja postów na Instagram przez Meta Graph API (Content Publishing).
// Wymaga konta Instagram Business/Creator powiązanego ze stroną FB oraz
// tokenu z uprawnieniami instagram_basic + instagram_content_publish
// (te same zmienne środowiskowe co Messenger/IG Direct).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GRAPH = "https://graph.facebook.com/v21.0";
const CAPTION_LIMIT = 2200; // twardy limit Instagrama
const PUBLIC_IMAGE_BUCKET = "ad-creatives"; // publiczny bucket — Meta musi pobrać obraz po URL

function resolveToken(): string | null {
  return (
    process.env.META_IG_PAGE_ACCESS_TOKEN ??
    process.env.META_PAGE_ACCESS_TOKEN ??
    process.env.META_ACCESS_TOKEN ??
    null
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GraphResponse = Record<string, unknown> & {
  id?: string;
  status_code?: string;
  permalink?: string;
  error?: { message?: string };
  instagram_business_account?: { id?: string };
  data?: { instagram_business_account?: { id?: string } }[];
};

async function graphJson(url: string, init?: RequestInit): Promise<GraphResponse> {
  const res = await fetch(url, init);
  const json: GraphResponse = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message ?? JSON.stringify(json).slice(0, 300);
    throw new Error(`Graph ${res.status}: ${msg}`);
  }
  return json;
}

let cachedIgUserId: string | null = null;

// ID konta Instagram Business: env META_IG_USER_ID, inaczej odkrywamy przez
// token strony (/me) lub token użytkownika (/me/accounts).
async function resolveIgUserId(token: string): Promise<string> {
  if (process.env.META_IG_USER_ID) return process.env.META_IG_USER_ID;
  if (cachedIgUserId) return cachedIgUserId;
  const t = encodeURIComponent(token);
  let id: string | undefined;
  try {
    const me = await graphJson(`${GRAPH}/me?fields=instagram_business_account&access_token=${t}`);
    id = me?.instagram_business_account?.id;
  } catch {
    // /me bez tego pola przy tokenie użytkownika — spróbuj przez listę stron
  }
  if (!id) {
    const pages = await graphJson(
      `${GRAPH}/me/accounts?fields=instagram_business_account&access_token=${t}`,
    );
    id = (pages?.data ?? []).find((p) => p?.instagram_business_account?.id)
      ?.instagram_business_account?.id;
  }
  if (!id) {
    throw new Error(
      "Nie znaleziono konta Instagram Business powiązanego z tokenem — połącz konto IG ze stroną FB lub ustaw META_IG_USER_ID",
    );
  }
  cachedIgUserId = String(id);
  return cachedIgUserId;
}

// Meta pobiera obraz po publicznym URL — data-URI (grafiki z generatora AI)
// wrzucamy najpierw do publicznego bucketa i publikujemy z hostowanego linku.
async function ensurePublicImageUrl(imageUrl: string): Promise<string> {
  if (!imageUrl.startsWith("data:")) return imageUrl;
  const m = imageUrl.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
  if (!m) throw new Error("Nieobsługiwany format grafiki (oczekiwano data:image/...;base64)");
  const [, contentType, b64] = m;
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const path = `social/${new Date().toISOString().slice(0, 7)}/${globalThis.crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(b64, "base64");
  const { error } = await supabaseAdmin.storage
    .from(PUBLIC_IMAGE_BUCKET)
    .upload(path, buf, { contentType, upsert: false });
  if (error) throw new Error(`Upload grafiki nie powiódł się: ${error.message}`);
  const { data } = supabaseAdmin.storage.from(PUBLIC_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function buildInstagramCaption(content: string, hashtags: string[] | null): string {
  const tags = (hashtags ?? []).join(" ").trim();
  const caption = tags ? `${content.trim()}\n\n${tags}` : content.trim();
  return caption.slice(0, CAPTION_LIMIT);
}

export async function publishInstagramImage(opts: { imageUrl: string; caption: string }): Promise<{
  ok: boolean;
  mediaId?: string;
  permalink?: string;
  resolvedImageUrl?: string;
  error?: string;
}> {
  try {
    const token = resolveToken();
    if (!token) {
      return {
        ok: false,
        error: "Brak tokenu Meta (META_IG_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN)",
      };
    }
    const igUserId = await resolveIgUserId(token);
    const publicUrl = await ensurePublicImageUrl(opts.imageUrl);

    // 1) Kontener mediowy — Meta asynchronicznie pobiera obraz z publicUrl.
    const created = await graphJson(`${GRAPH}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        image_url: publicUrl,
        caption: opts.caption.slice(0, CAPTION_LIMIT),
        access_token: token,
      }),
    });
    const creationId = String(created?.id ?? "");
    if (!creationId) return { ok: false, error: "Meta nie zwróciła ID kontenera media" };

    // 2) Poczekaj, aż kontener będzie gotowy do publikacji.
    for (let i = 0; i < 10; i++) {
      const st = await graphJson(
        `${GRAPH}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
      );
      const code = String(st?.status_code ?? "");
      if (code === "FINISHED") break;
      if (code === "ERROR" || code === "EXPIRED") {
        return {
          ok: false,
          resolvedImageUrl: publicUrl,
          error: `Przetwarzanie grafiki po stronie Meta nie powiodło się (${code}) — Instagram wymaga JPEG do 8 MB`,
        };
      }
      await sleep(2000);
    }

    // 3) Publikacja.
    const published = await graphJson(`${GRAPH}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: creationId, access_token: token }),
    });
    const mediaId = String(published?.id ?? "");
    if (!mediaId) return { ok: false, resolvedImageUrl: publicUrl, error: "Brak ID publikacji" };

    let permalink: string | undefined;
    try {
      const media = await graphJson(
        `${GRAPH}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(token)}`,
      );
      permalink = media?.permalink;
    } catch {
      // permalink jest tylko informacyjny
    }
    return { ok: true, mediaId, permalink, resolvedImageUrl: publicUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Automat: publikuje zaplanowane posty Instagram, których termin minął.
// Wołane z ticka cron (best-effort) — patrz follow-up-tick.
export async function processDueSocialPosts(): Promise<{
  processed: number;
  published: number;
  failed: number;
}> {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("social_posts")
    .select("id, content, hashtags, image_url")
    .eq("status", "scheduled")
    .eq("platform", "instagram")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(5);
  if (error) throw new Error(error.message);

  let published = 0;
  let failed = 0;
  for (const post of rows ?? []) {
    if (!post.image_url) {
      failed += 1;
      await supabaseAdmin
        .from("social_posts")
        .update({ status: "failed", publish_error: "Instagram wymaga grafiki — dodaj obraz" })
        .eq("id", post.id);
      continue;
    }
    const r = await publishInstagramImage({
      imageUrl: post.image_url,
      caption: buildInstagramCaption(post.content, post.hashtags),
    });
    if (r.ok) {
      published += 1;
      await supabaseAdmin
        .from("social_posts")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          external_id: r.mediaId ?? null,
          publish_error: null,
          ...(r.resolvedImageUrl ? { image_url: r.resolvedImageUrl } : {}),
        })
        .eq("id", post.id);
    } else {
      failed += 1;
      await supabaseAdmin
        .from("social_posts")
        .update({
          status: "failed",
          publish_error: (r.error ?? "unknown").slice(0, 1000),
          ...(r.resolvedImageUrl ? { image_url: r.resolvedImageUrl } : {}),
        })
        .eq("id", post.id);
    }
  }
  return { processed: (rows ?? []).length, published, failed };
}
