// Poranny mail z listą akcji zaangażowania — czysta część: HTML (proste
// tabele i style inline, działa w Gmailu) + wersja tekstowa, oraz mała
// strona po kliknięciu „Zrobione" / „Pomiń". Dane zbiera digest.server.ts.

import { escapeHtml } from "../social-auto-reply";
import {
  ENGAGEMENT_KINDS,
  KIND_LABELS,
  estimateMinutes,
  type EngagementItem,
  type EngagementKind,
} from "./core";

export type DigestCard = EngagementItem & {
  /** Podpisane linki oznaczania (null = brak sekretu, linków nie ma). */
  doneUrl: string | null;
  skipUrl: string | null;
};

export type SourceKey = "youtube" | "instagram" | "forum" | "pr" | "outreach" | "directory";

export type SourceStatus = {
  key: SourceKey;
  /** ok — przebieg się udał; unavailable — źródło niedostępne (np. brak uprawnień); error — awaria; skipped — dziś nie było potrzeby. */
  state: "ok" | "unavailable" | "error" | "skipped";
  added: number;
  note?: string;
};

export type DigestEmailData = {
  date: Date;
  cards: DigestCard[];
  stats: { done7: number; skipped7: number };
  sources: SourceStatus[];
};

export const SOURCE_LABELS: Record<SourceKey, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  forum: "Fora / Google Alerts",
  pr: "Digital PR",
  outreach: "Outreach",
  directory: "Katalogi firm",
};

/** Krótka instrukcja „co zrobić" per rodzaj. */
const HOW_TO: Record<EngagementKind, string> = {
  youtube_comment:
    "Otwórz film, przewiń do komentarzy, wklej tekst i opublikuj (najlepiej po obejrzeniu fragmentu — komentarz ma pasować do treści).",
  instagram_comment: "Otwórz post, wklej komentarz i opublikuj.",
  forum_reply:
    "Zaloguj się na forum, otwórz wątek i odpowiedz tekstem poniżej (popraw, jeśli wątek poszedł w inną stronę).",
  pr_pitch: "Przejrzyj tekst, uzupełnij ewentualne [DO UZUPEŁNIENIA] i wyślij ze swojej skrzynki.",
  outreach_pitch: "Przejrzyj tekst i wyślij ze swojej skrzynki.",
  directory_listing: "Załóż albo uzupełnij wizytówkę i wklej dane poniżej.",
};

const SNIPPET_MAX = 280;

function shorten(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Tekst z zachowaniem nowych linii (Gmail nie zawsze honoruje pre-wrap). */
function multiline(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, "<br>");
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Warsaw",
  });
}

