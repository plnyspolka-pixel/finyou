/**
 * Klient Graph API Meta (Facebook, Instagram, Messenger, Ads, formularze
 * leadów, Conversions API) — jedno miejsce z tokenami i typowanymi wywołaniami.
 *
 * Tokeny (środowisko serwera):
 *   META_PAGE_ACCESS_TOKEN   — strona (posty, komentarze, Messenger, IG przez stronę)
 *   META_IG_PAGE_ACCESS_TOKEN — Instagram (gdy inny niż strony)
 *   META_ACCESS_TOKEN        — użytkownik/system (konta reklamowe, kampanie)
 *   FB_PIXEL_ACCESS_TOKEN    — Conversions API
 *   META_PAGE_ID, META_IG_USER_ID — identyfikatory strony i konta IG
 *
 * Używany przez narzędzia MCP (`src/lib/mcp/tools/meta.ts`) i dostępny dla
 * panelu. `graphRequest` to ogólne wywołanie — każda funkcja Graph API jest
 * dostępna bez zmiany kodu.
 */
import { createHash } from "node:crypto";
import { classifyGraphError, parseUsageRetryMinutes } from "@/lib/meta-graph-errors";
import { ensureMetaTokens } from "@/lib/meta-tokens.server";

export const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DEFAULT_TIMEOUT_MS = 60_000;

export type MetaTokenKind = "page" | "ig" | "user" | "pixel";

export function metaEnv() {
  const pageToken = process.env.META_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || "";
  const igToken = process.env.META_IG_PAGE_ACCESS_TOKEN || pageToken;
  const userToken = process.env.META_ACCESS_TOKEN || pageToken;
  const pixelToken = process.env.FB_PIXEL_ACCESS_TOKEN || pageToken;
  return {
    pageId: process.env.META_PAGE_ID || "",
    igUserId: process.env.META_IG_USER_ID || "",
    appId: process.env.META_APP_ID || "",
    hasPageToken: Boolean(pageToken),
    hasIgToken: Boolean(process.env.META_IG_PAGE_ACCESS_TOKEN || pageToken),
    hasUserToken: Boolean(process.env.META_ACCESS_TOKEN),
    hasPixelToken: Boolean(process.env.FB_PIXEL_ACCESS_TOKEN),
    hasSystemUserToken: Boolean(process.env.META_SYSTEM_USER_TOKEN),
    tokens: { page: pageToken, ig: igToken, user: userToken, pixel: pixelToken },
  };
}

export function metaToken(kind: MetaTokenKind): string {
  const t = metaEnv().tokens[kind];
  if (!t) {
    const name =
      kind === "user"
        ? "META_ACCESS_TOKEN"
        : kind === "pixel"
          ? "FB_PIXEL_ACCESS_TOKEN"
          : kind === "ig"
            ? "META_IG_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN"
            : "META_PAGE_ACCESS_TOKEN";
    throw new Error(`Brak tokena Meta (${name}) w środowisku serwera.`);
  }
  return t;
}

export function requirePageId(): string {
  const id = metaEnv().pageId;
  if (!id) throw new Error("Brak META_PAGE_ID w środowisku serwera.");
  return id;
}

export function requireIgUserId(): string {
  const id = metaEnv().igUserId;
  if (!id) throw new Error("Brak META_IG_USER_ID w środowisku serwera.");
  return id;
}

export type GraphRequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Pola formularza (POST) — obiekty są serializowane do JSON. */
  form?: Record<string, unknown>;
  token?: MetaTokenKind | { raw: string };
  timeoutMs?: number;
};

/**
 * Ogólne wywołanie Graph API: `path` bez wersji, np. `me`, `{page-id}/posts`,
 * `act_123/campaigns`. Rzuca `Error` z czytelnym komunikatem Graph.
 */
