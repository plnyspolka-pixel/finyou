// Poranny digest zaangażowania i link buildingu — tick i oznaczanie.
// Hook: /api/public/hooks/engagement-digest-tick (pg_cron codziennie
// 05:30 UTC, migracja 20261006150000). Przebieg:
//   0. automatyczne „Zrobione" dla pozycji 'sent' z 14 dni (auto-detect.ts:
//      nasz komentarz pod filmem YouTube, link do financeyou.pl na stronie
//      wątku forum) — przed wyborem nowych, żeby liczniki 7 dni w mailu je
//      widziały; w poniedziałki też autodiscovery feedów RSS forów,
//   1. źródła z collectors.server.ts — każde osobno (awaria jednego nie
//      zatrzymuje reszty), nowe pozycje trafiają do engagement_opportunities,
//   2. wybór do ~10 pozycji 'new' (selectDigestItems: limity per rodzaj,
//      najstarsze najpierw, po równo),
//   3. JEDEN mail (DAILY_DIGEST_EMAIL → TEAM_NOTIFY_EMAIL →
//      kontakt@financeyou.pl) z podpisanymi linkami „Zrobione" / „Pomiń";
//      po udanej wysyłce pozycje dostają status 'sent'. Nic nowego = brak maila.
// Drugi mail w ciągu 20 h tylko z `force` (prywatny CRON_SECRET).
// Wyłącznik: ENGAGEMENT_DIGEST=off.
//
// Oznaczanie (/api/public/engagement/mark): „Zrobione" z linkiem do
// financeyou.pl dopisuje backlink 'pending' (ai_backlinks), outreach
// oznacza wiadomość jako wysłaną, a PR — okazję jako 'sent'.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  KIND_MAX_AGE_DAYS,
  backlinkForDoneItem,
  digestEnabled,
  digestRecipient,
  isFresh,
  selectDigestItems,
  type EngagementItem,
  type EngagementKind,
} from "./core";
import {
  hasOwnCommentAfter,
  planAutoDetect,
  AUTO_DETECT_MAX_AGE_DAYS,
  type SentItem,
} from "./auto-detect";
import { COLLECTORS, discoverForumFeeds, type CollectorContext } from "./collectors.server";
import { buildDigestEmail, type DigestCard, type SourceStatus } from "./email";
import { signMarkToken, type MarkAction } from "./token";

const DAY_MS = 86_400_000;
/** Budżet czasu na źródła (pg_net czeka 300 s). */
const COLLECT_BUDGET_MS = 200_000;
/** Ochrona przed drugim mailem tego samego dnia. */
const RESEND_GUARD_MS = 20 * 3_600_000;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
// Tabele pr_* nie są w wygenerowanych typach Supabase — klient bez generyka.
const db = supabaseAdmin as unknown as SupabaseClient;

