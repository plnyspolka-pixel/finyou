import { describe, expect, it } from "vitest";
import { findBannedClaims } from "../publication-guardrails";
import {
  DIGEST_LIMITS,
  DIGEST_MAX_ITEMS,
  DIRECTORIES,
  DIRECTORY_DESCRIPTION,
  YOUTUBE_KEYWORDS,
  backlinkForDoneItem,
  buildDirectoryItem,
  buildDirectoryListingText,
  buildMailto,
  buildOutreachItem,
  buildPrItem,
  dayIndex,
  dedupeKeyFor,
  digestEnabled,
  digestRecipient,
  estimateMinutes,
  feedKeywords,
  filterYoutubeVideos,
  finalizeDraft,
  findOwnLink,
  isMetaPermissionError,
  isRecentThread,
  matchesKeywords,
  nextDirectory,
  parseDraft,
  rotatingPick,
  selectDigestItems,
  vetDraft,
  type EngagementKind,
  type YoutubeVideoInfo,
} from "./core";

const NOW = new Date("2026-10-06T05:30:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("klucze deduplikacji", () => {
  it("rodzaj + id, fora po znormalizowanym URL", () => {
    expect(dedupeKeyFor("youtube_comment", "abc123")).toBe("youtube:abc123");
    expect(dedupeKeyFor("instagram_comment", "1789")).toBe("instagram:1789");
    expect(dedupeKeyFor("pr_pitch", "u-1")).toBe("pr:u-1");
    expect(dedupeKeyFor("outreach_pitch", "t-1")).toBe("outreach:t-1");
    expect(dedupeKeyFor("directory_listing", "pkt")).toBe("directory:pkt");
    // Ten sam wątek z parametrami śledzącymi, innym schematem i www = ten sam klucz.
    expect(dedupeKeyFor("forum_reply", "https://www.forum.pl/watek/1?utm_source=x")).toBe(
      dedupeKeyFor("forum_reply", "http://forum.pl/watek/1/"),
    );
    expect(dedupeKeyFor("forum_reply", "https://forum.pl/watek/1")).not.toBe(
      dedupeKeyFor("forum_reply", "https://forum.pl/watek/2"),
    );
  });
});

describe("rotacja zapytań", () => {
  it("kolejne dni biorą kolejne porcje, z zawinięciem", () => {
    const list = ["a", "b", "c", "d", "e"];
    expect(rotatingPick(list, 2, 0)).toEqual(["a", "b"]);
    expect(rotatingPick(list, 2, 1)).toEqual(["c", "d"]);
    expect(rotatingPick(list, 2, 2)).toEqual(["e", "a"]);
    expect(rotatingPick(list, 9, 3)).toHaveLength(5);
    expect(rotatingPick([], 2, 1)).toEqual([]);
  });

  it("YouTube: dokładnie 2 różne zapytania dziennie, cała lista w 3 dni", () => {
    const seen = new Set<string>();
    for (let d = 0; d < 3; d++) {
      const q = rotatingPick(YOUTUBE_KEYWORDS, 2, dayIndex(NOW) + d);
      expect(new Set(q).size).toBe(2);
      q.forEach((x) => seen.add(x));
    }
    expect(seen.size).toBe(YOUTUBE_KEYWORDS.length);
  });
});

describe("filtr słów kluczowych (RSS)", () => {
  const item = { title: "Pozyczka pod zastaw mieszkania — opinie?", snippet: "Mam komornika" };

  it("ignoruje wielkość liter i polskie znaki, łapie rdzenie", () => {
    expect(matchesKeywords(item, ["pożyczk"])).toBe(true);
    expect(matchesKeywords(item, ["KOMORNI"])).toBe(true);
    expect(matchesKeywords(item, ["leasing"])).toBe(false);
    expect(matchesKeywords({ title: "Długi i ZADŁUŻENIE", snippet: "" }, ["zadluz"])).toBe(true);
  });

  it("pusta lista = wszystko; Google Alerts bez słów = bez filtra, inne feedy = domyślny filtr", () => {
    expect(matchesKeywords(item, [])).toBe(true);
    expect(
      feedKeywords({ url: "https://www.google.com/alerts/feeds/123/456", keywords: [] }),
    ).toEqual([]);
    expect(feedKeywords({ url: "https://forum.pl/rss", keywords: [] }).length).toBeGreaterThan(3);
    expect(feedKeywords({ url: "https://forum.pl/rss", keywords: [" hipoteka ", ""] })).toEqual([
      "hipoteka",
    ]);
  });

  it("wątki starsze niż 14 dni odpadają, brak daty przechodzi", () => {
    expect(isRecentThread(daysAgo(3), NOW)).toBe(true);
    expect(isRecentThread(daysAgo(20), NOW)).toBe(false);
    expect(isRecentThread(null, NOW)).toBe(true);
  });
});

