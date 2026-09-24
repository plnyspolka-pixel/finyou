import { describe, expect, it } from "vitest";
import { kwHtmlToText } from "./kw";

describe("kwHtmlToText", () => {
  it("zachowuje wiersze tabel działu i rozdziela komórki", () => {
    const html =
      '<table><tr><td class="csTytul">Kwota</td><td class="csDane">300 000,00 PLN</td></tr>' +
      "<tr><td>Wierzyciel</td><td>BANK &amp; CO</td></tr></table>";
    expect(kwHtmlToText(html)).toBe("Kwota | 300 000,00 PLN\nWierzyciel | BANK & CO");
  });

  it("zwraca null dla pustej treści", () => {
    expect(kwHtmlToText(null)).toBeNull();
    expect(kwHtmlToText("<table></table>")).toBeNull();
  });
});