/** Sekret podpisu linków: CRON_SECRET, awaryjnie klucz service_role (oba tylko na serwerze). */
export function markSecret(): string {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

const ITEM_COLUMNS = "id, kind, source, url, title, snippet, suggested_text, extra, created_at";

type ItemRow = {
  id: string;
  kind: string;
  source: string | null;
  url: string;
  title: string | null;
  snippet: string | null;
  suggested_text: string | null;
  extra: unknown;
  created_at: string;
};

function toItem(r: ItemRow): EngagementItem {
  return {
    ...r,
    kind: r.kind as EngagementKind,
    extra: r.extra && typeof r.extra === "object" ? (r.extra as EngagementItem["extra"]) : {},
  };
}

/** Pozycje 'new', które jeszcze mają sens (najstarsze najpierw). */
async function loadOpenItems(now: Date): Promise<EngagementItem[]> {
  const maxAge = Math.max(...Object.values(KIND_MAX_AGE_DAYS));
  const { data, error } = await supabaseAdmin
    .from("engagement_opportunities")
    .select(ITEM_COLUMNS)
    .eq("status", "new")
    .gte("created_at", new Date(now.getTime() - maxAge * DAY_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw new Error(`engagement_opportunities: ${error.message}`);
  return ((data ?? []) as ItemRow[]).map(toItem).filter((i) => isFresh(i, now));
}

async function countSince(column: "done_at" | "skipped_at", since: Date): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("engagement_opportunities")
    .select("id", { count: "exact", head: true })
    .gte(column, since.toISOString());
  if (error) return 0;
  return count ?? 0;
}

// ── Automatyczne „Zrobione" ─────────────────────────────────────────────────

const AUTO_DETECT_KINDS: EngagementKind[] = ["youtube_comment", "forum_reply", "directory_listing"];

/** Id naszego kanału: zapisany przy połączeniu, awaryjnie channels?mine=true (1 jednostka). */
async function ownYoutubeChannelId(): Promise<string | null> {
  try {
    const { getIntegrationRow } = await import("../youtube-shorts.server");
    const row = await getIntegrationRow();
    if (row.channel_id) return row.channel_id;
  } catch {
    // Brak wiersza integracji — próbujemy przez API.
  }
  const yt = await import("../youtube-api.server");
  const ch = await yt.getMyChannel();
  return ch?.id ? String(ch.id) : null;
}

export type AutoDetectResult = {
  checked: { youtube: number; pages: number };
  done: Array<{ id: string; kind: EngagementKind; via: "youtube" | "page" }>;
  errors: string[];
};

/**
 * Sprawdza pozycje 'sent' z ostatnich 14 dni i oznacza zrobione przez
 * applyMarkAction (te same efekty co kliknięcie: backlink, statusy).
 * Każdy błąd (quota, token, strona) jest zapisywany i pomijany.
 */
export async function autoDetectDone(now: Date): Promise<AutoDetectResult> {
  const result: AutoDetectResult = { checked: { youtube: 0, pages: 0 }, done: [], errors: [] };
  const { data, error } = await supabaseAdmin
    .from("engagement_opportunities")
    .select(`${ITEM_COLUMNS}, sent_at`)
    .eq("status", "sent")
    .in("kind", AUTO_DETECT_KINDS)
    .gte("sent_at", new Date(now.getTime() - AUTO_DETECT_MAX_AGE_DAYS * DAY_MS).toISOString())
    .order("sent_at", { ascending: false })
    .limit(300);
  if (error) {
    result.errors.push(`engagement_opportunities: ${error.message}`);
    return result;
  }
  const items: SentItem[] = ((data ?? []) as Array<ItemRow & { sent_at: string | null }>).map(
    (r) => ({ ...toItem(r), sent_at: r.sent_at }),
  );
  const plan = planAutoDetect(items, now);

  const markDone = async (it: SentItem, via: "youtube" | "page") => {
    try {
      const { changed } = await applyMarkAction(it.id, "done", now, { auto: via });
      if (changed) result.done.push({ id: it.id, kind: it.kind, via });
    } catch (e) {
      result.errors.push(`oznaczanie ${it.id}: ${errMsg(e).slice(0, 120)}`);
    }
  };

  if (plan.youtube.length) {
    try {
      const channelId = await ownYoutubeChannelId();
      if (!channelId) throw new Error("nieznany id kanału YouTube");
      const yt = await import("../youtube-api.server");
      for (const it of plan.youtube) {
        try {
          // commentThreads.list = 1 jednostka quota; 100 najnowszych wątków.
          const json = await yt.youtubeRequest("/commentThreads", {
            query: {
              part: "snippet",
              videoId: it.videoId,
              maxResults: 100,
              order: "time",
              textFormat: "plainText",
            },
            timeoutMs: 10_000,
          });
          result.checked.youtube += 1;
          if (hasOwnCommentAfter(json?.items ?? [], channelId, it.sent_at ?? "")) {
            await markDone(it, "youtube");
          }
        } catch (e) {
          const msg = errMsg(e);
          result.errors.push(`YouTube ${it.videoId}: ${msg.slice(0, 120)}`);
          // Wyczerpana quota albo brak tokena — dalsze zapytania też padną.
          if (/quota|401|Brak konfiguracji|nie jest połączony/i.test(msg)) break;
        }
      }
    } catch (e) {
      result.errors.push(`YouTube: ${errMsg(e).slice(0, 160)}`);
    }
  }

  if (plan.pages.length) {
    const { fetchPage, mapWithLimit } = await import("../page-fetch.server");
    const { analyzeOwnLinks } = await import("../backlinks-monitor");
    await mapWithLimit(plan.pages, 5, async (it) => {
      const page = await fetchPage(it.pageUrl, { timeoutMs: 8_000 });
      result.checked.pages += 1;
      if (page.kind !== "ok") return;
      if (analyzeOwnLinks(page.html, page.url).found) await markDone(it, "page");
    });
  }
  return result;
}

async function markUrl(base: string, id: string, action: MarkAction, secret: string, now: Date) {
  const token = await signMarkToken(id, action, secret, now);
  return `${base}/api/public/engagement/mark?t=${encodeURIComponent(token)}`;
}

export async function runEngagementDigestTick(
  opts: { force?: boolean; now?: Date } = {},
): Promise<Record<string, unknown>> {
  if (!digestEnabled(process.env.ENGAGEMENT_DIGEST)) {
    return { ok: true, skipped: "ENGAGEMENT_DIGEST=off" };
  }
  const now = opts.now ?? new Date();

  if (!opts.force) {
    const { data: recent } = await supabaseAdmin
      .from("engagement_opportunities")
      .select("sent_at")
      .gte("sent_at", new Date(now.getTime() - RESEND_GUARD_MS).toISOString())
      .limit(1);
    if (recent?.length) {
      return { ok: true, skipped: "digest z ostatnich 20 h już wysłany", at: recent[0].sent_at };
    }
  }

  // Budżet liczony od początku przebiegu (wykrywanie + autodiscovery + źródła).
  const deadline = Date.now() + COLLECT_BUDGET_MS;

  // 0. Automatyczne „Zrobione" i (w poniedziałki) nowe feedy forów.
  let autoDetect: AutoDetectResult | null = null;
  try {
    autoDetect = await autoDetectDone(now);
  } catch (e) {
    console.warn(`[engagement] auto-detect: ${errMsg(e)}`);
  }
  let feedDiscovery: Record<string, unknown> | null = null;
  try {
    feedDiscovery = await discoverForumFeeds(now);
  } catch (e) {
    feedDiscovery = { ran: true, error: errMsg(e).slice(0, 300) };
  }

  // 1. Źródła — zaległości liczymy raz, każde źródło dorabia tylko brakujące.
  const backlog: CollectorContext["backlog"] = {};
  for (const it of await loadOpenItems(now)) backlog[it.kind] = (backlog[it.kind] ?? 0) + 1;
  const ctx: CollectorContext = { now, backlog, deadline };
  const sources: SourceStatus[] = [];
  for (const [key, collect] of COLLECTORS) {
    try {
      sources.push(await collect(ctx));
    } catch (e) {
      const msg = errMsg(e);
      console.warn(`[engagement] ${key}: ${msg}`);
      sources.push({ key, state: "error", added: 0, note: msg.slice(0, 300) });
    }
  }

  // 2. Wybór pozycji.
  const picked = selectDigestItems(await loadOpenItems(now), { now });
  if (!picked.length)
    return {
      ok: true,
      sent: 0,
      note: "brak nowych akcji — mail pominięty",
      sources,
      auto_detect: autoDetect,
      feed_discovery: feedDiscovery,
    };

  // 3. Mail.
  const secret = markSecret();
  const { baseUrl } = await import("../email-unsubscribe.server");
  const base = baseUrl().replace(/\/+$/, "");
  const cards: DigestCard[] = [];
  for (const it of picked) {
    cards.push({
      ...it,
      doneUrl: secret ? await markUrl(base, it.id, "done", secret, now) : null,
      skipUrl: secret ? await markUrl(base, it.id, "skip", secret, now) : null,
    });
  }
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const [done7, skipped7] = await Promise.all([
    countSince("done_at", weekAgo),
    countSince("skipped_at", weekAgo),
  ]);
  const mail = buildDigestEmail({
    date: now,
    cards,
    stats: { done7, skipped7, autoDetected: autoDetect ? autoDetect.done.length : undefined },
    sources,
  });
  const to = digestRecipient(process.env);

  const { sendResendEmail } = await import("../resend-send.server");
  const sent = await sendResendEmail({
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    noBranding: true,
    // Wewnętrzna lista zadań dla zespołu — nigdy nie podlega wypisowi.
    category: "transactional",
  });
  if (!sent.ok) {
    // Pozycje zostają 'new' — kolejne wywołanie może ponowić wysyłkę.
    return {
      ok: false,
      error: `Wysyłka digestu nieudana: ${sent.error ?? "?"}`,
      to,
      sources,
      auto_detect: autoDetect,
    };
  }

  const { error: upErr } = await supabaseAdmin
    .from("engagement_opportunities")
    .update({ status: "sent", sent_at: now.toISOString() })
    .in(
      "id",
      picked.map((p) => p.id),
    )
    .eq("status", "new");

  return {
    ok: true,
    to,
    sent: picked.length,
    kinds: picked.reduce<Record<string, number>>((acc, p) => {
      acc[p.kind] = (acc[p.kind] ?? 0) + 1;
      return acc;
    }, {}),
    sources,
    auto_detect: autoDetect,
    feed_discovery: feedDiscovery,
    status_update_error: upErr?.message ?? null,
  };
}

// ── Oznaczanie z linku w mailu ──────────────────────────────────────────────

/**
 * „Zrobione" / „Pomiń" dla pozycji. Idempotentne: ponowne kliknięcie nic
 * nie zmienia. „Zrobione" po „Pomiń" jest dozwolone (pomyłka), odwrotnie nie.
 * Efekty uboczne „Zrobione" są best-effort — błąd nie cofa oznaczenia.
 * `auto` — oznaczenie z automatycznego wykrywania (zapisywane w extra).
 */
export async function applyMarkAction(
  id: string,
  action: MarkAction,
  now: Date = new Date(),
  opts: { auto?: "youtube" | "page" } = {},
): Promise<{ changed: boolean }> {
  const at = now.toISOString();
  if (action === "skip") {
    const { data, error } = await supabaseAdmin
      .from("engagement_opportunities")
      .update({ status: "skipped", skipped_at: at })
      .eq("id", id)
      .in("status", ["new", "sent"])
      .select("id");
    if (error) throw new Error(error.message);
    return { changed: !!data?.length };
  }

  const { data, error } = await supabaseAdmin
    .from("engagement_opportunities")
    .update({ status: "done", done_at: at })
    .eq("id", id)
    .in("status", ["new", "sent", "skipped"])
    .select(ITEM_COLUMNS);
  if (error) throw new Error(error.message);
  const row = (data as ItemRow[] | null)?.[0];
  if (!row) return { changed: false };
  const item = toItem(row);

  if (opts.auto) {
    const { error: exErr } = await supabaseAdmin
      .from("engagement_opportunities")
      .update({ extra: { ...item.extra, auto_detected: opts.auto } as Json })
      .eq("id", id);
    if (exErr) console.warn(`[engagement] auto_detected: ${exErr.message}`);
  }

  const backlink = backlinkForDoneItem(item);
  if (backlink) {
    try {
      const { data: dup } = await supabaseAdmin
        .from("ai_backlinks")
        .select("id")
        .eq("source_url", backlink.source_url)
        .eq("target_url", backlink.target_url)
        .limit(1);
      if (!dup?.length) {
        const { error: blErr } = await supabaseAdmin.from("ai_backlinks").insert(backlink);
        if (blErr) console.warn(`[engagement] backlink: ${blErr.message}`);
      }
    } catch (e) {
      console.warn(`[engagement] backlink: ${errMsg(e)}`);
    }
  }

  const extra = item.extra ?? {};
  if (item.kind === "outreach_pitch" && typeof extra.outreach_message_id === "string") {
    try {
      // Tak samo jak „oznacz jako wysłane" w panelu outreach.
      await supabaseAdmin
        .from("ai_outreach_messages")
        .update({ status: "sent", sent_at: at })
        .eq("id", extra.outreach_message_id);
      if (typeof extra.outreach_target_id === "string") {
        await supabaseAdmin
          .from("ai_outreach_targets")
          .update({ status: "contacted" })
          .eq("id", extra.outreach_target_id)
          .in("status", ["new", "queued"]);
      }
    } catch (e) {
      console.warn(`[engagement] outreach: ${errMsg(e)}`);
    }
  }
  if (item.kind === "pr_pitch" && typeof extra.pr_opportunity_id === "string") {
    try {
      await db
        .from("pr_opportunities")
        .update({ status: "sent" })
        .eq("id", extra.pr_opportunity_id)
        .neq("status", "rejected");
    } catch (e) {
      console.warn(`[engagement] PR: ${errMsg(e)}`);
    }
  }
  return { changed: true };
}
