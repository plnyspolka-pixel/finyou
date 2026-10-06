import { describe, expect, it } from "vitest";
import { actionsWord, buildDigestEmail, renderMarkPage, type DigestCard } from "./email";

const NOW = new Date("2026-10-06T05:30:00Z");

const card = (over: Partial<DigestCard>): DigestCard => ({
  id: "id-1",
  kind: "youtube_comment",
  source: "Kanał Finansowy",
  url: "https://www.youtube.com/watch?v=abc",
  title: "Jak działa hipoteka",
  snippet: "Opis filmu",
  suggested_text: "Pierwsza linia\nDruga linia",
  extra: {},
  created_at: NOW.toISOString(),
  doneUrl: "https://financeyou.pl/api/public/engagement/mark?t=DONE",
  skipUrl: "https://financeyou.pl/api/public/engagement/mark?t=SKIP",
  ...over,
});

describe("mail digestu", () => {
  const mail = buildDigestEmail({
    date: NOW,
    cards: [
      card({ id: "y1" }),
      card({
        id: "p1",
        kind: "pr_pitch",
        source: "Money.pl",
        title: "Artykuł <script>alert(1)</script>",
        snippet: 'Cytat z "cudzysłowem" & <b>tagiem</b>',
        url: "mailto:autor@money.pl?subject=Temat&body=Tre%C5%9B%C4%87",
        suggested_text: "Treść <img src=x onerror=alert(1)>",
        extra: { subject: "Komentarz ekspercki" },
      }),
    ],
    stats: { done7: 4, skipped7: 1 },
    sources: [
      { key: "youtube", state: "ok", added: 1 },
      { key: "instagram", state: "unavailable", added: 0, note: "Wymaga Public Content Access" },
    ],
  });

  it("temat z liczbą akcji i szacowanym czasem", () => {
    expect(mail.subject).toBe("Na dziś: 2 akcje (~5 min) — zaangażowanie i linki");
    expect(mail.html).toContain("~5 min");
  });

  it("escapuje treści z zewnątrz (tytuł, opis, tekst do wklejenia)", () => {
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img");
    expect(mail.html).not.toContain("<b>tagiem</b>");
    expect(mail.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(mail.html).toContain("&quot;cudzysłowem&quot; &amp;");
  });

  it("przyciski: Otwórz (link / gotowy mail), Zrobione, Pomiń; nowe linie jako <br>", () => {
    expect(mail.html).toContain('href="https://www.youtube.com/watch?v=abc"');
    expect(mail.html).toContain("Otwórz →");
    expect(mail.html).toContain("Otwórz gotowy mail →");
    expect(mail.html).toContain(
      'href="mailto:autor@money.pl?subject=Temat&amp;body=Tre%C5%9B%C4%87"',
    );
    expect(mail.html).toContain("✅ Zrobione");
    expect(mail.html).toContain("⏭ Pomiń");
    expect(mail.html).toContain("mark?t=DONE");
    expect(mail.html).toContain("Pierwsza linia<br>Druga linia");
    expect(mail.html).toContain("<strong>Temat:</strong> Komentarz ekspercki");
  });

  it("grupy w stałej kolejności (PR przed YouTube), numeracja ciągła", () => {
    expect(mail.html.indexOf("#1 · Komentarz ekspercki dla mediów")).toBeGreaterThan(-1);
    expect(mail.html.indexOf("#2 · Komentarz pod filmem YouTube")).toBeGreaterThan(
      mail.html.indexOf("#1 ·"),
    );
    expect(mail.text).toContain("#1 Komentarz ekspercki dla mediów (PR)");
    expect(mail.text).toContain("#2 Komentarz pod filmem YouTube");
    expect(mail.text).toContain(
      "Zrobione: https://financeyou.pl/api/public/engagement/mark?t=DONE",
    );
  });

  it("stopka: statystyki 7 dni i niedostępne źródła z podpowiedzią", () => {
    expect(mail.html).toContain("Ostatnie 7 dni: zrobione 4, pominięte 1.");
    expect(mail.html).toContain("Instagram: niedostępne — Wymaga Public Content Access");
    expect(mail.text).toContain("YouTube: 1 nowych");
  });

  it("stopka: wykryte automatycznie i wyszukiwarka niedostępna z podpowiedzią", () => {
    const m = buildDigestEmail({
      date: NOW,
      cards: [card({})],
      stats: { done7: 3, skipped7: 0, autoDetected: 2 },
      sources: [
        { key: "websearch", state: "unavailable", added: 0, note: "Ustaw GOOGLE_CSE_KEY" },
        { key: "forum", state: "ok", added: 1 },
      ],
    });
    for (const out of [m.html, m.text]) {
      expect(out).toContain("Ostatnie 7 dni: zrobione 3, pominięte 0. Wykryte automatycznie: 2.");
      expect(out).toContain("Fora (wyszukiwarka Google): niedostępne — Ustaw GOOGLE_CSE_KEY");
      expect(out).toContain("Fora (RSS): 1 nowych");
    }
    expect(mail.html).not.toContain("Wykryte automatycznie");
  });

  it("bez sekretu — bez linków oznaczania", () => {
    const m = buildDigestEmail({
      date: NOW,
      cards: [card({ doneUrl: null, skipUrl: null })],
      stats: { done7: 0, skipped7: 0 },
      sources: [],
    });
    expect(m.html).not.toContain("Zrobione</a>");
    expect(m.subject).toContain("1 akcja");
  });

  it("odmiana „akcja / akcje / akcji”", () => {
    expect([1, 2, 4, 5, 10, 12, 22].map(actionsWord)).toEqual([
      "akcja",
      "akcje",
      "akcje",
      "akcji",
      "akcji",
      "akcji",
      "akcje",
    ]);
  });
});

describe("strona po kliknięciu", () => {
  it("GET: formularz POST z tokenem (escapowanym), bez zapisu", () => {
    const html = renderMarkPage("confirm", 'abc"><script>x</script>');
    expect(html).toContain('<form method="post">');
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
    expect(html).not.toContain('"><script>x');
  });

  it("po zapisie: „Zapisane ✓” bez żadnych danych pozycji", () => {
    expect(renderMarkPage("done")).toContain("Zapisane ✓");
    expect(renderMarkPage("skip")).toContain("Pominięte ✓");
    expect(renderMarkPage("invalid")).toContain("Link nieważny");
    expect(renderMarkPage("done")).not.toContain("<form");
  });
});
