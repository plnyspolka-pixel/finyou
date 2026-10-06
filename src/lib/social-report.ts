// Tygodniowy raport social media — czysta część: wnioski liczone
// deterministycznie (bez AI) i treść maila (HTML + tekst). Dane zbiera
// social-weekly-report.server.ts. Każda sekcja może przyjść jako „brak
// danych" — awaria jednej platformy nie wywraca całego raportu.

import type { BacklinkStats } from "./backlinks-monitor";
import {
  SOCIAL_PLATFORM_LABELS,
  escapeHtml,
  type ReplyAction,
  type SocialPlatform,
} from "./social-auto-reply";

export type Section<T> = { ok: true; data: T } | { ok: false; error: string };

export type FollowerStat = {
  platform: SocialPlatform;
  /** null = odczyt się nie udał. */
  followers: number | null;
  /** Pomiar sprzed ~tygodnia (null = brak bazy do porównania). */
  previous: number | null;
  error?: string;
};

export type PublishedItem = {
  /** Platforma kolejki (youtube, facebook_post, facebook_reels, instagram_reels, tiktok, x). */
  platform: string;
  title: string;
  publishedAt: string;
  url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
};

export type CampaignClicks = { name: string; source: string | null; clicks: number };

export type ClickStats = {
  total: number;
  previousTotal: number | null;
  campaigns: CampaignClicks[];
};

export type EscalatedComment = {
  platform: SocialPlatform;
  authorName: string | null;
  text: string;
  reason: string | null;
  permalink: string | null;
  createdAt: string;
};

export type ReplyStats = {
  counts: Partial<Record<ReplyAction, number>>;
  escalated: EscalatedComment[];
};

export type WeeklyReportData = {
  periodStart: string;
  periodEnd: string;
  followers: FollowerStat[];
  published: Section<PublishedItem[]>;
  clicks: Section<ClickStats>;
  replies: Section<ReplyStats>;
  /** Monitoring backlinków (ai_backlinks, sprawdzane w niedziele). */
  backlinks: Section<BacklinkStats>;
};

const PUBLISH_PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube Short",
  facebook_post: "Post FB",
  facebook_reels: "Reels FB",
  instagram_reels: "Reels IG",
  tiktok: "TikTok",
  x: "X",
};

const ACTION_LABELS: Record<ReplyAction, string> = {
  replied: "odpowiedziano",
  dry_run: "propozycje (tryb testowy)",
  escalated: "przekazano zespołowi",
  skipped: "pominięto (spam / nie na temat)",
  failed: "błąd publikacji",
};

export function followerDelta(s: FollowerStat): number | null {
  return s.followers != null && s.previous != null ? s.followers - s.previous : null;
}

/** Zaangażowanie materiału: reakcje + komentarze (null, gdy nic nie wiadomo). */
export function engagement(item: PublishedItem): number | null {
  if (item.likes == null && item.comments == null) return null;
  return (item.likes ?? 0) + (item.comments ?? 0);
}

/** Najlepsze materiały: po zaangażowaniu, remis — po wyświetleniach. */
export function topItems(items: PublishedItem[], n = 5): PublishedItem[] {
  return items
    .filter((i) => engagement(i) != null || i.views != null)
    .sort(
      (a, b) => (engagement(b) ?? -1) - (engagement(a) ?? -1) || (b.views ?? -1) - (a.views ?? -1),
    )
    .slice(0, n);
}

/** Materiał bez żadnego zasięgu: 0 wyświetleń albo (bez danych o wyświetleniach) 0 reakcji. */
export function isZeroReach(item: PublishedItem): boolean {
  if (item.views != null) return item.views === 0;
  const e = engagement(item);
  return e != null && e === 0;
}

const fmt = (n: number) => n.toLocaleString("pl-PL");
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));

