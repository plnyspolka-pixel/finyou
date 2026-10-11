// Odpowiedzi na komentarze — budowanie rozmowy pod postami.
//
// Zakres świadomie wąski:
//   • Instagram i YouTube — tu dziś nikt automatycznie nie odpowiada,
//   • Facebook POMIJAMY: webhook (meta-messaging.server.ts) już odpowiada
//     publicznie i pisze prywatnie przez agenta A1 — druga odpowiedź byłaby
//     dublem,
//   • komentarze z hasłem lead magnetu zostawiamy automatowi lead magnetów.
//
// Każda odpowiedź przechodzi przez strażnika prawdy (platforma comment_reply);
// sprawy dla człowieka (skarga, groźba) trafiają do dziennika jako needs_human.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildLiveFactsBlock } from "@/lib/agent-toolkit/live-facts";
import { getAgentState, logAgentAction, setAgentState } from "@/lib/agent-toolkit/store.server";
import { hasKeyword } from "@/lib/lead-magnets/core";
import { REPLY_SYSTEM_PROMPT, buildReplyUserPrompt } from "./brief";
import { growthLlmJson } from "./llm.server";
import { guardContent } from "./truth-guard";
import type { GrowthSettings } from "./state.server";

const MAX_AGE_H = 72;
const MEDIA_LOOKBACK_DAYS = 7;

interface PendingComment {
  platform: "instagram" | "youtube";
  id: string;
  text: string;
  author: string;
  postText: string;
}

async function leadMagnetKeywords(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("lead_magnets")
    .select("trigger_keywords")
    .eq("published", true);
  return ((data ?? []) as Array<{ trigger_keywords: string[] | null }>).flatMap(
    (r) => r.trigger_keywords ?? [],
  );
}

async function instagramPending(
  replied: Set<string>,
  keywords: string[],
  now: Date,
): Promise<PendingComment[]> {
  const m = await import("@/lib/meta-api.server");
  const env = m.metaEnv();
  if (!env.igUserId || !env.hasIgToken) return [];
  const account = await m.getIgAccount().catch(() => null);
  const ownUsername = String(account?.username ?? "").toLowerCase();
  const since = new Date(now.getTime() - MEDIA_LOOKBACK_DAYS * 86_400_000).toISOString();
  const media = await m.listIgMedia({ limit: 15, since }).catch(() => [] as any[]);
  const out: PendingComment[] = [];
  for (const md of media) {
    if (!md?.comments_count) continue;
    const comments = await m.listIgComments(md.id, 50).catch(() => [] as any[]);
    for (const c of comments) {
      const author = String(c?.username ?? "").toLowerCase();
      if (!c?.id || replied.has(c.id) || c.hidden || author === ownUsername) continue;
      if (now.getTime() - new Date(c.timestamp).getTime() > MAX_AGE_H * 3600_000) continue;
      const repliedByUs = (c?.replies?.data ?? []).some(
        (r: any) => String(r?.username ?? "").toLowerCase() === ownUsername,
      );
      if (repliedByUs) continue;
      const text = String(c?.text ?? "").trim();
      if (!text || hasKeyword(text, keywords)) continue;
      out.push({
        platform: "instagram",
        id: c.id,
        text,
        author: c.username ?? "",
        postText: String(md.caption ?? ""),
      });
    }
  }
  return out;
}

async function youtubePending(
  replied: Set<string>,
  keywords: string[],
  now: Date,
): Promise<PendingComment[]> {
  // Poświadczenia YouTube są w tabeli youtube_integration — brak połączenia
  // kończy się błędem getMyChannel, wtedy po prostu nic nie robimy.
  const yt = await import("@/lib/youtube-api.server");
  const channel = await yt.getMyChannel().catch(() => null);
  const channelId = String(channel?.id ?? "");
  if (!channelId) return [];
  const { videos } = await yt.listMyVideos({ limit: 10 }).catch(() => ({ videos: [] as any[] }));
  const out: PendingComment[] = [];
  for (const v of videos) {
    const published = new Date(v?.snippet?.publishedAt ?? 0).getTime();
    if (now.getTime() - published > MEDIA_LOOKBACK_DAYS * 86_400_000) continue;
    if (!Number(v?.statistics?.commentCount)) continue;
    const { threads } = await yt
      .listCommentThreads(v.id, { limit: 30 })
      .catch(() => ({ threads: [] as any[] }));
    for (const t of threads) {
      const top = t?.snippet?.topLevelComment;
      const s = top?.snippet;
      if (!top?.id || replied.has(top.id)) continue;
      if (s?.authorChannelId?.value === channelId) continue;
      if (now.getTime() - new Date(s?.publishedAt ?? 0).getTime() > MAX_AGE_H * 3600_000) continue;
      const repliedByUs = (t?.replies?.comments ?? []).some(
        (r: any) => r?.snippet?.authorChannelId?.value === channelId,
      );
      if (repliedByUs) continue;
      const text = String(s?.textOriginal ?? s?.textDisplay ?? "").trim();
      if (!text || hasKeyword(text, keywords)) continue;
      out.push({
        platform: "youtube",
        id: top.id,
        text,
        author: s?.authorDisplayName ?? "",
        postText: `${v?.snippet?.title ?? ""}\n${v?.snippet?.description ?? ""}`,
      });
    }
  }
  return out;
}

