import { describe, expect, it } from "vitest";
import {
  analyzeOwnLinks,
  decideBacklinkStatus,
  decodeHtmlAttr,
  extractAnchors,
  isOwnDomainUrl,
  pageHasNofollowMeta,
  summarizeBacklinks,
  type BacklinkReportRow,
  type BacklinkRowForCheck,
} from "./backlinks-monitor";

const BASE = "https://forum.example.pl/watek/123?page=2";
const NOW = new Date("2026-10-04T04:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("extractAnchors", () => {
  it("adresy względne → bezwzględne, rel małymi literami, encje zdekodowane", () => {
    const html = `
      <a href="/profil/5">profil</a>
      <A HREF='https://financeyou.pl/?utm_source=forum&amp;utm_medium=referral' REL="NoFollow UGC">link</A>
      <a class=x href=https://www.financeyou.pl/r/abc>bez cudzysłowów</a>
      <a name="kotwica">bez href</a>
      <a href="#top">kotwica</a>
      <a href="mailto:kontakt@financeyou.pl">mail</a>
      <a href="javascript:void(0)">js</a>`;
    expect(extractAnchors(html, BASE)).toEqual([
      { href: "https://forum.example.pl/profil/5", rel: [] },
      {
        href: "https://financeyou.pl/?utm_source=forum&utm_medium=referral",
        rel: ["nofollow", "ugc"],
      },
      { href: "https://www.financeyou.pl/r/abc", rel: [] },
    ]);
  });

  it("pomija linki w komentarzach HTML, skryptach i stylach", () => {
    const html = `<!-- <a href="https://financeyou.pl">stary</a> -->
      <script>document.write('<a href="https://financeyou.pl/x">')</script>
      <style>a[href="https://financeyou.pl"]{}</style>
      <p>tekst https://financeyou.pl bez znacznika</p>`;
    expect(extractAnchors(html, BASE)).toEqual([]);
  });

  it("decodeHtmlAttr: encje nazwane i numeryczne", () => {
    expect(decodeHtmlAttr("a&amp;b&#47;c&#x2F;d&quot;&unknown;")).toBe('a&b/c/d"&unknown;');
  });
});

describe("analyzeOwnLinks", () => {
  it("domena i subdomeny financeyou.pl, nie podobne nazwy", () => {
    expect(isOwnDomainUrl("https://financeyou.pl/r/x")).toBe(true);
    expect(isOwnDomainUrl("https://blog.financeyou.pl/")).toBe(true);
    expect(isOwnDomainUrl("https://notfinanceyou.pl/")).toBe(false);
    expect(isOwnDomainUrl("https://financeyou.pl.evil.com/")).toBe(false);
    expect(isOwnDomainUrl("nie-url")).toBe(false);
  });

  it("dofollow, gdy choć jeden link bez nofollow/ugc/sponsored", () => {
    const a = analyzeOwnLinks(
      `<a rel="ugc" href="https://financeyou.pl/a">1</a><a href="https://financeyou.pl/b">2</a>`,
      BASE,
    );
    expect(a).toEqual({
      found: true,
      dofollow: true,
      hrefs: ["https://financeyou.pl/a", "https://financeyou.pl/b"],
    });
  });

  it("same nofollow / sponsored → nofollow; meta robots nofollow wyłącza wszystko", () => {
    expect(
      analyzeOwnLinks(`<a rel="sponsored" href="https://financeyou.pl/">x</a>`, BASE).dofollow,
    ).toBe(false);
    const meta = `<meta name="robots" content="index, nofollow"><a href="https://financeyou.pl/">x</a>`;
    expect(pageHasNofollowMeta(meta)).toBe(true);
    expect(analyzeOwnLinks(meta, BASE)).toMatchObject({ found: true, dofollow: false });
    expect(pageHasNofollowMeta(`<meta name="description" content="nofollow">`)).toBe(false);
  });

  it("brak linku albo strona na naszej domenie → nie znaleziono", () => {
    expect(analyzeOwnLinks(`<a href="https://inny.pl/">x</a>`, BASE).found).toBe(false);
    expect(
      analyzeOwnLinks(`<a href="/kontakt">x</a>`, "https://financeyou.pl/blog/wpis").found,
    ).toBe(false);
  });
});