/** Kilka wniosków prostym językiem — wyliczonych, nie generowanych. */
export function computeTakeaways(data: WeeklyReportData): string[] {
  const out: string[] = [];

  if (data.published.ok) {
    const items = data.published.data;
    if (!items.length) {
      out.push("W tym tygodniu nic nie zostało opublikowane — profile stoją w miejscu.");
    } else {
      const best = topItems(items, 1)[0];
      const e = best ? engagement(best) : null;
      if (best && (e ?? 0) + (best.views ?? 0) > 0) {
        const parts = [
          e != null ? `${fmt(e)} reakcji i komentarzy` : null,
          best.views != null ? `${fmt(best.views)} wyświetleń` : null,
        ].filter(Boolean);
        out.push(
          `Najlepszy materiał tygodnia: „${best.title.slice(0, 80)}” ` +
            `(${PUBLISH_PLATFORM_LABELS[best.platform] ?? best.platform}) — ${parts.join(", ")}.`,
        );
      }
      const zero = items.filter(isZeroReach);
      if (zero.length) {
        out.push(
          `Uwaga: ${zero.length} z ${items.length} publikacji bez żadnego zasięgu ` +
            `(0 wyświetleń / reakcji): ${zero
              .slice(0, 3)
              .map((z) => `„${z.title.slice(0, 50)}”`)
              .join(
                ", ",
              )}${zero.length > 3 ? "…" : ""}. Sprawdź, czy materiał faktycznie jest widoczny.`,
        );
      }
    }
  }

  const withDelta = data.followers
    .map((s) => ({ s, d: followerDelta(s) }))
    .filter((x): x is { s: FollowerStat; d: number } => x.d != null);
  if (!withDelta.length) {
    if (data.followers.some((s) => s.followers != null)) {
      out.push(
        "Pierwszy pomiar obserwujących — zmiany tydzień do tygodnia pojawią się w kolejnym raporcie.",
      );
    }
  } else {
    const best = withDelta.reduce((a, b) => (b.d > a.d ? b : a));
    if (best.d > 0) {
      out.push(
        `Najszybciej rośnie ${SOCIAL_PLATFORM_LABELS[best.s.platform]}: ${signed(best.d)} obserwujących w tydzień.`,
      );
    } else {
      out.push("Żadna platforma nie zyskała obserwujących w tym tygodniu.");
    }
    for (const x of withDelta) {
      if (x.d < 0) {
        out.push(`${SOCIAL_PLATFORM_LABELS[x.s.platform]} traci obserwujących (${signed(x.d)}).`);
      }
    }
  }

  if (data.clicks.ok) {
    const { total, previousTotal } = data.clicks.data;
    const publishedCount = data.published.ok ? data.published.data.length : 0;
    if (total === 0 && publishedCount > 0) {
      out.push(
        "Zero kliknięć w linki śledzące z social media mimo publikacji — sprawdź CTA i automatyczne komentarze z linkiem.",
      );
    } else if (previousTotal != null && total !== previousTotal) {
      out.push(
        `Kliknięcia w linki z social media: ${fmt(total)} (tydzień wcześniej ${fmt(previousTotal)}).`,
      );
    }
  }

  if (data.backlinks.ok) {
    const b = data.backlinks.data;
    if (b.newlyLost.length) {
      out.push(
        `Utracone backlinki w tym tygodniu: ${b.newlyLost.length} (${b.newlyLost
          .slice(0, 3)
          .map((l) => l.domain)
          .join(", ")}${b.newlyLost.length > 3 ? "…" : ""}) — sprawdź, czy da się je odzyskać.`,
      );
    }
    if (b.newlyLive.length) {
      out.push(
        `Nowe aktywne backlinki: ${b.newlyLive.length} (łącznie aktywnych: ${fmt(b.live)}).`,
      );
    }
  }

  if (data.replies.ok) {
    const esc = data.replies.data.counts.escalated ?? 0;
    if (esc > 0) {
      out.push(`${esc} komentarzy czekało na decyzję człowieka — lista poniżej.`);
    }
  }
  return out;
}

// ── Mail ────────────────────────────────────────────────────────────────────

const NO_DATA = "brak danych";
const TD = 'style="padding:6px 10px;border-bottom:1px solid #e2e8f0"';
const TH = 'style="padding:6px 10px;border-bottom:2px solid #cbd5e1;text-align:left"';

const dateLabel = (iso: string) => iso.slice(0, 10);
const numOr = (n: number | null) => (n == null ? "—" : fmt(n));

function sectionError(error: string): string {
  return `<p style="color:#b45309">${NO_DATA} <span style="color:#94a3b8;font-size:12px">(${escapeHtml(error.slice(0, 200))})</span></p>`;
}

