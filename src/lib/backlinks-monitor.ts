// Monitoring backlinków — czysta część (bez sieci i bazy): wyciąganie
// linków <a href> z HTML, sprawdzenie, czy strona linkuje do financeyou.pl
// (dofollow / nofollow), decyzja o statusie wiersza ai_backlinks po
// sprawdzeniu i podsumowanie do tygodniowego raportu. Część serwerowa:
// backlinks-monitor.server.ts (tick), pobieranie stron: page-fetch.server.ts.
//
// Te same funkcje wykrywają też „Zrobione" dla odpowiedzi na forach
// w digeście zaangażowania (engagement/auto-detect.ts).

export const OWN_DOMAIN = "financeyou.pl";

/** Wartości rel, które odbierają linkowi moc SEO. */
const NOFOLLOW_RELS = new Set(["nofollow", "ugc", "sponsored"]);

/** Statusy sprawdzane co tydzień (lost i rejected — już nie). */
export const CHECKED_STATUSES = ["live", "pending"] as const;
/** Najwyżej tyle stron na przebieg (pg_net czeka 120 s). */
export const BACKLINKS_PER_RUN = 50;
/**
 * Świeży wpis 'pending' (np. odpowiedź na forum czeka na moderację) bez
 * linku na stronie zostaje 'pending' przez tyle dni — dopiero potem 'lost'.
 */
export const PENDING_GRACE_DAYS = 3;

const DAY_MS = 86_400_000;

export type Anchor = { href: string; rel: string[] };

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  raquo: "»",
  laquo: "«",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

/** Encje w wartości atrybutu (&amp;, &quot;, &#47;, &#x2F;…). */
export function decodeHtmlAttr(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Komentarze, skrypty, style i <template> — tam „linki" nie są linkami. */
function stripNonContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ");
}