function cardHtml(c: DigestCard, n: number): string {
  const subject = typeof c.extra?.subject === "string" ? c.extra.subject : "";
  const instructions = typeof c.extra?.instructions === "string" ? c.extra.instructions : "";
  const isMail = c.url.startsWith("mailto:");
  const where = [c.source, c.title].filter(Boolean).join(" · ");
  const parts = [
    `<div style="font-size:12px;color:#64748b;margin:0 0 4px">#${n} · ${escapeHtml(KIND_LABELS[c.kind])}</div>`,
    `<div style="font-size:16px;font-weight:bold;color:#0f172a;margin:0 0 6px">${escapeHtml(shorten(where || c.url, 200))}</div>`,
    c.snippet
      ? `<div style="font-size:13px;color:#475569;margin:0 0 8px">„${escapeHtml(shorten(c.snippet, SNIPPET_MAX))}”</div>`
      : "",
    `<div style="font-size:13px;color:#334155;margin:0 0 8px">${escapeHtml(HOW_TO[c.kind])}</div>`,
    instructions
      ? `<div style="font-size:13px;color:#92400e;background:#fffbeb;border-radius:6px;padding:8px 10px;margin:0 0 8px">${escapeHtml(instructions)}</div>`
      : "",
    subject
      ? `<div style="font-size:13px;color:#0f172a;margin:0 0 6px"><strong>Temat:</strong> ${escapeHtml(subject)}</div>`
      : "",
    c.suggested_text
      ? `<div style="font-size:12px;color:#64748b;margin:8px 0 4px">Tekst do skopiowania:</div>
<div style="border:2px solid #0f766e;border-radius:8px;padding:12px 14px;background:#f8fafc;font-size:14px;line-height:1.55;color:#0f172a">${multiline(c.suggested_text)}</div>`
      : "",
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 10px"><tr><td style="border-radius:8px;background:#0f766e">
<a href="${escapeHtml(c.url)}" style="display:inline-block;padding:12px 26px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">${isMail ? "Otwórz gotowy mail →" : "Otwórz →"}</a>
</td></tr></table>`,
    c.doneUrl || c.skipUrl
      ? `<div style="font-size:13px;color:#64748b">${[
          c.doneUrl
            ? `<a href="${escapeHtml(c.doneUrl)}" style="color:#15803d;text-decoration:none">✅ Zrobione</a>`
            : "",
          c.skipUrl
            ? `<a href="${escapeHtml(c.skipUrl)}" style="color:#64748b;text-decoration:none">⏭ Pomiń</a>`
            : "",
        ]
          .filter(Boolean)
          .join(" &nbsp;·&nbsp; ")}</div>`
      : "",
  ];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;margin:0 0 16px;background:#ffffff">
<tr><td style="padding:16px 18px">
${parts.filter(Boolean).join("\n")}
</td></tr></table>`;
}

function cardText(c: DigestCard, n: number): string {
  const subject = typeof c.extra?.subject === "string" ? c.extra.subject : "";
  const instructions = typeof c.extra?.instructions === "string" ? c.extra.instructions : "";
  return [
    `#${n} ${KIND_LABELS[c.kind]} — ${[c.source, c.title].filter(Boolean).join(" · ")}`,
    c.snippet ? `„${shorten(c.snippet, SNIPPET_MAX)}”` : "",
    HOW_TO[c.kind],
    instructions,
    subject ? `Temat: ${subject}` : "",
    c.suggested_text ? `--- tekst do skopiowania ---\n${c.suggested_text}\n---` : "",
    `Otwórz: ${c.url}`,
    c.doneUrl ? `Zrobione: ${c.doneUrl}` : "",
    c.skipUrl ? `Pomiń: ${c.skipUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 1 akcja, 2–4 akcje, 5–21 akcji, 22–24 akcje… */
export function actionsWord(n: number): string {
  if (n === 1) return "akcja";
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? "akcje" : "akcji";
}

function sourceLine(s: SourceStatus): string {
  const label = SOURCE_LABELS[s.key];
  if (s.state === "ok") return `${label}: ${s.added} nowych`;
  if (s.state === "skipped") return `${label}: ${s.note ?? "dziś bez nowych"}`;
  if (s.state === "unavailable") return `${label}: niedostępne — ${s.note ?? ""}`.trim();
  return `${label}: błąd — ${shorten(s.note ?? "", 160)}`;
}

/** Mail digestu. Pusta lista kart = nie wysyłamy (decyduje digest.server.ts). */
export function buildDigestEmail(data: DigestEmailData): {
  subject: string;
  text: string;
  html: string;
} {
  const minutes = estimateMinutes(data.cards);
  const count = data.cards.length;
  const subject = `Na dziś: ${count} ${actionsWord(count)} (~${minutes} min) — zaangażowanie i linki`;
  const intro =
    "Każda akcja to: Otwórz → skopiuj tekst → wklej → kliknij „Zrobione”. " +
    "Nic nie zostało opublikowane automatycznie — publikujesz Ty.";

  const htmlGroups: string[] = [];
  const textGroups: string[] = [];
  let n = 0;
  for (const kind of ENGAGEMENT_KINDS) {
    const cards = data.cards.filter((c) => c.kind === kind);
    if (!cards.length) continue;
    htmlGroups.push(
      `<h2 style="font-size:15px;color:#0f766e;margin:24px 0 10px;text-transform:uppercase;letter-spacing:.03em">${escapeHtml(KIND_LABELS[kind])} (${cards.length})</h2>`,
    );
    textGroups.push(`== ${KIND_LABELS[kind]} (${cards.length}) ==`);
    for (const c of cards) {
      n += 1;
      htmlGroups.push(cardHtml(c, n));
      textGroups.push(`${cardText(c, n)}\n`);
    }
  }

  const sourcesHtml = data.sources.length
    ? `<p style="font-size:12px;color:#64748b;margin:16px 0 4px"><strong>Źródła dziś:</strong><br>${data.sources
        .map((s) => escapeHtml(sourceLine(s)))
        .join("<br>")}</p>`
    : "";
  const statsLine = `Ostatnie 7 dni: zrobione ${data.stats.done7}, pominięte ${data.stats.skipped7}.`;

  const html = `<div style="background:#f1f5f9;padding:20px 0">
<div style="max-width:640px;margin:0 auto;padding:0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#0f172a">
<h1 style="font-size:20px;margin:0 0 4px">Dzień dobry! ${count} ${actionsWord(count)} na dziś</h1>
<p style="margin:0 0 6px;color:#475569">${escapeHtml(dateLabel(data.date))} · szacowany czas <strong>~${minutes} min</strong></p>
<p style="margin:0 0 8px;color:#475569;font-size:13px">${escapeHtml(intro)}</p>
${htmlGroups.join("\n")}
<hr style="border:none;border-top:1px solid #cbd5e1;margin:20px 0 10px">
<p style="font-size:13px;color:#334155;margin:0">${escapeHtml(statsLine)}</p>
${sourcesHtml}
<p style="font-size:11px;color:#94a3b8;margin:10px 0 0">Rejestr: tabela engagement_opportunities, feedy RSS: engagement_feeds. Wyłącznik: ENGAGEMENT_DIGEST=off. Linki „Zrobione” / „Pomiń” ważne 14 dni.</p>
</div></div>`;

  const text = [
    `Dzień dobry! ${count} ${actionsWord(count)} na dziś (~${minutes} min) — ${dateLabel(data.date)}`,
    intro,
    "",
    ...textGroups,
    statsLine,
    ...(data.sources.length ? ["", "Źródła dziś:", ...data.sources.map(sourceLine)] : []),
  ].join("\n");

  return { subject, text, html };
}

/** Strona po kliknięciu w link z maila — bez żadnych danych pozycji. */
export function renderMarkPage(
  state: "confirm" | "done" | "skip" | "invalid" | "error",
  token?: string,
): string {
  const title =
    state === "done"
      ? "Zapisane ✓"
      : state === "skip"
        ? "Pominięte ✓"
        : state === "confirm"
          ? "Zapisywanie…"
          : state === "error"
            ? "Nie udało się zapisać"
            : "Link nieważny";
  const body =
    state === "confirm"
      ? // Skanery linków w poczcie robią GET bez JavaScriptu — dopiero
        // przeglądarka człowieka wysyła formularz (POST) i zapisuje akcję.
        `<form method="post"><input type="hidden" name="t" value="${escapeHtml(token ?? "")}">
<noscript><button type="submit" style="font-size:16px;padding:10px 20px">Potwierdź</button></noscript></form>
<script>document.forms[0].submit();</script>`
      : state === "invalid"
        ? "<p>Ten link wygasł albo jest niepoprawny.</p>"
        : state === "error"
          ? "<p>Spróbuj ponownie za chwilę — kliknij link w mailu jeszcze raz.</p>"
          : "<p>Dziękujemy — możesz zamknąć tę kartę.</p>";
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;text-align:center;padding:48px 16px;color:#0f172a;background:#f8fafc">
<h1 style="font-size:24px">${escapeHtml(title)}</h1>
${body}
</body></html>`;
}