export async function engageComments(
  settings: GrowthSettings,
  opts: { now?: Date; dryRun?: boolean } = {},
) {
  const now = opts.now ?? new Date();
  if (!settings.engage || settings.maxRepliesPerRun <= 0)
    return { replied: 0, skipped: 0, costPln: 0, notes: ["wyłączone"] };
  const repliedIds = await getAgentState<string[]>("growth_replied_ids", []);
  const replied = new Set(repliedIds);
  const keywords = await leadMagnetKeywords().catch(() => [] as string[]);
  const pending = [
    ...(await instagramPending(replied, keywords, now).catch(() => [] as PendingComment[])),
    ...(await youtubePending(replied, keywords, now).catch(() => [] as PendingComment[])),
  ];

  let costPln = 0;
  let done = 0;
  let skipped = 0;
  const notes: string[] = [];
  for (const c of pending) {
    if (done >= settings.maxRepliesPerRun) break;
    const audience = /inwest|kapitał|zysk|zwrot/i.test(c.postText) ? "inwestor" : "klient";
    const llm = await growthLlmJson<{
      skip?: boolean;
      needs_human?: boolean;
      reply?: string;
      reason?: string;
    }>({
      system: REPLY_SYSTEM_PROMPT,
      user: buildReplyUserPrompt({
        comment: c.text,
        postText: c.postText,
        factsBlock: buildLiveFactsBlock(audience, now),
      }),
      temperature: 0.5,
    }).catch(() => null);
    if (!llm) continue;
    costPln += llm.costPln;
    const r = llm.data;
    replied.add(c.id);
    if (r.skip || r.needs_human || !r.reply) {
      skipped++;
      if (r.needs_human && !opts.dryRun) {
        await logAgentAction({
          module: "agent_insights",
          action: "needs_human",
          summary: `${c.platform}: komentarz wymaga człowieka — ${String(r.reason ?? "").slice(0, 200)}`,
          payload: { platform: c.platform, comment_id: c.id, text: c.text.slice(0, 500) },
        });
      }
      continue;
    }
    const guard = guardContent({ text: r.reply, audience, platform: "comment_reply", date: now });
    if (!guard.ok) {
      skipped++;
      notes.push(
        `odrzucona odpowiedź (${guard.violations
          .filter((v) => v.severity === "block")
          .map((v) => v.code)
          .join(",")})`,
      );
      continue;
    }
    if (opts.dryRun) {
      notes.push(`[dry] ${c.platform}: „${c.text.slice(0, 60)}” → „${guard.text.slice(0, 120)}”`);
      done++;
      continue;
    }
    try {
      if (c.platform === "instagram") {
        const m = await import("@/lib/meta-api.server");
        await m.replyIgComment(c.id, guard.text);
      } else {
        const yt = await import("@/lib/youtube-api.server");
        await yt.replyToComment(c.id, guard.text);
      }
      done++;
      await logAgentAction({
        module: "growth_agent",
        action: "reply",
        summary: `${c.platform}: ${guard.text.slice(0, 200)}`,
        payload: {
          platform: c.platform,
          comment_id: c.id,
          comment: c.text.slice(0, 500),
          reply: guard.text,
        },
        costPln: llm.costPln,
      });
    } catch (e) {
      notes.push(
        `${c.platform} błąd odpowiedzi: ${e instanceof Error ? e.message.slice(0, 120) : e}`,
      );
    }
  }
  if (!opts.dryRun) await setAgentState("growth_replied_ids", [...replied].slice(-500));
  return { replied: done, skipped, costPln, pending: pending.length, notes };
}
