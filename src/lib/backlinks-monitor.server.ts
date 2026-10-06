// Tygodniowy monitoring backlinków (ai_backlinks). Hook:
// /api/public/hooks/backlinks-check-tick (pg_cron w niedziele 04:00 UTC,
// migracja 20261006170000). Dla najwyżej 50 wierszy 'live' / 'pending'
// (najdawniej sprawdzane najpierw) pobiera stronę źródłową i szuka
// <a href> do financeyou.pl:
//   * jest → 'live' (+ dofollow wg rel nofollow / ugc / sponsored),
//   * strona wczytana bez linku (albo 404/410) → 'lost',
//   * błąd sieci / 5xx / blokada → status bez zmian, tylko last_error.
// Zawsze aktualizujemy last_checked_at; status_changed_at ustawia trigger
// w bazie przy każdej zmianie statusu (z panelu, MCP i stąd) — na tym
// opiera się sekcja „Backlinki" w tygodniowym raporcie social media.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BACKLINKS_PER_RUN,
  CHECKED_STATUSES,
  decideBacklinkStatus,
  type BacklinkRowForCheck,
} from "./backlinks-monitor";
import { fetchPage, mapWithLimit } from "./page-fetch.server";

/** pg_net czeka 120 s — po tym czasie nie zaczynamy kolejnych stron. */
const RUN_BUDGET_MS = 95_000;
const CONCURRENCY = 5;
const PAGE_TIMEOUT_MS = 10_000;

type Row = BacklinkRowForCheck & { id: string; source_url: string };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function runBacklinksCheckTick(
  opts: { now?: Date; limit?: number } = {},
): Promise<Record<string, unknown>> {
  const now = opts.now ?? new Date();
  const deadline = Date.now() + RUN_BUDGET_MS;
  const { data, error } = await supabaseAdmin
    .from("ai_backlinks")
    .select("id, source_url, status, dofollow, first_seen_at")
    .in("status", [...CHECKED_STATUSES])
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(Math.min(opts.limit ?? BACKLINKS_PER_RUN, BACKLINKS_PER_RUN));
  if (error) return { ok: false, error: `ai_backlinks: ${error.message}` };
  const rows = (data ?? []) as Row[];

  const counts = { checked: 0, live: 0, lost: 0, pending: 0, unchanged_error: 0, skipped: 0 };
  const changes: Array<{ id: string; url: string; from: string; to: string }> = [];
  const errors: string[] = [];

  await mapWithLimit(rows, CONCURRENCY, async (row) => {
    if (Date.now() > deadline) {
      counts.skipped += 1;
      return;
    }
    try {
      const outcome = /^https?:\/\//i.test(row.source_url)
        ? await fetchPage(row.source_url, { timeoutMs: PAGE_TIMEOUT_MS })
        : ({ kind: "network_error", message: "Nieprawidłowy adres źródła" } as const);
      const d = decideBacklinkStatus(row, outcome, now);
      const { error: upErr } = await supabaseAdmin
        .from("ai_backlinks")
        .update({
          status: d.status,
          dofollow: d.dofollow,
          last_error: d.last_error,
          last_checked_at: now.toISOString(),
        })
        .eq("id", row.id);
      if (upErr) throw new Error(upErr.message);
      counts.checked += 1;
      if (d.last_error && d.status === row.status) counts.unchanged_error += 1;
      if (d.status === "live") counts.live += 1;
      else if (d.status === "lost") counts.lost += 1;
      else if (d.status === "pending") counts.pending += 1;
      if (d.status !== row.status) {
        changes.push({ id: row.id, url: row.source_url, from: row.status, to: d.status });
      }
    } catch (e) {
      errors.push(`${row.source_url}: ${errMsg(e).slice(0, 200)}`);
    }
  });

  return { ok: true, total: rows.length, ...counts, changes, errors };
}
