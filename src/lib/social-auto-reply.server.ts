// Automatyczne odpowiedzi na komentarze pod postami strony FB, mediami IG
// i filmami kanału YouTube — na wyraźne życzenie właściciela (odpowiadamy,
// a nie tylko monitorujemy). Tick co 15 minut (pg_cron →
// /api/public/hooks/social-comments-tick, migracja 20261006120000).
//
// Przebieg ticka:
//   1. komentarze najwyższego poziomu z ostatnich ~14 dni (FB: posty strony
//      + opublikowane Reels z kolejki, IG: media konta, YT: commentThreads
//      allThreadsRelatedToChannelId),
//   2. odsiew: własne komentarze, komentarze z naszą odpowiedzią, id już
//      obecne w social_comment_replies,
//   3. decyzja modelu (Lovable AI, JSON: reply / skip / escalate) + twarde
//      reguły z social-auto-reply.ts (zakazane frazy z publication-guardrails,
//      dane osobowe, obce linki, długość) — odpowiedź, która ich nie przejdzie,
//      staje się eskalacją,
//   4. publikacja odpowiedzi tymi samymi endpointami co narzędzia MCP
//      reply_*_comment, zapis każdej decyzji, mail do zespołu z eskalacjami.
//
// Limity: maks. MAX_REPLIES_PER_TICK publikacji i MAX_DECISIONS_PER_TICK
// zapytań do modelu na przebieg. Limit zapytań Meta / quota YouTube
// zatrzymuje dany tor do następnego ticka (komentarz nie jest zapisywany,
// więc wróci). Błąd jednego komentarza nie przerywa przebiegu.
//
// Przełącznik SOCIAL_AUTO_REPLY: `off` — nic nie robi, `dry` — zapisuje
// proponowaną odpowiedź jako `dry_run` bez publikacji, inaczej — na żywo.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  LOOKBACK_DAYS,
  autoReplyMode,
  buildDecisionPrompt,
  buildEscalationEmail,
  commentKey,
  finalizeDecision,
  isMetaRateLimitError,
  isYoutubeQuotaError,
  parseReplyDecision,
  selectNewComments,
  teamAlertEmail,
  type EscalationItem,
  type ReplyAction,
  type SocialComment,
  type SocialPlatform,
} from "./social-auto-reply";

export const MAX_REPLIES_PER_TICK = 8;
export const MAX_DECISIONS_PER_TICK = 12;
/** Ile obiektów (postów / mediów) na platformę przeglądamy w jednym ticku. */
const MAX_OBJECTS_PER_PLATFORM = 25;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Platforma auto-komentarza, z której bierzemy link śledzący. */
const LINK_PLATFORM = {
  facebook: "facebook_post",
  instagram: "instagram_reels",
  youtube: "youtube",
} as const;

// ── Kształty odpowiedzi API (tylko pola, których używamy) ───────────────────

type FbComment = {
  id: string;
  message?: string;
  from?: { id?: string; name?: string };
  created_time?: string;
  permalink_url?: string;
  comment_count?: number;
  comments?: { data?: Array<{ from?: { id?: string } }> };
};
type IgMedia = {
  id: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
  comments_count?: number;
};
type IgComment = {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  replies?: { data?: Array<{ username?: string }> };
};
type YtCommentSnippet = {
  authorDisplayName?: string;
  authorChannelId?: { value?: string };
  textOriginal?: string;
  textDisplay?: string;
  publishedAt?: string;
  videoId?: string;
};
type YtThread = {
  snippet?: {
    videoId?: string;
    canReply?: boolean;
    totalReplyCount?: number;
    topLevelComment?: { id?: string; snippet?: YtCommentSnippet };
  };
  replies?: { comments?: Array<{ snippet?: YtCommentSnippet }> };
};

// ── Pobieranie komentarzy ───────────────────────────────────────────────────