/** Atrybuty jednego znacznika (nazwy małymi literami, wartości po dekodowaniu encji). */
export function parseAttributes(tagInner: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tagInner))) {
    const name = m[1].toLowerCase();
    if (name in out) continue;
    out[name] = decodeHtmlAttr(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

/** Adres względny → bezwzględny (tylko http/https; reszta = null). */
export function resolveUrl(href: string, baseUrl: string): string | null {
  const h = href.trim();
  if (!h || h.startsWith("#")) return null;
  try {
    const u = new URL(h, baseUrl);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Wszystkie linki <a href> strony (adresy bezwzględne, rel małymi literami). */
export function extractAnchors(html: string, baseUrl: string): Anchor[] {
  const out: Anchor[] = [];
  const re = /<a\b([^>]*)>/gi;
  const clean = stripNonContent(html);
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const attrs = parseAttributes(m[1]);
    if (attrs.href == null) continue;
    const href = resolveUrl(attrs.href, baseUrl);
    if (!href) continue;
    const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    out.push({ href, rel });
  }
  return out;
}

/** Host to financeyou.pl albo jego subdomena (www., blog. …). */
export function isOwnDomainUrl(url: string, domain: string = OWN_DOMAIN): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

/** <meta name="robots|googlebot" content="…nofollow…"> — wszystkie linki strony są nofollow. */
export function pageHasNofollowMeta(html: string): boolean {
  const re = /<meta\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  const clean = stripNonContent(html);
  while ((m = re.exec(clean))) {
    const attrs = parseAttributes(m[1]);
    const name = (attrs.name ?? "").toLowerCase();
    if (name !== "robots" && name !== "googlebot") continue;
    if (/\b(nofollow|none)\b/i.test(attrs.content ?? "")) return true;
  }
  return false;
}

export function isDofollowAnchor(a: Anchor): boolean {
  return !a.rel.some((r) => NOFOLLOW_RELS.has(r));
}

export type OwnLinkAnalysis = {
  /** Czy strona ma choć jeden link <a href> do naszej domeny. */
  found: boolean;
  /** Czy choć jeden z tych linków przekazuje moc (bez nofollow/ugc/sponsored i bez meta robots nofollow). */
  dofollow: boolean;
  /** Znalezione adresy (bez duplikatów, najwyżej 10). */
  hrefs: string[];
};

/**
 * Linki strony do financeyou.pl (także śledzące /r/…). Strona z naszej
 * własnej domeny nie jest backlinkiem — zawsze „nie znaleziono".
 */
export function analyzeOwnLinks(
  html: string,
  baseUrl: string,
  domain: string = OWN_DOMAIN,
): OwnLinkAnalysis {
  if (isOwnDomainUrl(baseUrl, domain)) return { found: false, dofollow: false, hrefs: [] };
  const own = extractAnchors(html, baseUrl).filter((a) => isOwnDomainUrl(a.href, domain));
  if (!own.length) return { found: false, dofollow: false, hrefs: [] };
  const metaNofollow = pageHasNofollowMeta(html);
  return {
    found: true,
    dofollow: !metaNofollow && own.some(isDofollowAnchor),
    hrefs: [...new Set(own.map((a) => a.href))].slice(0, 10),
  };
}

// ── Decyzja o statusie ──────────────────────────────────────────────────────

/** Wynik pobrania strony (page-fetch.server.ts). */
export type PageFetchOutcome =
  | { kind: "ok"; status: number; url: string; html: string }
  /** Strona odpowiedziała, ale nie HTML-em (PDF, obraz) — nie da się sprawdzić. */
  | { kind: "not_html"; status: number; contentType: string }
  | { kind: "http_error"; status: number }
  | { kind: "network_error"; message: string };

export type BacklinkRowForCheck = {
  status: string;
  dofollow: boolean;
  first_seen_at: string | null;
};

export type BacklinkCheckDecision = {
  status: string;
  dofollow: boolean;
  /** null = sprawdzenie się udało. */
  last_error: string | null;
};

/** Strona usunięta — link na pewno już nie istnieje. */
const GONE_STATUSES = new Set([404, 410]);

function lostOrPending(
  row: BacklinkRowForCheck,
  now: Date,
  last_error: string | null,
): BacklinkCheckDecision {
  if (row.status === "pending" && row.first_seen_at) {
    const age = now.getTime() - new Date(row.first_seen_at).getTime();
    if (Number.isFinite(age) && age < PENDING_GRACE_DAYS * DAY_MS) {
      return { status: "pending", dofollow: row.dofollow, last_error };
    }
  }
  return { status: "lost", dofollow: row.dofollow, last_error };
}

/**
 * Nowy stan wiersza po sprawdzeniu strony:
 *   * strona się wczytała i ma link → 'live' (+ dofollow z rel / meta robots),
 *   * strona się wczytała bez linku albo zwróciła 404/410 → 'lost'
 *     (świeże 'pending' — jeszcze 'pending', patrz PENDING_GRACE_DAYS),
 *   * błąd sieci, 5xx, 403/429 (blokada botów), nie-HTML → status bez zmian,
 *     zapisujemy tylko błąd — jednorazowa awaria nie „gubi" linku.
 */
export function decideBacklinkStatus(
  row: BacklinkRowForCheck,
  outcome: PageFetchOutcome,
  now: Date,
  domain: string = OWN_DOMAIN,
): BacklinkCheckDecision {
  switch (outcome.kind) {
    case "ok": {
      const a = analyzeOwnLinks(outcome.html, outcome.url, domain);
      if (a.found) return { status: "live", dofollow: a.dofollow, last_error: null };
      return lostOrPending(row, now, null);
    }
    case "http_error":
      if (GONE_STATUSES.has(outcome.status)) {
        return lostOrPending(row, now, `HTTP ${outcome.status}`);
      }
      return { status: row.status, dofollow: row.dofollow, last_error: `HTTP ${outcome.status}` };
    case "not_html":
      return {
        status: row.status,
        dofollow: row.dofollow,
        last_error: `Nie HTML (${outcome.contentType || "brak typu"}) — sprawdź ręcznie`,
      };
    case "network_error":
      return {
        status: row.status,
        dofollow: row.dofollow,
        last_error: outcome.message.slice(0, 300) || "błąd sieci",
      };
  }
}

// ── Podsumowanie do raportu ─────────────────────────────────────────────────

export type BacklinkReportRow = {
  source_url: string;
  source_domain: string;
  status: string;
  dofollow: boolean;
  status_changed_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
};

export type BacklinkLinkInfo = { url: string; domain: string; dofollow: boolean };

export type BacklinkStats = {
  /** Wszystkie 'live' teraz. */
  live: number;
  /** W tym dofollow. */
  liveDofollow: number;
  /** 'live' ze zmianą statusu w okresie (nowe albo odzyskane). */
  newlyLive: BacklinkLinkInfo[];
  /** 'lost' ze zmianą statusu w okresie. */
  newlyLost: Array<BacklinkLinkInfo & { error: string | null }>;
  /** Ostatnie sprawdzenie (null = monitoring jeszcze nie działał). */
  lastCheckedAt: string | null;
};

/** Liczby i listy do sekcji „Backlinki" — „nowe" = status_changed_at w [since, until]. */
export function summarizeBacklinks(
  rows: BacklinkReportRow[],
  since: Date,
  until: Date = new Date(8.64e15),
): BacklinkStats {
  const inPeriod = (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= since.getTime() && t <= until.getTime();
  };
  const live = rows.filter((r) => r.status === "live");
  let lastCheckedAt: string | null = null;
  for (const r of rows) {
    if (r.last_checked_at && (!lastCheckedAt || r.last_checked_at > lastCheckedAt)) {
      lastCheckedAt = r.last_checked_at;
    }
  }
  const info = (r: BacklinkReportRow): BacklinkLinkInfo => ({
    url: r.source_url,
    domain: r.source_domain,
    dofollow: r.dofollow,
  });
  return {
    live: live.length,
    liveDofollow: live.filter((r) => r.dofollow).length,
    newlyLive: live.filter((r) => inPeriod(r.status_changed_at)).map(info),
    newlyLost: rows
      .filter((r) => r.status === "lost" && inPeriod(r.status_changed_at))
      .map((r) => ({ ...info(r), error: r.last_error })),
    lastCheckedAt,
  };
}