describe("filmy YouTube", () => {
  const v = (over: Partial<YoutubeVideoInfo>): YoutubeVideoInfo => ({
    id: "v1",
    channelId: "c-obcy",
    channelTitle: "Kanał",
    title: "Tytuł",
    description: "",
    views: 5000,
    commentsEnabled: true,
    madeForKids: false,
    ...over,
  });

  it("bez własnego kanału, wyłączonych komentarzy, „dla dzieci”, małych i znanych — popularne najpierw", () => {
    const out = filterYoutubeVideos(
      [
        v({ id: "own", channelId: "c-moj" }),
        v({ id: "nocomments", commentsEnabled: false }),
        v({ id: "kids", madeForKids: true }),
        v({ id: "tiny", views: 120 }),
        v({ id: "known" }),
        v({ id: "ok-small", views: 2000 }),
        v({ id: "ok-big", views: 90_000 }),
        v({ id: "ok-big", views: 90_000 }),
      ],
      { ownChannelId: "c-moj", known: new Set([dedupeKeyFor("youtube_comment", "known")]) },
    );
    expect(out.map((x) => x.id)).toEqual(["ok-big", "ok-small"]);
  });
});

describe("szkice AI — parsowanie i twarde reguły", () => {
  it("śmieci i „skip” = brak pozycji", () => {
    expect(parseDraft(null).action).toBe("skip");
    expect(parseDraft({ action: "draft", text: "" }).action).toBe("skip");
    expect(parseDraft({ action: "skip", reason: "nie na temat" })).toEqual({
      action: "skip",
      text: "",
      reason: "nie na temat",
    });
  });

  it("komentarz YT/IG: bez linków, bez marki, w limicie znaków, bez obietnic", () => {
    const good =
      "Warto dodać, że przy pożyczce pod zastaw kluczowa jest wycena nieruchomości i księga wieczysta — przed podpisaniem dobrze sprawdzić wpisy w dziale III i IV.";
    expect(finalizeDraft("youtube_comment", { action: "draft", text: good })).toEqual({
      ok: true,
      text: good,
    });
    expect(vetDraft("youtube_comment", `${good} https://financeyou.pl`).join(" ")).toMatch(/Link/);
    expect(vetDraft("instagram_comment", "Polecam Finance You!").join(" ")).toMatch(/marki/);
    expect(vetDraft("youtube_comment", "x".repeat(401)).join(" ")).toMatch(/za długa/);
    expect(vetDraft("instagram_comment", "x".repeat(301)).join(" ")).toMatch(/za długa/);
    expect(vetDraft("youtube_comment", "To inwestycja bez ryzyka.").length).toBeGreaterThan(0);
    expect(vetDraft("youtube_comment", "Podaj swój numer telefonu.").length).toBeGreaterThan(0);
    const r = finalizeDraft("youtube_comment", { action: "draft", text: "Gwarantujemy zysk!" });
    expect(r.ok).toBe(false);
  });

  it("forum: link tylko do financeyou.pl i najwyżej raz, ≤ 700 zn.", () => {
    const link = "https://financeyou.pl/r/abc123";
    expect(vetDraft("forum_reply", `Sprawdź wpisy w księdze wieczystej. Więcej: ${link}`)).toEqual(
      [],
    );
    expect(vetDraft("forum_reply", "Zobacz https://konkurencja.pl/oferta").join(" ")).toMatch(
      /Obcy link/,
    );
    expect(vetDraft("forum_reply", `${link} i jeszcze ${link}`).join(" ")).toMatch(
      /więcej niż raz/,
    );
    expect(vetDraft("forum_reply", "a".repeat(701)).join(" ")).toMatch(/za długa/);
  });
});