async function fetchFacebookComments(sinceIso: string): Promise<SocialComment[]> {
  const m = await import("./meta-api.server");
  const pageId = m.requirePageId();
  const objects = new Map<string, { text: string; permalink: string | null }>();
  const posts = await m.listPagePosts({ since: sinceIso, limit: MAX_OBJECTS_PER_PLATFORM });
  for (const p of posts) {
    // Post bez komentarzy — szkoda zapytania.
    if ((p?.comments?.summary?.total_count ?? 1) === 0) continue;
    objects.set(String(p.id), {
      text: String(p.message ?? p.story ?? ""),
      permalink: p.permalink_url ?? null,
    });
  }
  // Reels nie zawsze są widoczne w /posts — dokładamy opublikowane z kolejki.
  const { data: reels } = await supabaseAdmin
    .from("social_publish_queue")
    .select("external_post_id, title, message")
    .eq("platform", "facebook_reels")
    .eq("status", "published")
    .gte("published_at", sinceIso)
    .not("external_post_id", "is", null)
    .limit(MAX_OBJECTS_PER_PLATFORM);
  for (const r of reels ?? []) {
    if (r.external_post_id && !objects.has(r.external_post_id)) {
      objects.set(r.external_post_id, { text: r.title || r.message, permalink: null });
    }
  }

  const out: SocialComment[] = [];
  for (const [objectId, obj] of [...objects].slice(0, MAX_OBJECTS_PER_PLATFORM)) {
    let rows: FbComment[] = [];
    try {
      const json = await m.graphRequest(`${objectId}/comments`, {
        query: {
          fields:
            "id,message,from{id,name},created_time,permalink_url,comment_count,comments.limit(25){from{id}}",
          filter: "toplevel",
          order: "reverse_chronological",
          limit: 50,
        },
        token: "page",
      });
      rows = (json?.data ?? []) as FbComment[];
    } catch (e) {
      // Limit zapytań przerywa cały tor; usunięty post itp. — tylko ten obiekt.
      if (isMetaRateLimitError(errMsg(e))) throw e;
      console.warn(`[social-auto-reply] facebook ${objectId}: ${errMsg(e)}`);
      continue;
    }
    for (const c of rows) {
      const replies = c.comments?.data ?? [];
      const replyCount = Number(c?.comment_count ?? replies.length);
      out.push({
        platform: "facebook",
        commentId: String(c.id),
        objectId,
        authorName: c?.from?.name ?? null,
        text: String(c?.message ?? ""),
        createdAt: String(c?.created_time ?? ""),
        permalink: c?.permalink_url ?? obj.permalink,
        contextText: obj.text,
        isOwn: c?.from?.id === pageId,
        // Więcej odpowiedzi niż pobraliśmy — nie wykluczymy naszej, więc nie ruszamy.
        hasOurReply: replies.some((r) => r?.from?.id === pageId) || replyCount > replies.length,
      });
    }
  }
  return out;
}

async function fetchInstagramComments(sinceIso: string): Promise<SocialComment[]> {
  const m = await import("./meta-api.server");
  const account = await m.getIgAccount();
  const own = String(account?.username ?? "").toLowerCase();
  const sinceTs = new Date(sinceIso).getTime();
  const media = (await m.listIgMedia({ limit: MAX_OBJECTS_PER_PLATFORM })).filter(
    (md: IgMedia) =>
      new Date(md?.timestamp ?? 0).getTime() >= sinceTs && Number(md?.comments_count ?? 0) > 0,
  );
  const out: SocialComment[] = [];
  for (const md of media) {
    let rows: IgComment[] = [];
    try {
      rows = await m.listIgComments(String(md.id), 50);
    } catch (e) {
      if (isMetaRateLimitError(errMsg(e))) throw e;
      console.warn(`[social-auto-reply] instagram ${md.id}: ${errMsg(e)}`);
      continue;
    }
    for (const c of rows) {
      const replies = c.replies?.data ?? [];
      out.push({
        platform: "instagram",
        commentId: String(c.id),
        objectId: String(md.id),
        authorName: c?.username ?? null,
        text: String(c?.text ?? ""),
        createdAt: String(c?.timestamp ?? ""),
        // API nie daje linku do komentarza IG — linkujemy media.
        permalink: md?.permalink ?? null,
        contextText: md?.caption ?? null,
        isOwn: !!own && String(c?.username ?? "").toLowerCase() === own,
        hasOurReply: !!own && replies.some((r) => String(r?.username ?? "").toLowerCase() === own),
      });
    }
  }
  return out;
}

