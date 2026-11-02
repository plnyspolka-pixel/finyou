import { describe, expect, it } from "vitest";
import { classifyIndexedCourtHit } from "./owner-intelligence.server";
import { parseGoogleResultsHtml } from "./public-index-search.server";
import type { IndexedSearchResult } from "./public-index-search.server";

const owner = { kind: "person" as const, name: "Marcin Gerbatowski" };
const indexed = (url: string, title: string, snippet: string): IndexedSearchResult => ({
  url, title, snippet, engine: "google_serper",
});

describe("Publiczny indeks KRZ/MSiG — klasyfikacja", () => {
  it("wyłapuje sygnaturę blisko imienia i nazwiska bez potwierdzania tożsamości", () => {
    const hit = classifyIndexedCourtHit(owner,
      indexed(
        "https://www.krpu.pl/lista-syndykow/mazowieckie/paulina-pchla",
        "Lista spraw",
        'GD1G/GRz-nu/125/2025 "SZYMEX" MARCIN GERBATOWSKI (Kościerzyna)',
      ));
    expect(hit?.caseSignature).toBe("GD1G/GRz-nu/125/2025");
    expect(hit?.match).toBe("name_only");
    expect(hit?.source).toContain("KRPU.pl");
  });

  it("rozpoznaje kolejność nazwisko–imię z ogłoszeń sądowych", () => {
    const hit = classifyIndexedCourtHit(owner, indexed(
      "https://www.krpu.pl/lista",
      "Sprawy",
      "GD1G/GRz-nu/125/2025 GERBATOWSKI MARCIN (Kościerzyna)",
    ));
    expect(hit?.match).toBe("name_only");
  });

  it("nie klasyfikuje ogólnej strony firmowej z komunikatem brak wpisów", () => {
    expect(classifyIndexedCourtHit(owner, indexed(
      "https://www.bizraport.pl/krs/0001013574",
      "Firma",
      "Marcin Gerbatowski — nie figuruje w KRZ, brak wpisów",
    ))).toBeNull();
  });

  it("nie dopisuje cudzej sprawy z odległej pozycji katalogu", () => {
    expect(classifyIndexedCourtHit(owner, indexed(
      "https://www.krpu.pl/lista",
      "Lista spraw",
      "GD1G/GRz/98/2025 Inny Dłużnik " + "X".repeat(250) + " Marcin Gerbatowski",
    ))).toBeNull();
  });

  it("nie traktuje zwykłego wpisu KRS w MSiG jako restrukturyzacji", () => {
    expect(classifyIndexedCourtHit(owner, indexed(
      "https://www.imsig.pl/numer/2025/179",
      "Monitor Sądowy i Gospodarczy",
      "Wpis do KRS, zmiana udziałów wspólnika Marcin Gerbatowski",
    ))).toBeNull();
  });

  it("rozpoznaje ogłoszenie o likwidacji spółki jako wzmiankę, nie dowód długu", () => {
    const c = { kind: "company" as const, name: "ARMAR SPÓŁKA JAWNA" };
    const hit = classifyIndexedCourtHit(c, indexed(
      "https://www.imsig.pl/numer/2020/44",
      "MSiG",
      "ARMAR SPÓŁKA JAWNA W LIKWIDACJI",
    ));
    expect(hit?.title).toContain("likwidacji");
    expect(hit?.match).toBe("name_only");
  });

  it("parsuje jawny organiczny wynik Google bez linku przekierowującego", () => {
    const html = '<div><a href="https://www.krpu.pl/lista-syndykow"><h3>Sprawy KRZ</h3></a><span>' +
      'GD1G/GRz-nu/125/2025 Marcin Gerbatowski</span></div>';
    expect(parseGoogleResultsHtml(html)).toMatchObject([
      { title: "Sprawy KRZ", url: "https://www.krpu.pl/lista-syndykow", engine: "google_html" },
    ]);
  });

  it("nie rozpoznaje strony Google CAPTCHA jako wyniku", () => {
    expect(parseGoogleResultsHtml("<html>Our systems have detected unusual traffic</html>")).toEqual([]);
  });
});