describe("mailto", () => {
  it("koduje temat i treść, nowe linie jako CRLF", () => {
    const m = buildMailto(
      "redakcja@portal.pl",
      "Komentarz: rynek & ceny",
      "Dzień dobry,\nnasz tekst?",
    )!;
    expect(m.startsWith("mailto:redakcja@portal.pl?subject=")).toBe(true);
    expect(m).toContain("Komentarz%3A%20rynek%20%26%20ceny");
    expect(m).toContain("&body=Dzie%C5%84%20dobry%2C%0D%0Anasz%20tekst%3F");
    expect(decodeURIComponent(m.split("&body=")[1])).toBe("Dzień dobry,\r\nnasz tekst?");
  });

  it("przycina za długą treść poniżej limitu, bez rozcinania emoji i %XX", () => {
    const body = "Zażółć gęślą jaźń 🙂 ".repeat(200);
    const m = buildMailto("a@b.pl", "Temat", body, 1800)!;
    expect(m.length).toBeLessThanOrEqual(1800);
    const decoded = decodeURIComponent(m.split("&body=")[1]);
    expect(decoded).toContain("[…] (pełna treść w mailu z listą akcji)");
    expect(decoded).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("zły adres = null", () => {
    expect(buildMailto("nie-mail", "T", "B")).toBeNull();
    expect(buildMailto("a@b", "T", "B")).toBeNull();
    expect(buildMailto("x@y.pl?cc=z@w.pl", "T", "B")).toBeNull();
  });
});

describe("pozycje PR / outreach / katalogi", () => {
  const opp = {
    id: "opp-1",
    source: "Money.pl",
    url: "https://www.money.pl/artykul",
    topic: "Rynek nieruchomości",
    snippet: "Lead artykułu",
    draft_subject: "Komentarz ekspercki",
    draft_body: "Dzień dobry,\n…\nFilip Bielak\nhttps://financeyou.pl",
    recipient_email: null as string | null,
  };

  it("PR z adresem → mailto; bez adresu → link do artykułu i instrukcja", () => {
    const withMail = buildPrItem({ ...opp, recipient_email: "autor@money.pl" })!;
    expect(withMail.url.startsWith("mailto:autor@money.pl")).toBe(true);
    expect(withMail.extra.page_url).toBe(opp.url);
    expect(withMail.dedupe_key).toBe("pr:opp-1");
    const noMail = buildPrItem(opp)!;
    expect(noMail.url).toBe(opp.url);
    expect(noMail.extra.instructions).toMatch(/redakcji/);
    expect(buildPrItem({ ...opp, draft_body: null })).toBeNull();
  });

  it("outreach: link do strony + „zakładka Kontakt”, albo mailto przy znanym adresie", () => {
    const t = {
      id: "t-1",
      domain: "portal.pl",
      url: null,
      contact_email: null,
      niche: "finanse",
      notes: null,
    };
    const msg = { id: "m-1", subject: "Współpraca", body: "Dzień dobry" };
    const a = buildOutreachItem(t, msg);
    expect(a.url).toBe("https://portal.pl");
    expect(a.extra.instructions).toMatch(/zakładce Kontakt/);
    expect(a.extra.outreach_message_id).toBe("m-1");
    const b = buildOutreachItem({ ...t, contact_email: "red@portal.pl" }, msg);
    expect(b.url.startsWith("mailto:red@portal.pl")).toBe(true);
  });

  it("katalogi: opis ≤ 750 zn. bez zakazanych fraz, kolejny katalog aż do końca listy", () => {
    expect(DIRECTORY_DESCRIPTION.length).toBeLessThanOrEqual(750);
    expect(findBannedClaims(DIRECTORY_DESCRIPTION)).toEqual([]);
    expect(DIRECTORY_DESCRIPTION).not.toMatch(/gwarant/i);
    const text = buildDirectoryListingText();
    expect(text).toContain("Strona WWW: https://financeyou.pl");
    expect(text).toContain("NIP 7010611803");
    expect(nextDirectory(new Set())?.id).toBe("google_business");
    const allButLast = new Set(
      DIRECTORIES.slice(0, -1).map((d) => dedupeKeyFor("directory_listing", d.id)),
    );
    expect(nextDirectory(allButLast)?.id).toBe(DIRECTORIES.at(-1)!.id);
    const all = new Set(DIRECTORIES.map((d) => dedupeKeyFor("directory_listing", d.id)));
    expect(nextDirectory(all)).toBeNull();
    expect(buildDirectoryItem(DIRECTORIES[0]).url).toBe("https://business.google.com");
  });
});

describe("wybór pozycji do maila", () => {
  let seq = 0;
  const it_ = (kind: EngagementKind, age: number) => ({
    id: `id-${++seq}`,
    kind,
    created_at: daysAgo(age),
  });

  it("limity per rodzaj, najstarsze najpierw, nieaktualne odpadają", () => {
    const items = [
      it_("youtube_comment", 1),
      it_("youtube_comment", 3),
      it_("youtube_comment", 2),
      it_("youtube_comment", 0),
      it_("youtube_comment", 9), // film starszy niż 7 dni
      it_("instagram_comment", 5), // post starszy niż 3 dni
    ];
    const out = selectDigestItems(items, { now: NOW });
    expect(out.map((o) => o.created_at)).toEqual([daysAgo(3), daysAgo(2), daysAgo(1)]);
  });

  it("razem najwyżej 10 — po równo między rodzajami, w kolejności grup", () => {
    const items: ReturnType<typeof it_>[] = [];
    for (const kind of Object.keys(DIGEST_LIMITS) as EngagementKind[]) {
      for (let i = 0; i < 5; i++) items.push(it_(kind, i * 0.1));
    }
    const out = selectDigestItems(items, { now: NOW });
    expect(out).toHaveLength(DIGEST_MAX_ITEMS);
    const count = (k: EngagementKind) => out.filter((o) => o.kind === k).length;
    expect(count("pr_pitch")).toBe(2);
    expect(count("outreach_pitch")).toBe(1);
    expect(count("directory_listing")).toBe(1);
    expect(count("youtube_comment")).toBeLessThanOrEqual(3);
    expect(count("forum_reply")).toBeLessThanOrEqual(3);
    expect(count("instagram_comment")).toBeLessThanOrEqual(2);
    for (const k of Object.keys(DIGEST_LIMITS) as EngagementKind[]) {
      expect(count(k)).toBeGreaterThanOrEqual(1);
    }
    // Grupy w kolejności maila: PR, outreach, fora, YouTube, Instagram, katalogi.
    expect(out[0].kind).toBe("pr_pitch");
    expect(out.at(-1)!.kind).toBe("directory_listing");
  });

  it("pusto = pusto; szacowany czas zaokrąglony do 5 min", () => {
    expect(selectDigestItems([], { now: NOW })).toEqual([]);
    expect(estimateMinutes([])).toBe(5);
    expect(
      estimateMinutes([
        { kind: "pr_pitch" },
        { kind: "pr_pitch" },
        { kind: "directory_listing" },
        { kind: "forum_reply" },
      ]),
    ).toBe(15);
  });
});

describe("backlink po „Zrobione”", () => {
  it("tylko z linkiem do financeyou.pl i stroną źródłową; e-mail się nie liczy", () => {
    expect(findOwnLink("Pisz na kontakt@financeyou.pl")).toBeNull();
    expect(findOwnLink("Więcej: financeyou.pl/r/abc12345.")).toBe(
      "https://financeyou.pl/r/abc12345",
    );
    const forum = backlinkForDoneItem({
      kind: "forum_reply",
      url: "https://forum.pl/watek/1",
      title: "Pożyczka pod zastaw?",
      suggested_text: "Odpowiedź… https://financeyou.pl/r/abc12345",
      extra: { page_url: "https://forum.pl/watek/1" },
    })!;
    expect(forum).toMatchObject({
      source_domain: "forum.pl",
      target_url: "https://financeyou.pl/r/abc12345",
      link_type: "forum",
      status: "pending",
    });
    // PR przez mailto: źródłem jest strona artykułu, nie mailto.
    const pr = backlinkForDoneItem({
      kind: "pr_pitch",
      url: "mailto:a@b.pl?subject=x",
      title: "Artykuł",
      suggested_text: "Filip Bielak\nhttps://financeyou.pl",
      extra: { page_url: "https://www.money.pl/a" },
    })!;
    expect(pr.source_url).toBe("https://www.money.pl/a");
    expect(pr.link_type).toBe("editorial");
    expect(
      backlinkForDoneItem({
        kind: "youtube_comment",
        url: "https://www.youtube.com/watch?v=1",
        title: "Film",
        suggested_text: "Merytoryczny komentarz bez linku.",
        extra: {},
      }),
    ).toBeNull();
    expect(backlinkForDoneItem(buildDirectoryItem(DIRECTORIES[2]))?.link_type).toBe("directory");
  });
});

describe("konfiguracja", () => {
  it("adresat i wyłącznik", () => {
    expect(digestRecipient({ DAILY_DIGEST_EMAIL: "szef@x.pl", TEAM_NOTIFY_EMAIL: "t@x.pl" })).toBe(
      "szef@x.pl",
    );
    expect(digestRecipient({ TEAM_NOTIFY_EMAIL: "t@x.pl" })).toBe("t@x.pl");
    expect(digestRecipient({})).toBe("kontakt@financeyou.pl");
    expect(digestEnabled("off")).toBe(false);
    expect(digestEnabled(" OFF ")).toBe(false);
    expect(digestEnabled(undefined)).toBe(true);
  });

  it("błąd uprawnień Meta rozpoznany po kodzie i treści", () => {
    expect(
      isMetaPermissionError("Meta Graph: Aplikacja nie ma uprawnień do tej operacji (kod 10)."),
    ).toBe(true);
    expect(
      isMetaPermissionError("Meta Graph: Token Meta nie ma wymaganych uprawnień (kod 200)."),
    ).toBe(true);
    expect(isMetaPermissionError("Meta Graph: Limit zapytań aplikacji w Meta (kod 4).")).toBe(
      false,
    );
  });
});