async function fetchYoutubeComments(): Promise<SocialComment[]> {
  const yt = await import("./youtube-api.server");
  const channel = await yt.getMyChannel();
  const channelId = String(channel?.id ?? "");
  if (!channelId) throw new Error("Nie udało się ustalić id kanału YouTube.");
  const json = await yt.youtubeRequest("/commentThreads", {
    query: {
      part: "snippet,replies",
      allThreadsRelatedToChannelId: channelId,
      maxResults: 100,
      order: "time",
      textFormat: "plainText",
    },
  });
  const threads = (json?.items ?? []) as YtThread[];
  // Tytuły filmów jako kontekst (1 jednostka quota za paczkę do 50 id).
  const videoIds = [
    ...new Set(threads.map((t) => t?.snippet?.videoId).filter(Boolean) as string[]),
  ].slice(0, 50);
  const titles = new Map<string, string>();
  try {
    for (const v of await yt.listVideos(videoIds)) {
      titles.set(String(v.id), String(v?.snippet?.title ?? ""));
    }
  } catch (e) {
    console.warn(`[social-auto-reply] youtube titles: ${errMsg(e)}`);
  }
  const out: SocialComment[] = [];
  for (const t of threads) {
    const top = t?.snippet?.topLevelComment;
    const s = top?.snippet ?? {};
    const videoId = String(t?.snippet?.videoId ?? s?.videoId ?? "");
    if (!top?.id || !videoId) continue;
    const replies = t.replies?.comments ?? [];
    const totalReplies = Number(t?.snippet?.totalReplyCount ?? replies.length);
    out.push({
      platform: "youtube",
      commentId: String(top.id),
      objectId: videoId,
      authorName: s?.authorDisplayName ?? null,
      text: String(s?.textOriginal ?? s?.textDisplay ?? ""),
      createdAt: String(s?.publishedAt ?? ""),
      permalink: `https://www.youtube.com/watch?v=${videoId}&lc=${top.id}`,
      contextText: titles.get(videoId) ?? null,
      isOwn: s?.authorChannelId?.value === channelId,
      hasOurReply:
        t?.snippet?.canReply === false ||
        replies.some((r) => r?.snippet?.authorChannelId?.value === channelId) ||
        totalReplies > replies.length,
    });
  }
  return out;
}

// ── Publikacja odpowiedzi ───────────────────────────────────────────────────

/** Ta sama ścieżka co reply_facebook_comment / reply_instagram_comment / reply_youtube_comment. */
async function postReply(c: SocialComment, text: string): Promise<string | null> {
  if (c.platform === "youtube") {
    const yt = await import("./youtube-api.server");
    const r = await yt.replyToComment(c.commentId, text);
    return r?.id ?? null;
  }
  const m = await import("./meta-api.server");
  if (c.platform === "instagram") {
    const r = await m.replyIgComment(c.commentId, text);
    return r?.id ?? null;
  }
  const r = await m.graphRequest(`${c.commentId}/comments`, {
    method: "POST",
    form: { message: text },
    token: "page",
  });
  return r?.id ?? null;
}

// ── Rejestr decyzji ─────────────────────────────────────────────────────────

type DecisionRow = {
  action: ReplyAction;
  reason: string | null;
  reply_text: string | null;
  reply_id?: string | null;
};