describe("decideBacklinkStatus", () => {
  const live: BacklinkRowForCheck = { status: "live", dofollow: true, first_seen_at: daysAgo(30) };
  const ok = (html: string) => ({ kind: "ok" as const, status: 200, url: BASE, html });

  it("link jest → live z dofollow wg rel", () => {
    expect(
      decideBacklinkStatus(live, ok(`<a rel="nofollow" href="https://financeyou.pl">x</a>`), NOW),
    ).toEqual({ status: "live", dofollow: false, last_error: null });
    expect(
      decideBacklinkStatus(
        { status: "pending", dofollow: true, first_seen_at: daysAgo(10) },
        ok(`<a href="https://financeyou.pl/r/abc">x</a>`),
        NOW,
      ),
    ).toEqual({ status: "live", dofollow: true, last_error: null });
  });

  it("strona wczytana bez linku albo 404/410 → lost", () => {
    expect(decideBacklinkStatus(live, ok("<p>nic</p>"), NOW)).toEqual({
      status: "lost",
      dofollow: true,
      last_error: null,
    });
    expect(decideBacklinkStatus(live, { kind: "http_error", status: 404 }, NOW)).toEqual({
      status: "lost",
      dofollow: true,
      last_error: "HTTP 404",
    });
  });

  it("świeże 'pending' bez linku (moderacja) zostaje 'pending'", () => {
    const fresh = { status: "pending", dofollow: true, first_seen_at: daysAgo(1) };
    expect(decideBacklinkStatus(fresh, ok("<p>nic</p>"), NOW).status).toBe("pending");
    const old = { ...fresh, first_seen_at: daysAgo(5) };
    expect(decideBacklinkStatus(old, ok("<p>nic</p>"), NOW).status).toBe("lost");
  });

  it("błąd sieci, 5xx, 403, nie-HTML → status bez zmian, tylko błąd", () => {
    expect(
      decideBacklinkStatus(live, { kind: "network_error", message: "Przekroczony czas" }, NOW),
    ).toEqual({ status: "live", dofollow: true, last_error: "Przekroczony czas" });
    expect(decideBacklinkStatus(live, { kind: "http_error", status: 503 }, NOW)).toEqual({
      status: "live",
      dofollow: true,
      last_error: "HTTP 503",
    });
    expect(decideBacklinkStatus(live, { kind: "http_error", status: 403 }, NOW).status).toBe(
      "live",
    );
    const pdf = decideBacklinkStatus(
      { status: "pending", dofollow: false, first_seen_at: daysAgo(20) },
      { kind: "not_html", status: 200, contentType: "application/pdf" },
      NOW,
    );
    expect(pdf.status).toBe("pending");
    expect(pdf.last_error).toContain("application/pdf");
  });
});

describe("summarizeBacklinks", () => {
  const row = (over: Partial<BacklinkReportRow>): BacklinkReportRow => ({
    source_url: "https://a.pl/1",
    source_domain: "a.pl",
    status: "live",
    dofollow: true,
    status_changed_at: daysAgo(30),
    last_checked_at: daysAgo(0),
    last_error: null,
    ...over,
  });

  it("aktywne, dofollow, nowe live i utracone w okresie", () => {
    const since = new Date(NOW.getTime() - 7 * 86_400_000);
    const s = summarizeBacklinks(
      [
        row({}),
        row({
          source_url: "https://b.pl/2",
          source_domain: "b.pl",
          dofollow: false,
          status_changed_at: daysAgo(2),
        }),
        row({
          source_url: "https://c.pl/3",
          source_domain: "c.pl",
          status: "lost",
          status_changed_at: daysAgo(1),
          last_error: "HTTP 404",
        }),
        row({ source_url: "https://d.pl/4", status: "lost", status_changed_at: daysAgo(20) }),
        row({ status: "pending", status_changed_at: daysAgo(1), last_checked_at: null }),
      ],
      since,
      NOW,
    );
    expect(s.live).toBe(2);
    expect(s.liveDofollow).toBe(1);
    expect(s.newlyLive).toEqual([{ url: "https://b.pl/2", domain: "b.pl", dofollow: false }]);
    expect(s.newlyLost).toEqual([
      { url: "https://c.pl/3", domain: "c.pl", dofollow: true, error: "HTTP 404" },
    ]);
    expect(s.lastCheckedAt).toBe(daysAgo(0));
  });

  it("pusta tabela", () => {
    expect(summarizeBacklinks([], NOW)).toEqual({
      live: 0,
      liveDofollow: 0,
      newlyLive: [],
      newlyLost: [],
      lastCheckedAt: null,
    });
  });
});
