import { describe, expect, it } from "vitest";
import { parseMpzpFeatureInfo } from "./mpzp";

const KRAKOW = `<html><style>table{}</style><body>FeatureInfoCollection - layer name: 'Przeznaczenia MPZP skala od 1:2000'
<table><tr><th>id_pg</th><th>Uchwalenie</th><th>Data uchwalenia</th><th>Data obowiązywania</th><th>Oznaczenie</th><th>Nazwa MPZP</th><th>WWW</th><th>opis_oznac</th></tr>
<tr><td>3530</td><td>XII/131/11</td><td>13.04.2011</td><td>17.06.2011</td><td>KP.1</td><td>STARE MIASTO</td><td>http://www.bip.krakow.pl/?dok_id=45241</td><td>Tereny plac&oacute;w miejskich</td></tr></table>
FeatureInfoCollection - layer name: 'Przeznaczenia MPZP - skala do 1:1000'
<table><tr><th>Oznaczenie</th><th>Nazwa MPZP</th><th>opis_oznac</th></tr><tr><td>KP.1</td><td>STARE MIASTO</td><td>Tereny plac&oacute;w miejskich</td></tr></table></body></html>`;

describe("MPZP — GetFeatureInfo", () => {
  it("odczytuje plan, symbol, przeznaczenie, uchwałę i link; bez powtórek", () => {
    const r = parseMpzpFeatureInfo(KRAKOW);
    expect(r.status).toBe("found");
    expect(r.plans).toHaveLength(1);
    expect(r.plans[0]).toMatchObject({
      planName: "STARE MIASTO",
      symbol: "KP.1",
      resolution: "XII/131/11",
      validFrom: "17.06.2011",
      url: "http://www.bip.krakow.pl/?dok_id=45241",
    });
  });

  it("gmina bez planu w punkcie", () => {
    const r = parseMpzpFeatureInfo(
      "<html><body>Pniewy: brak wyniku dla wskazanego obszaru</body></html>",
    );
    expect(r.status).toBe("none");
    expect(r.commune).toBe("Pniewy");
    expect(r.note).toMatch(/WZ/);
  });

  it("gmina poza integracją", () => {
    expect(parseMpzpFeatureInfo("<hr/>brak serwisu dla wskazanego obszaru").status).toBe(
      "unavailable",
    );
  });
});
