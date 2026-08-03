import { describe, it, expect } from "vitest";
import { dedupeKey, matchedPhrases, parseRssItems } from "./core";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Google News</title>
<item>
  <title><![CDATA[Pożyczka pod zastaw mieszkania — na co uważać?]]></title>
  <link>https://www.przyklad.pl/artykul/pozyczka-pod-zastaw?utm_source=rss&amp;id=7</link>
  <pubDate>Mon, 03 Aug 2026 08:00:00 GMT</pubDate>
  <source url="https://przyklad.pl">Przykład.pl</source>
  <description><![CDATA[<b>Rynek nieruchomości</b> rośnie, a wraz z nim pożyczki prywatne.]]></description>
</item>
<item>
  <title>Bez linku — do odrzucenia</title>
</item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
  <title>Rynek nieruchomości w Q3</title>
  <link href="https://serwis.pl/rynek-q3/" />
  <updated>2026-08-01T10:00:00Z</updated>
  <summary>Podsumowanie kwartału.</summary>
</entry>
</feed>`;

describe("parseRssItems", () => {
  it("parsuje RSS 2.0 z CDATA, encjami i źródłem", () => {
    const items = parseRssItems(RSS, "fallback");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Pożyczka pod zastaw mieszkania — na co uważać?");
    expect(items[0].url).toContain("https://www.przyklad.pl/artykul/pozyczka-pod-zastaw");
    expect(items[0].source).toBe("Przykład.pl");
    expect(items[0].publishedAt).toBe("2026-08-03T08:00:00.000Z");
    expect(items[0].snippet).toContain("Rynek nieruchomości rośnie");
  });

  it("parsuje Atom z link href", () => {
    const items = parseRssItems(ATOM, "serwis.pl");
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://serwis.pl/rynek-q3/");
    expect(items[0].source).toBe("serwis.pl");
  });

  it("odrzuca wpisy bez tytułu lub URL", () => {
    expect(parseRssItems("<item><title>x</title></item>", "s")).toHaveLength(0);
  });
});

describe("matchedPhrases", () => {
  it("dopasowuje frazy niezależnie od wielkości liter, w tytule i snippecie", () => {
    const item = parseRssItems(RSS, "f")[0];
    const phrases = matchedPhrases(item);
    expect(phrases).toContain("pożyczka pod zastaw");
    expect(phrases).toContain("pożyczki prywatne");
    expect(phrases).toContain("rynek nieruchomości");
  });

  it("zwraca pustą listę gdy brak dopasowania", () => {
    expect(matchedPhrases({ title: "Pogoda na jutro", snippet: "" })).toEqual([]);
  });
});

describe("dedupeKey", () => {
  it("ignoruje schemat, www, utm i końcowy ukośnik", () => {
    const a = dedupeKey("https://www.przyklad.pl/artykul/x?utm_source=rss");
    const b = dedupeKey("http://przyklad.pl/artykul/x/");
    expect(a).toBe(b);
  });

  it("zachowuje istotne parametry zapytania", () => {
    expect(dedupeKey("https://p.pl/a?id=1")).not.toBe(dedupeKey("https://p.pl/a?id=2"));
  });

  it("różne adresy dają różne klucze", () => {
    expect(dedupeKey("https://p.pl/a")).not.toBe(dedupeKey("https://p.pl/b"));
  });
});