/**
 * Zapis decyzji z unikalnym (platform, comment_id) jako blokadą: gdy inny
 * przebieg zdążył pierwszy, zwraca false i komentarz jest pomijany.
 */
async function claimDecision(c: SocialComment, row: DecisionRow): Promise<boolean> {
  const { error } = await supabaseAdmin.from("social_comment_replies").insert({
    platform: c.platform,
    comment_id: c.commentId,
    object_id: c.objectId,
    author_name: c.authorName?.slice(0, 200) ?? null,
    comment_text: c.text.slice(0, 4000),
    permalink: c.permalink,
    action: row.action,
    reason: row.reason?.slice(0, 1000) ?? null,
    reply_text: row.reply_text,
    reply_id: row.reply_id ?? null,
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`social_comment_replies: ${error.message}`);
}

async function loadProcessed(comments: SocialComment[]): Promise<Set<string>> {
  const processed = new Set<string>();
  const byPlatform = new Map<SocialPlatform, string[]>();
  for (const c of comments) {
    const list = byPlatform.get(c.platform) ?? [];
    list.push(c.commentId);
    byPlatform.set(c.platform, list);
  }
  for (const [platform, ids] of byPlatform) {
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabaseAdmin
        .from("social_comment_replies")
        .select("comment_id")
        .eq("platform", platform)
        .in("comment_id", ids.slice(i, i + 200));
      if (error) throw new Error(`social_comment_replies: ${error.message}`);
      for (const r of data ?? []) processed.add(commentKey(platform, r.comment_id));
    }
  }
  return processed;
}

// ── Tick ────────────────────────────────────────────────────────────────────

export type SocialAutoReplyTickResult = {
  ok: boolean;
  mode: string;
  fetched: Partial<Record<SocialPlatform, number | string>>;
  candidates: number;
  decided: number;
  counts: Partial<Record<ReplyAction, number>>;
  /** Tory zatrzymane do następnego ticka (limit zapytań / quota). */
  paused: SocialPlatform[];
  escalation_email?: string;
};