export function buildWeeklyReportEmail(
  data: WeeklyReportData,
  takeaways: string[],
): { subject: string; text: string; html: string } {
  const period = `${dateLabel(data.periodStart)} – ${dateLabel(data.periodEnd)}`;
  const subject = `Raport social media: ${period}`;
  const text: string[] = [`Raport social media Finance You (${period})`, ""];
  const html: string[] = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;max-width:720px">`,
    `<h2 style="margin:0 0 4px">Raport social media</h2>`,
    `<p style="margin:0 0 16px;color:#64748b">${escapeHtml(period)}</p>`,
  ];

  // Wnioski
  html.push(`<h3 style="margin:18px 0 6px">Najważniejsze</h3>`);
  text.push("NAJWAŻNIEJSZE");
  if (takeaways.length) {
    html.push(`<ul>${takeaways.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`);
    for (const t of takeaways) text.push(`• ${t}`);
  } else {
    html.push(`<p>Bez szczególnych sygnałów w tym tygodniu.</p>`);
    text.push("Bez szczególnych sygnałów w tym tygodniu.");
  }
  text.push("");

  // Obserwujący
  html.push(`<h3 style="margin:18px 0 6px">Obserwujący</h3>`);
  html.push(
    `<table style="border-collapse:collapse"><tr><th ${TH}>Platforma</th><th ${TH}>Teraz</th><th ${TH}>Zmiana (tydzień)</th></tr>`,
  );
  text.push("OBSERWUJĄCY");
  for (const s of data.followers) {
    const label = SOCIAL_PLATFORM_LABELS[s.platform];
    const d = followerDelta(s);
    const now = s.followers == null ? NO_DATA : fmt(s.followers);
    const delta = s.followers == null ? "—" : d == null ? "pierwszy pomiar" : signed(d);
    html.push(
      `<tr><td ${TD}>${escapeHtml(label)}</td><td ${TD}>${escapeHtml(now)}</td><td ${TD}>${escapeHtml(delta)}</td></tr>`,
    );
    text.push(`• ${label}: ${now} (${delta})`);
  }
  html.push(`</table>`);
  text.push("");

  // Publikacje
  html.push(`<h3 style="margin:18px 0 6px">Publikacje z ostatnich 7 dni</h3>`);
  text.push("PUBLIKACJE (7 DNI)");
  if (!data.published.ok) {
    html.push(sectionError(data.published.error));
    text.push(NO_DATA);
  } else if (!data.published.data.length) {
    html.push(`<p>Brak publikacji.</p>`);
    text.push("Brak publikacji.");
  } else {
    const items = data.published.data;
    const perPlatform = new Map<string, number>();
    for (const i of items) perPlatform.set(i.platform, (perPlatform.get(i.platform) ?? 0) + 1);
    const summary = [...perPlatform]
      .map(([p, n]) => `${PUBLISH_PLATFORM_LABELS[p] ?? p}: ${n}`)
      .join(", ");
    html.push(`<p>Razem ${items.length} (${escapeHtml(summary)}).</p>`);
    text.push(`Razem ${items.length} (${summary}).`);

    const top = topItems(items);
    if (top.length) {
      html.push(`<p style="margin:10px 0 4px"><strong>Najlepsze materiały</strong></p>`);
      html.push(
        `<table style="border-collapse:collapse"><tr><th ${TH}>Materiał</th><th ${TH}>Wyświetlenia</th><th ${TH}>Reakcje</th><th ${TH}>Komentarze</th></tr>`,
      );
      text.push("Najlepsze materiały:");
      for (const i of top) {
        const label = `${PUBLISH_PLATFORM_LABELS[i.platform] ?? i.platform} · ${i.title.slice(0, 70) || "(bez tytułu)"}`;
        const cell = i.url
          ? `<a href="${escapeHtml(i.url)}">${escapeHtml(label)}</a>`
          : escapeHtml(label);
        html.push(
          `<tr><td ${TD}>${cell}</td><td ${TD}>${numOr(i.views)}</td><td ${TD}>${numOr(i.likes)}</td><td ${TD}>${numOr(i.comments)}</td></tr>`,
        );
        text.push(
          `• ${label} — wyśw. ${numOr(i.views)}, reakcje ${numOr(i.likes)}, kom. ${numOr(i.comments)}${i.url ? ` ${i.url}` : ""}`,
        );
      }
      html.push(`</table>`);
    }
  }
  text.push("");

  // Kliknięcia
  html.push(`<h3 style="margin:18px 0 6px">Kliknięcia w linki śledzące (utm_medium=social)</h3>`);
  text.push("KLIKNIĘCIA (utm_medium=social)");
  if (!data.clicks.ok) {
    html.push(sectionError(data.clicks.error));
    text.push(NO_DATA);
  } else {
    const c = data.clicks.data;
    const prev = c.previousTotal == null ? "" : ` (tydzień wcześniej: ${fmt(c.previousTotal)})`;
    html.push(`<p>Razem: <strong>${fmt(c.total)}</strong>${escapeHtml(prev)}</p>`);
    text.push(`Razem: ${fmt(c.total)}${prev}`);
    const withClicks = c.campaigns.filter((k) => k.clicks > 0).sort((a, b) => b.clicks - a.clicks);
    if (withClicks.length) {
      html.push(`<ul>`);
      for (const k of withClicks.slice(0, 10)) {
        html.push(
          `<li>${escapeHtml(k.name)}${k.source ? ` <span style="color:#64748b">(${escapeHtml(k.source)})</span>` : ""}: ${fmt(k.clicks)}</li>`,
        );
        text.push(`• ${k.name}${k.source ? ` (${k.source})` : ""}: ${fmt(k.clicks)}`);
      }
      html.push(`</ul>`);
    }
  }
  text.push("");

  // Autoodpowiedzi
  html.push(`<h3 style="margin:18px 0 6px">Automatyczne odpowiedzi na komentarze</h3>`);
  text.push("AUTOMATYCZNE ODPOWIEDZI");
  if (!data.replies.ok) {
    html.push(sectionError(data.replies.error));
    text.push(NO_DATA);
  } else {
    const r = data.replies.data;
    const rows = (Object.keys(ACTION_LABELS) as ReplyAction[])
      .filter((a) => (r.counts[a] ?? 0) > 0)
      .map((a) => `${ACTION_LABELS[a]}: ${fmt(r.counts[a] ?? 0)}`);
    const line = rows.length ? rows.join(" · ") : "Brak nowych komentarzy do obsługi.";
    html.push(`<p>${escapeHtml(line)}</p>`);
    text.push(line);
    if (r.escalated.length) {
      html.push(`<p style="margin:10px 0 4px"><strong>Przekazane zespołowi</strong></p><ul>`);
      text.push("Przekazane zespołowi:");
      for (const e of r.escalated) {
        const who = `${SOCIAL_PLATFORM_LABELS[e.platform]} — ${e.authorName ?? "nieznany autor"}`;
        html.push(
          `<li style="margin-bottom:8px">${escapeHtml(who)}: „${escapeHtml(e.text.slice(0, 300))}”` +
            `<br><span style="color:#64748b;font-size:12px">${escapeHtml(e.reason ?? "")}</span>` +
            (e.permalink ? ` <a href="${escapeHtml(e.permalink)}">otwórz →</a>` : "") +
            `</li>`,
        );
        text.push(`• ${who}: „${e.text.slice(0, 300)}”${e.permalink ? ` ${e.permalink}` : ""}`);
      }
      html.push(`</ul>`);
    }
  }

  // Backlinki
  html.push(`<h3 style="margin:18px 0 6px">Backlinki</h3>`);
  text.push("");
  text.push("BACKLINKI");
  if (!data.backlinks.ok) {
    html.push(sectionError(data.backlinks.error));
    text.push(NO_DATA);
  } else {
    const b = data.backlinks.data;
    const checked = b.lastCheckedAt
      ? `ostatnie sprawdzenie: ${dateLabel(b.lastCheckedAt)}`
      : "monitoring jeszcze nie sprawdzał stron";
    const summary = `Aktywne (live): ${fmt(b.live)}, w tym dofollow: ${fmt(b.liveDofollow)} · nowe w tym tygodniu: ${fmt(b.newlyLive.length)} · utracone: ${fmt(b.newlyLost.length)} (${checked}).`;
    html.push(`<p>${escapeHtml(summary)}</p>`);
    text.push(summary);
    const list = (
      title: string,
      links: Array<{ url: string; dofollow: boolean; error?: string | null }>,
    ) => {
      if (!links.length) return;
      html.push(`<p style="margin:10px 0 4px"><strong>${escapeHtml(title)}</strong></p><ul>`);
      text.push(`${title}:`);
      for (const l of links.slice(0, 20)) {
        const note = [l.dofollow ? "dofollow" : "nofollow", l.error ?? ""]
          .filter(Boolean)
          .join(" · ");
        html.push(
          `<li><a href="${escapeHtml(l.url)}">${escapeHtml(l.url.slice(0, 120))}</a> <span style="color:#64748b;font-size:12px">(${escapeHtml(note)})</span></li>`,
        );
        text.push(`• ${l.url} (${note})`);
      }
      if (links.length > 20) {
        html.push(`<li>… i ${links.length - 20} więcej</li>`);
        text.push(`… i ${links.length - 20} więcej`);
      }
      html.push(`</ul>`);
    };
    list("Nowe aktywne", b.newlyLive);
    list("Utracone", b.newlyLost);
  }

  html.push(
    `<p style="color:#94a3b8;font-size:12px;margin-top:24px">Raport generowany automatycznie w poniedziałki. Dane: API Meta i YouTube, kolejki publikacji, kampanie śledzące, rejestr social_comment_replies, monitoring backlinków (ai_backlinks, niedziele).</p></div>`,
  );
  return { subject, text: text.join("\n"), html: html.join("\n") };
}
