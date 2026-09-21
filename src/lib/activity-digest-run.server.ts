/**
 * Uruchomienie digestu „co nowego": okno od końca poprzedniego biegu do teraz,
 * zebranie aktywności (`activity-digest.server.ts`), wysyłka push + e-mail do
 * zespołu TYLKO gdy coś się wydarzyło, zapis biegu w `activity_digest_runs`
 * (stąd bierze się początek kolejnego okna).
 *
 * Wołane przez `/api/public/hooks/activity-digest-tick` (pg_cron co 30 min).
 *
 * Konfiguracja (zmienne środowiska, wszystkie opcjonalne):
 *   ACTIVITY_DIGEST_CHANNELS     — "push,email" (domyślnie oba); "off" wyłącza wysyłkę
 *   ACTIVITY_DIGEST_EMAILS       — lista adresów rozdzielona przecinkami; bez niej
 *                                  mail idzie do wszystkich administratorów (profiles.email)
 *   ACTIVITY_DIGEST_QUIET_HOURS  — cisza nocna "22-7" (Europe/Warsaw, domyślnie);
 *                                  "off" = brak ciszy. W ciszy bieg jest pomijany,
 *                                  a okno kumuluje się do pierwszego biegu po ciszy.
 */
import {
  collectActivitySince,
  renderActivityDigestText,
  summarizeActivity,
  type ActivityDb,
  type ActivityUpdates,
} from "./activity-digest.server";
import type { OperatorPushInput, OperatorPushResult } from "./operator-push.server";

export const DEFAULT_WINDOW_MINUTES = 30;
/** Po dłuższej przerwie (awaria, cisza nocna) nie cofamy się dalej niż tyle. */
export const MAX_CATCHUP_HOURS = 24;
const RUNS_TABLE = "activity_digest_runs";

export type DigestDeps = {
  db: ActivityDb;
  now: () => Date;
  env: Record<string, string | undefined>;
  sendPush: (input: OperatorPushInput) => Promise<OperatorPushResult>;
  sendEmail: (opts: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** Adresy administratorów, gdy ACTIVITY_DIGEST_EMAILS nie jest ustawione. */
  adminEmails: () => Promise<string[]>;
  baseUrl: () => string;
};

export type DigestRunResult = {
  ok: boolean;
  skipped?: "quiet_hours" | "nothing_new" | "disabled";
  since?: string;
  until?: string;
  total?: number;
  summary?: string;
  capped?: boolean;
  push?: OperatorPushResult | null;
  email?: { sent: number; failed: number; recipients: string[] } | null;
  errors?: string[];
  error?: string;
};

/** Godzina (0–23) w strefie Europe/Warsaw. */
export function warsawHour(d: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return Number.parseInt(h, 10);
}

/**
 * Czy `d` wpada w ciszę nocną `spec` w formacie "HH-HH" (np. "22-7" = od 22:00
 * do 6:59). "off" / pusty / nieparsowalny = brak ciszy.
 */
export function isQuietHour(d: Date, spec: string | undefined): boolean {
  const raw = (spec ?? "22-7").trim().toLowerCase();
  if (!raw || raw === "off" || raw === "none" || raw === "0") return false;
  const m = raw.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!m) return false;
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (from > 23 || to > 23 || from === to) return false;
  const h = warsawHour(d);
  return from < to ? h >= from && h < to : h >= from || h < to;
}