export async function runSocialAutoReplyTick(): Promise<SocialAutoReplyTickResult> {
  const mode = autoReplyMode(process.env.SOCIAL_AUTO_REPLY);
  const result: SocialAutoReplyTickResult = {
    ok: true,
    mode,
    fetched: {},
    candidates: 0,
    decided: 0,
    counts: {},
    paused: [],
  };
  if (mode === "off") return result;

  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const all: SocialComment[] = [];
  const paused = new Set<SocialPlatform>();
  const sources: Array<[SocialPlatform, () => Promise<SocialComment[]>]> = [
    ["facebook", () => fetchFacebookComments(sinceIso)],
    ["instagram", () => fetchInstagramComments(sinceIso)],
    ["youtube", () => fetchYoutubeComments()],
  ];
  // Każda platforma osobno — brak tokena albo awaria jednej nie zatrzymuje reszty.
  for (const [platform, fetcher] of sources) {
    try {
      const rows = await fetcher();
      all.push(...rows);
      result.fetched[platform] = rows.length;
    } catch (e) {
      const msg = errMsg(e);
      result.fetched[platform] = `błąd: ${msg.slice(0, 200)}`;
      if (isMetaRateLimitError(msg) || isYoutubeQuotaError(msg)) paused.add(platform);
    }
  }

  const processed = await loadProcessed(all);
  const candidates = selectNewComments(all, { processed });
  result.candidates = candidates.length;

  const { lovableAiJson } = await import("./lovable-ai.server");
  const { ensureFirstCommentLink } = await import("./publish-first-comment.server");
  const bump = (a: ReplyAction) => (result.counts[a] = (result.counts[a] ?? 0) + 1);
  const escalations: EscalationItem[] = [];
  let replies = 0;

  for (const c of candidates) {
    if (result.decided >= MAX_DECISIONS_PER_TICK || replies >= MAX_REPLIES_PER_TICK) break;
    if (paused.has(c.platform)) continue;
    try {
      const link = await ensureFirstCommentLink(LINK_PLATFORM[c.platform]);
      const prompt = buildDecisionPrompt(c, link);
      let raw: unknown;
      try {
        raw = await lovableAiJson({ ...prompt, temperature: 0.3, timeoutMs: 30_000 });
      } catch (e) {
        // Model niedostępny — komentarz wróci w kolejnym ticku (bez zapisu).
        console.warn(`[social-auto-reply] AI: ${errMsg(e)}`);
        break;
      }
      result.decided += 1;
      const decision = finalizeDecision(parseReplyDecision(raw));

      if (decision.action === "skip") {
        const claimed = await claimDecision(c, {
          action: "skipped",
          reason: decision.reason,
          reply_text: null,
        });
        if (claimed) bump("skipped");
        continue;
      }

      if (decision.action === "escalate") {
        const claimed = await claimDecision(c, {
          action: "escalated",
          reason: decision.reason,
          reply_text: decision.reply || null,
        });
        if (claimed) {
          bump("escalated");
          escalations.push({
            platform: c.platform,
            authorName: c.authorName,
            text: c.text,
            reason: decision.reason,
            permalink: c.permalink,
            proposedReply: decision.reply || null,
          });
        }
        continue;
      }

      // reply
      if (mode === "dry") {
        const claimed = await claimDecision(c, {
          action: "dry_run",
          reason: decision.reason,
          reply_text: decision.reply,
        });
        if (claimed) bump("dry_run");
        continue;
      }
      // Najpierw blokada w rejestrze, potem publikacja — równoległy przebieg
      // nie odpowie drugi raz na ten sam komentarz.
      const claimed = await claimDecision(c, {
        action: "replied",
        reason: decision.reason,
        reply_text: decision.reply,
      });
      if (!claimed) continue;
      try {
        const replyId = await postReply(c, decision.reply);
        replies += 1;
        bump("replied");
        await supabaseAdmin
          .from("social_comment_replies")
          .update({ reply_id: replyId })
          .eq("platform", c.platform)
          .eq("comment_id", c.commentId);
      } catch (e) {
        const msg = errMsg(e);
        if (isMetaRateLimitError(msg) || isYoutubeQuotaError(msg)) {
          // Limit platformy: zdejmujemy blokadę, komentarz wróci w kolejnym ticku.
          paused.add(c.platform);
          await supabaseAdmin
            .from("social_comment_replies")
            .delete()
            .eq("platform", c.platform)
            .eq("comment_id", c.commentId);
          continue;
        }
        bump("failed");
        await supabaseAdmin
          .from("social_comment_replies")
          .update({ action: "failed", reason: `Publikacja nieudana: ${msg}`.slice(0, 1000) })
          .eq("platform", c.platform)
          .eq("comment_id", c.commentId);
      }
    } catch (e) {
      // Pojedynczy komentarz nie może zatrzymać ticka.
      console.warn(`[social-auto-reply] ${c.platform}/${c.commentId}: ${errMsg(e)}`);
    }
  }

  result.paused = [...paused];
  if (escalations.length) {
    const to = teamAlertEmail(process.env, "SOCIAL_ALERT_EMAIL");
    const mail = buildEscalationEmail(escalations, mode);
    try {
      const { sendResendEmail } = await import("./resend-send.server");
      const r = await sendResendEmail({
        to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        noBranding: true,
        // Powiadomienie wewnętrzne dla zespołu — nigdy nie podlega wypisowi.
        category: "transactional",
      });
      result.escalation_email = r.ok ? `wysłany do ${to}` : `błąd: ${r.error ?? "?"}`;
    } catch (e) {
      result.escalation_email = `błąd: ${errMsg(e)}`;
    }
  }
  return result;
}