export async function graphRequest(path: string, opts: GraphRequestOptions = {}): Promise<any> {
  const clean = path.replace(/^\/+/, "");
  if (!/^[A-Za-z0-9_./%-]+$/.test(clean) || clean.includes("..")) {
    throw new Error("Nieprawidłowa ścieżka Graph API.");
  }
  if (typeof opts.token !== "object") await ensureMetaTokens();
  const token = typeof opts.token === "object" ? opts.token.raw : metaToken(opts.token ?? "page");
  const url = new URL(`${GRAPH}/${clean}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const method = opts.method ?? "GET";
  let body: BodyInit | undefined;
  if (method === "POST") {
    const params = new URLSearchParams();
    params.set("access_token", token);
    for (const [k, v] of Object.entries(opts.form ?? {})) {
      if (v === undefined || v === null) continue;
      params.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    body = params;
  } else {
    url.searchParams.set("access_token", token);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { method, body, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    const info = classifyGraphError({
      httpStatus: res.status,
      code: json?.error?.code,
      subcode: json?.error?.error_subcode,
      message: json?.error?.message ?? `HTTP ${res.status}`,
      retryAfterMinutes: parseUsageRetryMinutes(res.headers),
    });
    throw new Error(`Meta Graph: ${info.friendly}`);
  }
  return json;
}

const toUnix = (iso?: string | null) =>
  iso ? Math.floor(new Date(iso).getTime() / 1000) : undefined;

// ── Strona Facebook ─────────────────────────────────────────────────────────

export async function getPage(
  fields = "id,name,category,fan_count,followers_count,link,about,phone,website",
) {
  return graphRequest(requirePageId(), { query: { fields }, token: "page" });
}

export async function listPagePosts(
  opts: { limit?: number; since?: string; until?: string; includeUnpublished?: boolean } = {},
) {
  const fields =
    "id,message,story,created_time,permalink_url,full_picture,status_type,is_published,scheduled_publish_time,shares,likes.summary(true).limit(0),comments.summary(true).limit(0)";
  const json = await graphRequest(
    `${requirePageId()}/${opts.includeUnpublished ? "promotable_posts" : "posts"}`,
    {
      query: {
        fields,
        limit: Math.min(100, opts.limit ?? 25),
        since: toUnix(opts.since),
        until: toUnix(opts.until),
        ...(opts.includeUnpublished ? { include_hidden: true, is_published: false } : {}),
      },
      token: "page",
    },
  );
  return (json?.data ?? []) as any[];
}

export async function getPost(postId: string) {
  return graphRequest(postId, {
    query: {
      fields:
        "id,message,story,created_time,permalink_url,full_picture,status_type,is_published,scheduled_publish_time,shares,likes.summary(true).limit(0),comments.summary(true).limit(0),attachments{media_type,url,title}",
    },
    token: "page",
  });
}

export async function getPostInsights(postId: string, metrics?: string) {
  const json = await graphRequest(`${postId}/insights`, {
    query: {
      metric:
        metrics ??
        "post_impressions,post_impressions_unique,post_engaged_users,post_clicks,post_reactions_by_type_total",
    },
    token: "page",
  });
  return (json?.data ?? []) as any[];
}

export async function getPageInsights(
  opts: { metrics?: string; period?: string; since?: string; until?: string } = {},
) {
  const json = await graphRequest(`${requirePageId()}/insights`, {
    query: {
      metric: opts.metrics ?? "page_post_engagements,page_follows,page_daily_follows_unique",
      period: opts.period ?? "day",
      since: toUnix(opts.since),
      until: toUnix(opts.until),
    },
    token: "page",
  });
  return (json?.data ?? []) as any[];
}

export async function listComments(
  objectId: string,
  opts: { limit?: number; order?: "chronological" | "reverse_chronological" } = {},
) {
  const json = await graphRequest(`${objectId}/comments`, {
    query: {
      fields:
        "id,message,from,created_time,like_count,comment_count,is_hidden,parent{id},permalink_url",
      limit: Math.min(100, opts.limit ?? 50),
      order: opts.order ?? "reverse_chronological",
      filter: "stream",
    },
    token: "page",
  });
  return (json?.data ?? []) as any[];
}

export async function setCommentHidden(commentId: string, hidden: boolean) {
  return graphRequest(commentId, { method: "POST", form: { is_hidden: hidden }, token: "page" });
}

export async function deleteObject(objectId: string, token: MetaTokenKind = "page") {
  return graphRequest(objectId, { method: "DELETE", token });
}

/**
 * Publikacja posta na stronie: tekst (z linkiem), zdjęcie albo wideo; z
 * `scheduledAt` post jest zaplanowany (Meta przyjmuje 10 min – 30 dni do przodu).
 */
export async function publishFacebookPost(opts: {
  message: string;
  link?: string;
  imageUrl?: string;
  videoUrl?: string;
  title?: string;
  scheduledAt?: string;
}) {
  const pageId = requirePageId();
  const scheduled = toUnix(opts.scheduledAt);
  const schedule = scheduled ? { published: false, scheduled_publish_time: scheduled } : {};
  if (opts.videoUrl) {
    const json = await graphRequest(`${pageId}/videos`, {
      method: "POST",
      form: { file_url: opts.videoUrl, description: opts.message, title: opts.title, ...schedule },
      token: "page",
      timeoutMs: 180_000,
    });
    return { id: json?.id as string, kind: "video" as const, scheduled: Boolean(scheduled) };
  }
  if (opts.imageUrl) {
    const json = await graphRequest(`${pageId}/photos`, {
      method: "POST",
      form: { url: opts.imageUrl, caption: opts.message, ...schedule },
      token: "page",
      timeoutMs: 120_000,
    });
    return {
      id: (json?.post_id ?? json?.id) as string,
      kind: "photo" as const,
      scheduled: Boolean(scheduled),
    };
  }
  if (!opts.message.trim() && !opts.link) throw new Error("Post wymaga treści, linku albo mediów.");
  const json = await graphRequest(`${pageId}/feed`, {
    method: "POST",
    form: { message: opts.message, link: opts.link, ...schedule },
    token: "page",
  });
  return { id: json?.id as string, kind: "status" as const, scheduled: Boolean(scheduled) };
}

// ── Instagram ───────────────────────────────────────────────────────────────

export async function getIgAccount() {
  return graphRequest(requireIgUserId(), {
    query: {
      fields:
        "id,username,name,followers_count,follows_count,media_count,profile_picture_url,biography,website",
    },
    token: "ig",
  });
}

export async function listIgMedia(opts: { limit?: number; since?: string; until?: string } = {}) {
  const json = await graphRequest(`${requireIgUserId()}/media`, {
    query: {
      fields:
        "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
      limit: Math.min(100, opts.limit ?? 25),
      since: toUnix(opts.since),
      until: toUnix(opts.until),
    },
    token: "ig",
  });
  return (json?.data ?? []) as any[];
}

export async function getIgMedia(mediaId: string) {
  return graphRequest(mediaId, {
    query: {
      fields:
        "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,username",
    },
    token: "ig",
  });
}

export async function getIgMediaInsights(mediaId: string, metrics?: string) {
  const json = await graphRequest(`${mediaId}/insights`, {
    query: { metric: metrics ?? "views,reach,likes,comments,shares,saved,total_interactions" },
    token: "ig",
  });
  return (json?.data ?? []) as any[];
}

/** Metryki konta IG, które nowe API zwraca tylko z `metric_type=total_value`. */
const IG_TOTAL_VALUE_METRICS = new Set([
  "profile_views",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "shares",
  "saves",
  "replies",
  "follows_and_unfollows",
  "profile_links_taps",
  "website_clicks",
]);

export async function getIgAccountInsights(
  opts: {
    metrics?: string;
    period?: string;
    since?: string;
    until?: string;
    metricType?: string;
  } = {},
) {
  const metrics = (
    opts.metrics ?? "reach,follower_count,profile_views,accounts_engaged,total_interactions"
  )
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const base = {
    period: opts.period ?? "day",
    since: toUnix(opts.since),
    until: toUnix(opts.until),
  };
  const path = `${requireIgUserId()}/insights`;
  if (opts.metricType) {
    const json = await graphRequest(path, {
      query: { ...base, metric: metrics.join(","), metric_type: opts.metricType },
      token: "ig",
    });
    return (json?.data ?? []) as any[];
  }
  // Meta wymaga metric_type=total_value dla części metryk, a follower_count
  // przyjmuje tylko szereg czasowy — dlatego dwa zapytania i scalony wynik.
  const series = metrics.filter((m) => !IG_TOTAL_VALUE_METRICS.has(m));
  const totals = metrics.filter((m) => IG_TOTAL_VALUE_METRICS.has(m));
  const calls: Promise<any>[] = [];
  if (series.length) {
    calls.push(graphRequest(path, { query: { ...base, metric: series.join(",") }, token: "ig" }));
  }
  if (totals.length) {
    calls.push(
      graphRequest(path, {
        query: { ...base, metric: totals.join(","), metric_type: "total_value" },
        token: "ig",
      }),
    );
  }
  const results = await Promise.all(calls);
  return results.flatMap((json) => (json?.data ?? []) as any[]);
}

export async function listIgComments(mediaId: string, limit = 50) {
  const json = await graphRequest(`${mediaId}/comments`, {
    query: {
      fields: "id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp}",
      limit: Math.min(100, limit),
    },
    token: "ig",
  });
  return (json?.data ?? []) as any[];
}

export async function replyIgComment(commentId: string, message: string) {
  return graphRequest(`${commentId}/replies`, { method: "POST", form: { message }, token: "ig" });
}

export async function setIgCommentHidden(commentId: string, hidden: boolean) {
  return graphRequest(commentId, { method: "POST", form: { hide: hidden }, token: "ig" });
}

/** Kontener mediów IG (zdjęcie, rolka, story) — pierwszy krok publikacji. */
export async function createIgContainer(opts: {
  imageUrl?: string;
  videoUrl?: string;
  caption?: string;
  mediaType?: "IMAGE" | "REELS" | "STORIES";
  shareToFeed?: boolean;
  coverUrl?: string;
}) {
  const igUserId = requireIgUserId();
  const form: Record<string, unknown> = { caption: opts.caption };
  if (opts.videoUrl) {
    form.video_url = opts.videoUrl;
    form.media_type = opts.mediaType === "STORIES" ? "STORIES" : "REELS";
    if (opts.shareToFeed !== undefined) form.share_to_feed = opts.shareToFeed;
    if (opts.coverUrl) form.cover_url = opts.coverUrl;
  } else if (opts.imageUrl) {
    form.image_url = opts.imageUrl;
    if (opts.mediaType === "STORIES") form.media_type = "STORIES";
  } else {
    throw new Error("Podaj image_url albo video_url.");
  }
  const json = await graphRequest(`${igUserId}/media`, {
    method: "POST",
    form,
    token: "ig",
    timeoutMs: 120_000,
  });
  if (!json?.id) throw new Error("Instagram nie zwrócił id kontenera.");
  return json.id as string;
}

export async function getIgContainerStatus(creationId: string) {
  const json = await graphRequest(creationId, {
    query: { fields: "status_code,status" },
    token: "ig",
  });
  return { status_code: String(json?.status_code ?? ""), status: String(json?.status ?? "") };
}

export async function publishIgContainer(creationId: string) {
  const json = await graphRequest(`${requireIgUserId()}/media_publish`, {
    method: "POST",
    form: { creation_id: creationId },
    token: "ig",
  });
  if (!json?.id) throw new Error("Instagram nie zwrócił id opublikowanego media.");
  return json.id as string;
}

// ── Messenger / Instagram Direct (przez stronę) ─────────────────────────────

export async function listConversations(
  opts: { platform?: "messenger" | "instagram"; limit?: number } = {},
) {
  const json = await graphRequest(`${requirePageId()}/conversations`, {
    query: {
      fields: "id,updated_time,participants,snippet,unread_count,message_count,can_reply",
      limit: Math.min(100, opts.limit ?? 25),
      platform: opts.platform === "instagram" ? "instagram" : undefined,
    },
    token: opts.platform === "instagram" ? "ig" : "page",
  });
  return (json?.data ?? []) as any[];
}

export async function getConversationMessages(
  conversationId: string,
  opts: { limit?: number; platform?: "messenger" | "instagram" } = {},
) {
  const json = await graphRequest(`${conversationId}/messages`, {
    query: {
      fields: "id,message,from,created_time,attachments{name,mime_type,file_url,image_data}",
      limit: Math.min(100, opts.limit ?? 50),
    },
    token: opts.platform === "instagram" ? "ig" : "page",
  });
  return (json?.data ?? []) as any[];
}

// ── Reklamy (token użytkownika / systemowy) ─────────────────────────────────

const ADS_INSIGHT_FIELDS =
  "spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions,cost_per_action_type,date_start,date_stop";

export async function listAdAccounts() {
  const json = await graphRequest("me/adaccounts", {
    query: {
      fields:
        "id,account_id,name,currency,account_status,business_name,amount_spent,balance,timezone_name",
      limit: 100,
    },
    token: "user",
  });
  return (json?.data ?? []) as any[];
}

export const actId = (accountId: string) =>
  accountId.startsWith("act_") ? accountId : `act_${accountId}`;

export async function listCampaigns(
  accountId: string,
  opts: { status?: string; limit?: number; datePreset?: string } = {},
) {
  const json = await graphRequest(`${actId(accountId)}/campaigns`, {
    query: {
      fields: `id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time,insights.date_preset(${opts.datePreset ?? "last_30d"}){${ADS_INSIGHT_FIELDS}}`,
      limit: Math.min(200, opts.limit ?? 50),
      effective_status: opts.status ? JSON.stringify([opts.status]) : undefined,
    },
    token: "user",
  });
  return (json?.data ?? []) as any[];
}

export async function listAdsets(
  parentId: string,
  opts: { limit?: number; datePreset?: string } = {},
) {
  const path =
    parentId.startsWith("act_") || (/^\d+$/.test(parentId) && parentId.length > 14)
      ? `${parentId}/adsets`
      : `${parentId}/adsets`;
  const json = await graphRequest(path, {
    query: {
      fields: `id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,start_time,end_time,targeting,insights.date_preset(${opts.datePreset ?? "last_30d"}){${ADS_INSIGHT_FIELDS}}`,
      limit: Math.min(200, opts.limit ?? 50),
    },
    token: "user",
  });
  return (json?.data ?? []) as any[];
}

export async function listAds(
  parentId: string,
  opts: { limit?: number; datePreset?: string } = {},
) {
  const json = await graphRequest(`${parentId}/ads`, {
    query: {
      fields: `id,name,adset_id,campaign_id,status,effective_status,created_time,creative{id,name,thumbnail_url,object_story_spec},insights.date_preset(${opts.datePreset ?? "last_30d"}){${ADS_INSIGHT_FIELDS}}`,
      limit: Math.min(200, opts.limit ?? 50),
    },
    token: "user",
  });
  return (json?.data ?? []) as any[];
}

export async function getAdsInsights(
  objectId: string,
  opts: {
    datePreset?: string;
    since?: string;
    until?: string;
    level?: string;
    breakdowns?: string;
    fields?: string;
  } = {},
) {
  const query: Record<string, string | number | undefined> = {
    fields: opts.fields ?? ADS_INSIGHT_FIELDS,
    level: opts.level,
    breakdowns: opts.breakdowns,
    limit: 100,
  };
  if (opts.since || opts.until) {
    query.time_range = JSON.stringify({
      since: (opts.since ?? "").slice(0, 10),
      until: (opts.until ?? new Date().toISOString()).slice(0, 10),
    });
  } else {
    query.date_preset = opts.datePreset ?? "last_30d";
  }
  const json = await graphRequest(
    `${objectId.startsWith("act_") || objectId.length < 14 ? actId(objectId) : objectId}/insights`,
    { query, token: "user" },
  );
  return (json?.data ?? []) as any[];
}

export async function updateAdObject(
  objectId: string,
  patch: {
    status?: "ACTIVE" | "PAUSED" | "ARCHIVED";
    name?: string;
    daily_budget_pln?: number;
    lifetime_budget_pln?: number;
  },
) {
  const form: Record<string, unknown> = {};
  if (patch.status) form.status = patch.status;
  if (patch.name) form.name = patch.name;
  if (patch.daily_budget_pln !== undefined)
    form.daily_budget = Math.round(patch.daily_budget_pln * 100);
  if (patch.lifetime_budget_pln !== undefined)
    form.lifetime_budget = Math.round(patch.lifetime_budget_pln * 100);
  if (!Object.keys(form).length) throw new Error("Brak pól do zmiany.");
  return graphRequest(objectId, { method: "POST", form, token: "user" });
}

// ── Formularze leadów ───────────────────────────────────────────────────────

export async function listLeadgenForms(pageId?: string) {
  const json = await graphRequest(`${pageId ?? requirePageId()}/leadgen_forms`, {
    query: { fields: "id,name,status,leads_count,created_time,locale,page{id,name}", limit: 100 },
    token: "page",
  });
  return (json?.data ?? []) as any[];
}

export async function listFormLeads(formId: string, opts: { limit?: number; since?: string } = {}) {
  const json = await graphRequest(`${formId}/leads`, {
    query: {
      fields:
        "id,created_time,field_data,ad_id,ad_name,adset_id,campaign_id,campaign_name,is_organic,platform",
      limit: Math.min(100, opts.limit ?? 25),
      filtering: opts.since
        ? JSON.stringify([
            { field: "time_created", operator: "GREATER_THAN", value: toUnix(opts.since) },
          ])
        : undefined,
    },
    token: "page",
  });
  return (json?.data ?? []) as any[];
}

// ── Conversions API ─────────────────────────────────────────────────────────

const sha256 = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

export async function sendConversionEvent(opts: {
  pixelId: string;
  eventName: string;
  eventTime?: number;
  eventId?: string;
  eventSourceUrl?: string;
  actionSource?: string;
  user: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    externalId?: string;
    fbc?: string;
    fbp?: string;
    clientIp?: string;
    userAgent?: string;
  };
  customData?: Record<string, unknown>;
  testEventCode?: string;
}) {
  const user_data: Record<string, unknown> = {};
  if (opts.user.email) user_data.em = [sha256(opts.user.email)];
  if (opts.user.phone) user_data.ph = [sha256(opts.user.phone.replace(/\D/g, ""))];
  if (opts.user.firstName) user_data.fn = [sha256(opts.user.firstName)];
  if (opts.user.lastName) user_data.ln = [sha256(opts.user.lastName)];
  if (opts.user.externalId) user_data.external_id = [sha256(opts.user.externalId)];
  if (opts.user.fbc) user_data.fbc = opts.user.fbc;
  if (opts.user.fbp) user_data.fbp = opts.user.fbp;
  if (opts.user.clientIp) user_data.client_ip_address = opts.user.clientIp;
  if (opts.user.userAgent) user_data.client_user_agent = opts.user.userAgent;
  const eventId =
    opts.eventId ?? `${opts.eventName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    data: [
      {
        event_name: opts.eventName,
        event_time: opts.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: opts.eventSourceUrl,
        action_source: opts.actionSource ?? "system_generated",
        user_data,
        custom_data: opts.customData,
      },
    ],
    test_event_code: opts.testEventCode,
  };
  const json = await graphRequest(`${opts.pixelId}/events`, {
    method: "POST",
    form: { data: payload.data, test_event_code: payload.test_event_code },
    token: "pixel",
  });
  return { eventId, response: json };
}
