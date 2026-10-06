// Rozstaw tematów w kolejkach publikacji — część serwerowa: pobiera
// sąsiednie wpisy (zaplanowane i opublikowane) tego samego kanału z obu
// kolejek i liczy termin czystym `spreadScheduledAt`
// (src/lib/publication-schedule.ts). Wołają go enqueuePublication,
// auto-publikacja Studia i narzędzie MCP queue_youtube_publication.
//
// Błąd odczytu kolejki NIE blokuje publikacji — wtedy zostaje termin
// docelowy (rozstaw to optymalizacja, nie warunek).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  describeShift,
  neighbourWindow,
  publicationChannel,
  spreadScheduledAt,
  topicText,
  type ScheduledNeighbour,
  type SpreadResult,
} from "./publication-schedule";
import type { StudioPlatform } from "./studio-platforms";

// Wpisy, które wyszły albo jeszcze wyjdą; failed / cancelled nie liczą się.
const LIVE_STATUSES = ["pending", "publishing", "processing", "published"];

/** Platformy kolejki social_publish_queue należące do tego samego kanału. */
function socialPlatformsOfChannel(platform: StudioPlatform): string[] {
  const channel = publicationChannel(platform);
  return channel === "facebook" ? ["facebook_post", "facebook_reels"] : [platform];
}

function overlapFilter(from: string, to: string): string {
  return (
    `and(scheduled_at.gte.${from},scheduled_at.lte.${to}),` +
    `and(published_at.gte.${from},published_at.lte.${to})`
  );
}

/** Wpisy kanału z okna, w którym szukamy konfliktów tematów. */
export async function loadScheduleNeighbours(
  platform: StudioPlatform,
  target: string | Date,
): Promise<ScheduledNeighbour[]> {
  const { from, to } = neighbourWindow(target);
  const range = overlapFilter(from.toISOString(), to.toISOString());
  if (platform === "youtube") {
    const { data, error } = await supabaseAdmin
      .from("youtube_publish_queue")
      .select("id, title, description, scheduled_at, published_at, status")
      .in("status", LIVE_STATUSES)
      .or(range)
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      title: topicText(r.title, r.description),
      at: r.status === "published" && r.published_at ? r.published_at : r.scheduled_at,
    }));
  }
  const { data, error } = await supabaseAdmin
    .from("social_publish_queue")
    .select("id, title, message, scheduled_at, published_at, status")
    .in("platform", socialPlatformsOfChannel(platform))
    .in("status", LIVE_STATUSES)
    .or(range)
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    title: topicText(r.title, r.message),
    at: r.status === "published" && r.published_at ? r.published_at : r.scheduled_at,
  }));
}

/**
 * Termin dla nowego wpisu z rozstawem podobnych tematów (+24 h, maks. 7 dób)
 * i notka do `guardrail_notes`, gdy termin się zmienił. Nigdy nie rzuca.
 */
export async function spreadPublicationSlot(args: {
  platform: StudioPlatform;
  title?: string | null;
  message?: string | null;
  target: string | Date;
}): Promise<{ scheduledAt: string; note: string | null; result: SpreadResult | null }> {
  const targetIso = new Date(args.target).toISOString();
  const topic = topicText(args.title, args.message);
  if (!topic) return { scheduledAt: targetIso, note: null, result: null };
  try {
    const neighbours = await loadScheduleNeighbours(args.platform, targetIso);
    const result = spreadScheduledAt(targetIso, topic, neighbours);
    return {
      scheduledAt: result.scheduledAt.toISOString(),
      note: describeShift(args.platform, result),
      result,
    };
  } catch (e) {
    console.warn(
      `[publication-schedule] ${args.platform}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { scheduledAt: targetIso, note: null, result: null };
  }
}