function channels(env: Record<string, string | undefined>): Set<"push" | "email"> {
  const raw = (env.ACTIVITY_DIGEST_CHANNELS ?? "push,email").toLowerCase();
  if (raw.trim() === "off" || raw.trim() === "none") return new Set();
  const set = new Set<"push" | "email">();
  for (const part of raw.split(",")) {
    const v = part.trim();
    if (v === "push" || v === "email") set.add(v);
  }
  return set;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Tekst raportu → prosty HTML (linki „→ https://…" stają się klikalne). */
export function digestTextToHtml(text: string): string {
  const lines = text.split("\n").map((line) => {
    const esc = escapeHtml(line);
    const linked = esc.replace(
      /→ (https?:\/\/[^\s]+)/g,
      (_m, url: string) => `→ <a href="${url}" style="color:#0f4c81">${url}</a>`,
    );
    return linked.trim() === "" ? "<br/>" : `<div>${linked}</div>`;
  });
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;white-space:pre-wrap">${lines.join(
    "",
  )}</div>`;
}

/** Krótka treść pusha: do trzech najświeższych pozycji. */
export function pushBody(u: ActivityUpdates): string {
  const items: Array<{ at: string; text: string }> = [];
  for (const l of u.leads) items.push({ at: l.created_at, text: `Lead: ${l.who}` });
  for (const a of u.applications)
    items.push({
      at: a.created_at,
      text: `Wniosek${a.loan_amount ? ` ${new Intl.NumberFormat("pl-PL").format(a.loan_amount)} zł` : ""}`,
    });
  for (const m of u.inbound_messages)
    items.push({ at: m.created_at, text: `Wiadomość od ${m.who}: ${m.snippet.slice(0, 60)}` });
  for (const o of u.investor_offers)
    items.push({
      at: o.created_at,
      text: `Oferta inwestora${o.proposed_amount ? ` ${new Intl.NumberFormat("pl-PL").format(o.proposed_amount)} zł` : ""}`,
    });
  for (const r of u.institution_replies)
    items.push({
      at: r.created_at,
      text: `Instytucja ${r.from_email ?? ""}: ${r.snippet.slice(0, 60)}`,
    });
  for (const p of u.payments)
    items.push({
      at: p.processed_at ?? u.until,
      text: `Płatność ${p.audience} ${p.buyer_email ?? ""}`,
    });
  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const top = items.slice(0, 3).map((i) => i.text.replace(/\s+/g, " ").trim());
  if (items.length > 3) top.push(`… i ${items.length - 3} więcej`);
  return top.join("\n").slice(0, 400);
}

async function lastRunUntil(db: ActivityDb): Promise<string | null> {
  const { data, error } = await db
    .from(RUNS_TABLE)
    .select("until")
    .order("until", { ascending: false })
    .limit(1);
  if (error) throw new Error(`${RUNS_TABLE}: ${error.message}`);
  const row = (data ?? [])[0] as { until?: string } | undefined;
  return row?.until ?? null;
}

async function recordRun(
  db: ActivityDb,
  row: {
    since: string;
    until: string;
    total: number;
    counts: ActivityUpdates["counts"];
    summary: string;
    push_sent: number;
    email_sent: number;
    error: string | null;
  },
): Promise<void> {
  const { error } = await db.from(RUNS_TABLE).insert(row);
  if (error) throw new Error(`${RUNS_TABLE} insert: ${error.message}`);
}

/**
 * Jeden bieg digestu. `force` omija ciszę nocną (tylko z prywatnym sekretem
 * crona — pilnuje tego endpoint).
 */
export async function runActivityDigest(
  opts: { force?: boolean } = {},
  deps?: Partial<DigestDeps>,
): Promise<DigestRunResult> {
  const d = await resolveDeps(deps);
  const now = d.now();

  if (!opts.force && isQuietHour(now, d.env.ACTIVITY_DIGEST_QUIET_HOURS)) {
    return { ok: true, skipped: "quiet_hours" };
  }

  const untilIso = now.toISOString();
  const previous = await lastRunUntil(d.db);
  let since = previous
    ? new Date(previous)
    : new Date(now.getTime() - DEFAULT_WINDOW_MINUTES * 60_000);
  let capped = false;
  const floor = new Date(now.getTime() - MAX_CATCHUP_HOURS * 3_600_000);
  if (since < floor) {
    since = floor;
    capped = true;
  }
  if (since >= now) {
    // Zegar cofnięty albo dwa ticki w tej samej sekundzie — nic do zrobienia.
    return { ok: true, skipped: "nothing_new", since: since.toISOString(), until: untilIso };
  }

  const updates = await collectActivitySince({ since, until: now }, d.db);
  const summary = summarizeActivity(updates);
  const base: DigestRunResult = {
    ok: true,
    since: updates.since,
    until: updates.until,
    total: updates.total,
    summary,
    capped,
    errors: updates.errors,
  };

  if (updates.total === 0) {
    await recordRun(d.db, {
      since: updates.since,
      until: updates.until,
      total: 0,
      counts: updates.counts,
      summary,
      push_sent: 0,
      email_sent: 0,
      error: updates.errors.length ? updates.errors.join("; ") : null,
    });
    return { ...base, skipped: "nothing_new" };
  }

  const wanted = channels(d.env);
  const text = renderActivityDigestText(updates, d.baseUrl());
  const subject = `Co nowego na Finance You: ${summary}`;
  const sendErrors: string[] = [];

  let push: OperatorPushResult | null = null;
  if (wanted.has("push")) {
    try {
      push = await d.sendPush({
        event: "digest:activity",
        title: `Co nowego: ${summary}`,
        body: pushBody(updates),
        url: "/admin",
        tag: "activity-digest",
        roles: ["operator", "administrator"],
      });
    } catch (e) {
      sendErrors.push(`push: ${(e as Error).message}`);
    }
  }

  let email: DigestRunResult["email"] = null;
  if (wanted.has("email")) {
    const configured = (d.env.ACTIVITY_DIGEST_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes("@"));
    let recipients = configured;
    if (recipients.length === 0) {
      try {
        recipients = await d.adminEmails();
      } catch (e) {
        sendErrors.push(`adresaci: ${(e as Error).message}`);
      }
    }
    recipients = [...new Set(recipients)];
    const html = digestTextToHtml(text);
    let sent = 0;
    let failed = 0;
    for (const to of recipients) {
      try {
        const r = await d.sendEmail({ to, subject, text, html });
        if (r.ok) sent += 1;
        else {
          failed += 1;
          sendErrors.push(`email ${to}: ${r.error ?? "błąd wysyłki"}`);
        }
      } catch (e) {
        failed += 1;
        sendErrors.push(`email ${to}: ${(e as Error).message}`);
      }
    }
    email = { sent, failed, recipients };
  }

  if (wanted.size === 0) base.skipped = "disabled";

  const allErrors = [...updates.errors, ...sendErrors];
  await recordRun(d.db, {
    since: updates.since,
    until: updates.until,
    total: updates.total,
    counts: updates.counts,
    summary,
    push_sent: push?.sent ?? 0,
    email_sent: email?.sent ?? 0,
    error: allErrors.length ? allErrors.join("; ") : null,
  });

  return { ...base, push, email, errors: allErrors };
}

async function resolveDeps(partial?: Partial<DigestDeps>): Promise<DigestDeps> {
  const db = partial?.db ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  return {
    db,
    now: partial?.now ?? (() => new Date()),
    env: partial?.env ?? process.env,
    sendPush:
      partial?.sendPush ??
      (async (input) => (await import("./operator-push.server")).sendOperatorPush(input)),
    sendEmail:
      partial?.sendEmail ??
      (async (o) => {
        const { sendResendEmail } = await import("./resend-send.server");
        return sendResendEmail({
          to: o.to,
          subject: o.subject,
          text: o.text,
          html: o.html,
          fromName: "Finance You — panel",
          category: "transactional",
          showReplyHint: false,
        });
      }),
    adminEmails:
      partial?.adminEmails ??
      (async () => {
        const { data: roles, error } = await db
          .from("user_roles")
          .select("user_id")
          .eq("role", "administrator");
        if (error) throw new Error(`user_roles: ${error.message}`);
        const ids = [...new Set(((roles ?? []) as { user_id: string }[]).map((r) => r.user_id))];
        if (ids.length === 0) return [];
        const { data: profiles, error: pErr } = await db
          .from("profiles")
          .select("email")
          .in("user_id", ids);
        if (pErr) throw new Error(`profiles: ${pErr.message}`);
        return ((profiles ?? []) as { email: string | null }[])
          .map((p) => (p.email ?? "").trim().toLowerCase())
          .filter((e) => e.includes("@"));
      }),
    baseUrl:
      partial?.baseUrl ??
      (() => process.env.PUBLIC_BASE_URL || process.env.SITE_URL || "https://financeyou.pl"),
  };
}
