import { describe, expect, it } from "vitest";
import { dedupeKeyFor, rotatingPick } from "./core";
import {
  hasOwnCommentAfter,
  pageToCheck,
  planAutoDetect,
  youtubeVideoId,
  AUTO_DETECT_MAX_PAGES,
  AUTO_DETECT_MAX_VIDEOS,
  type SentItem,
} from "./auto-detect";
import { FEED_DISCOVERY_PAGES, extractFeedLinks, isFeedDiscoveryDay } from "./feed-discovery";
import {
  WEB_SEARCH_QUERIES,
  WEB_SEARCH_QUERIES_PER_DAY,
  buildWebSearchUrl,
  parseWebSearchItems,
  webSearchConfig,
  webSearchErrorMessage,
} from "./web-search";

const NOW = new Date("2026-10-06T05:30:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("wyszukiwarka (Custom Search)", () => {
  it("bez klucza albo cx — źródło niedostępne", () => {
    expect(webSearchConfig({})).toBeNull();
    expect(webSearchConfig({ GOOGLE_CSE_KEY: "k" })).toBeNull();
    expect(webSearchConfig({ GOOGLE_CSE_KEY: " k ", GOOGLE_CSE_CX: "c" })).toEqual({
      key: "k",
      cx: "c",
    });
  });

  it("adres zapytania: 7 dni, polski, 10 wyników", () => {
    const u = new URL(buildWebSearchUrl({ key: "K", cx: "C" }, 'kredyt "bez BIK" site:wykop.pl'));
    expect(u.origin + u.pathname).toBe("https://www.googleapis.com/customsearch/v1");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      key: "K",
      cx: "C",
      q: 'kredyt "bez BIK" site:wykop.pl',
      dateRestrict: "d7",
      lr: "lang_pl",
      gl: "pl",
      num: "10",
    });
  });

  it("najwyżej 4 zapytania dziennie (darmowe 100/dzień), cała lista w rotacji", () => {
    expect(WEB_SEARCH_QUERIES_PER_DAY).toBeLessThanOrEqual(4);
    const seen = new Set<string>();
    for (let d = 0; d < 10; d++) {
      const picked = rotatingPick(WEB_SEARCH_QUERIES, WEB_SEARCH_QUERIES_PER_DAY, d);
      expect(picked).toHaveLength(WEB_SEARCH_QUERIES_PER_DAY);
      for (const q of picked) seen.add(q);
    }
    expect(seen.size).toBe(WEB_SEARCH_QUERIES.length);
  });

  it("wyniki → wątki: bez własnej domeny, duplikatów i nie-http; data z metatagów", () => {
    const hits = parseWebSearchItems({
      items: [
        {
          link: "https://www.wykop.pl/wpis/1/kredyt-bez-bik",
          title: "Kredyt  bez BIK?",
          snippet: "Czy ktoś\nbrał…",
          displayLink: "www.wykop.pl",
          pagemap: { metatags: [{ "article:published_time": "2026-10-04T10:00:00+02:00" }] },
        },
        { link: "https://www.wykop.pl/wpis/1/kredyt-bez-bik", title: "duplikat" },
        { link: "https://financeyou.pl/blog/x", title: "nasz wpis" },
        { link: "ftp://x.pl/a", title: "ftp" },
        { link: "https://forum.muratordom.pl/t/2", title: "" },
        { link: "https://agrofoto.pl/forum/t/3", title: "Finansowanie ziemi" },
      ],
    });
    expect(hits).toEqual([
      {
        url: "https://www.wykop.pl/wpis/1/kredyt-bez-bik",
        title: "Kredyt bez BIK?",
        snippet: "Czy ktoś brał…",
        source: "wykop.pl",
        publishedAt: "2026-10-04T08:00:00.000Z",
      },
      {
        url: "https://agrofoto.pl/forum/t/3",
        title: "Finansowanie ziemi",
        snippet: "",
        source: "agrofoto.pl",
        publishedAt: null,
      },
    ]);
    expect(parseWebSearchItems({})).toEqual([]);
    expect(parseWebSearchItems(null)).toEqual([]);
  });

  it("wątek z wyszukiwarki i z RSS ma ten sam klucz (jedna okazja)", () => {
    expect(dedupeKeyFor("forum_reply", "https://www.wykop.pl/wpis/1/?utm_source=x")).toBe(
      dedupeKeyFor("forum_reply", "https://wykop.pl/wpis/1"),
    );
  });

  it("komunikat błędu API bez klucza", () => {
    expect(
      webSearchErrorMessage(429, {
        error: { message: "Quota exceeded", errors: [{ reason: "rateLimitExceeded" }] },
      }),
    ).toBe("Custom Search 429 (rateLimitExceeded): Quota exceeded");
    expect(webSearchErrorMessage(500, null)).toBe("Custom Search 500");
  });
});

describe("autodiscovery feedów RSS", () => {
  it("<link rel=alternate> RSS i Atom, adresy względne, bez feedów komentarzy", () => {
    const html = `<html><head>
      <link rel="stylesheet" href="/style.css">
      <link rel="alternate" type="application/rss+xml" title="Forum &raquo; Kanał" href="/feed/">
      <link rel="alternate" type="application/rss+xml" title="Forum &raquo; Kanał z komentarzami" href="/comments/feed/">
      <LINK REL="Alternate" TYPE="application/atom+xml; charset=utf-8" HREF="atom.xml">
      <link rel="alternate" type="text/html" hreflang="en" href="/en/">
      <link rel="alternate" type="application/rss+xml" href="https://cdn.example.com/rss.xml">
      <link rel="alternate" type="application/rss+xml" href="/feed/">
      <!-- <link rel="alternate" type="application/rss+xml" href="/stary.xml"> -->
    </head></html>`;
    expect(extractFeedLinks(html, "https://forum.example.pl/dzial/kredyty/")).toEqual([
      { url: "https://forum.example.pl/feed/", title: "Forum » Kanał" },
      { url: "https://forum.example.pl/dzial/kredyty/atom.xml", title: null },
      { url: "https://cdn.example.com/rss.xml", title: null },
    ]);
  });

  it("strona bez feedów → pusta lista", () => {
    expect(extractFeedLinks("<html><head><title>x</title></head></html>", "https://a.pl/")).toEqual(
      [],
    );
  });

  it("najwyżej raz w tygodniu (poniedziałek UTC), lista stron to adresy https", () => {
    expect(isFeedDiscoveryDay(new Date("2026-10-05T05:30:00Z"))).toBe(true); // poniedziałek
    expect(isFeedDiscoveryDay(new Date("2026-10-06T05:30:00Z"))).toBe(false);
    for (const p of FEED_DISCOVERY_PAGES) expect(p).toMatch(/^https:\/\//);
  });
});

describe("automatyczne „Zrobione”", () => {
  const sent = (over: Partial<SentItem>): SentItem => ({
    id: "id",
    kind: "forum_reply",
    url: "https://forum.example.pl/t/1",
    title: "Wątek",
    extra: {},
    suggested_text: "Warto sprawdzić https://financeyou.pl/r/abc12",
    sent_at: daysAgo(1),
    ...over,
  });

  it("id filmu z różnych adresów YouTube", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://m.youtube.com/shorts/abcDEF12345")).toBe("abcDEF12345");
    expect(youtubeVideoId("https://www.youtube.com/channel/UC123")).toBeNull();
    expect(youtubeVideoId("https://vimeo.com/123")).toBeNull();
    expect(youtubeVideoId("nie-url")).toBeNull();
  });

  it("forum tylko ze szkicem z linkiem; katalog tylko ze znaną wizytówką; mailto nigdy", () => {
    expect(pageToCheck(sent({}))).toBe("https://forum.example.pl/t/1");
    expect(pageToCheck(sent({ extra: { page_url: "https://forum.example.pl/t/1?p=2" } }))).toBe(
      "https://forum.example.pl/t/1?p=2",
    );
    expect(pageToCheck(sent({ suggested_text: "Odpowiedź bez linku." }))).toBeNull();
    expect(
      pageToCheck(sent({ kind: "directory_listing", url: "https://panoramafirm.pl" })),
    ).toBeNull();
    expect(
      pageToCheck(
        sent({
          kind: "directory_listing",
          extra: { profile_url: "https://panoramafirm.pl/finance-you" },
        }),
      ),
    ).toBe("https://panoramafirm.pl/finance-you");
    expect(pageToCheck(sent({ kind: "pr_pitch", url: "mailto:a@b.pl" }))).toBeNull();
    expect(pageToCheck(sent({ kind: "outreach_pitch", url: "mailto:a@b.pl" }))).toBeNull();
  });

  it("plan: tylko wysłane w 14 dni, najświeższe najpierw, limity quota i stron", () => {
    const items: SentItem[] = [
      sent({ id: "stare", sent_at: daysAgo(15) }),
      sent({ id: "bez-daty", sent_at: null }),
      sent({ id: "f-starszy", sent_at: daysAgo(3) }),
      sent({ id: "f-nowy", sent_at: daysAgo(1) }),
      sent({
        id: "yt",
        kind: "youtube_comment",
        url: "https://www.youtube.com/watch?v=abcdefghijk",
        sent_at: daysAgo(2),
      }),
      sent({
        id: "yt-dup",
        kind: "youtube_comment",
        url: "https://youtu.be/abcdefghijk",
        sent_at: daysAgo(4),
      }),
      sent({ id: "ig", kind: "instagram_comment", sent_at: daysAgo(1) }),
    ];
    const plan = planAutoDetect(items, NOW);
    expect(plan.pages.map((p) => p.id)).toEqual(["f-nowy", "f-starszy"]);
    expect(plan.youtube.map((p) => [p.id, p.videoId])).toEqual([["yt", "abcdefghijk"]]);

    const many = Array.from({ length: 50 }, (_, i) =>
      sent({
        id: `v${i}`,
        kind: "youtube_comment",
        url: `https://www.youtube.com/watch?v=video${String(i).padStart(6, "0")}`,
      }),
    );
    const pages = Array.from({ length: 30 }, (_, i) =>
      sent({ id: `p${i}`, url: `https://f.pl/${i}` }),
    );
    const capped = planAutoDetect([...many, ...pages], NOW);
    expect(capped.youtube).toHaveLength(AUTO_DETECT_MAX_VIDEOS);
    expect(capped.pages).toHaveLength(AUTO_DETECT_MAX_PAGES);
  });

  it("komentarz najwyższego poziomu od naszego kanału po wysłaniu digestu", () => {
    const thread = (channel: string, at: string) => ({
      snippet: {
        topLevelComment: { snippet: { authorChannelId: { value: channel }, publishedAt: at } },
      },
    });
    const sentAt = daysAgo(2);
    expect(hasOwnCommentAfter([thread("UCobcy", daysAgo(1))], "UCnasz", sentAt)).toBe(false);
    expect(hasOwnCommentAfter([thread("UCnasz", daysAgo(3))], "UCnasz", sentAt)).toBe(false);
    expect(
      hasOwnCommentAfter(
        [thread("UCobcy", daysAgo(1)), thread("UCnasz", daysAgo(1))],
        "UCnasz",
        sentAt,
      ),
    ).toBe(true);
    expect(hasOwnCommentAfter([{}, null], "UCnasz", sentAt)).toBe(false);
    expect(hasOwnCommentAfter([thread("UCnasz", daysAgo(1))], "", sentAt)).toBe(false);
  });
});
