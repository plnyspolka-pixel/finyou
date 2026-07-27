import { describe, it, expect } from "vitest";
import { parseRcnGml } from "./rcn-gml";
import { rcnStatusMessage } from "./rcn-geoportal.server";

// Syntetyczny GML odwzorowujący eksport RCN: dwie transakcje (lokal + działka)
// z geometrią punktową w EPSG:2180. Współrzędne dobrane tak, by po reprojekcji
// trafiały w granice Polski (lon≈19, lat≈52).
const RCN_GML = `<?xml version="1.0" encoding="UTF-8"?>
<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:rcn="urn:rcn">
  <gml:featureMember>
    <rcn:Lokal gml:id="L.1">
      <rcn:cenaTransakcji>480000</rcn:cenaTransakcji>
      <rcn:polePowierzchniUzytkowej>48.5</rcn:polePowierzchniUzytkowej>
      <rcn:dataZawarcia>2024-06-15</rcn:dataZawarcia>
      <rcn:rodzajNieruchomosci>lokal mieszkalny</rcn:rodzajNieruchomosci>
      <rcn:geometria><gml:Point srsName="EPSG:2180"><gml:pos>500000 486000</gml:pos></gml:Point></rcn:geometria>
    </rcn:Lokal>
  </gml:featureMember>
  <gml:featureMember>
    <rcn:Dzialka gml:id="D.1">
      <rcn:cenaTransakcji>180000</rcn:cenaTransakcji>
      <rcn:powierzchnia>30000</rcn:powierzchnia>
      <rcn:dataZawarcia>01.09.2023</rcn:dataZawarcia>
      <rcn:sposobKorzystania>R</rcn:sposobKorzystania>
      <rcn:geometria><gml:Point srsName="EPSG:2180"><gml:pos>500100 486100</gml:pos></gml:Point></rcn:geometria>
    </rcn:Dzialka>
  </gml:featureMember>
</gml:FeatureCollection>`;

describe("parseRcnGml — eksport RCN (GML)", () => {
  const recs = parseRcnGml(RCN_GML);

  it("parsuje obie transakcje z geometrią w granicach Polski", () => {
    expect(recs.length).toBe(2);
    for (const r of recs) {
      expect(r.lat).toBeGreaterThan(48.5);
      expect(r.lat).toBeLessThan(55.5);
      expect(r.lng).toBeGreaterThan(13.5);
      expect(r.lng).toBeLessThan(24.6);
    }
  });

  it("lokal: cena, powierzchnia, data ISO, cena/m²", () => {
    const lokal = recs.find((r) => r.propertyKind === "lokal");
    expect(lokal).toBeTruthy();
    expect(lokal!.pricePln).toBe(480000);
    expect(lokal!.areaM2).toBe(48.5);
    expect(lokal!.txDate).toBe("2024-06-15");
    expect(Math.round(lokal!.pricePerM2!)).toBe(9897); // 480000 / 48,5
  });

  it("działka: powierzchnia w ha, konwersja daty dd.mm.rrrr, cena/ha", () => {
    const dz = recs.find((r) => r.propertyKind === "dzialka");
    expect(dz).toBeTruthy();
    expect(dz!.areaHa).toBe(3); // 30000 m² = 3 ha
    expect(dz!.txDate).toBe("2023-09-01"); // dd.mm.rrrr → ISO
    expect(dz!.pricePerHa).toBe(60000); // 180000 / 3 ha
    expect(dz!.landUse).toBe("R");
  });

  it("pusty / niepoprawny wejściowy GML → brak rekordów", () => {
    expect(parseRcnGml("")).toEqual([]);
    expect(parseRcnGml("not xml")).toEqual([]);
  });
});

describe("rcnStatusMessage", () => {
  it("mapuje statusy na komunikaty", () => {
    expect(rcnStatusMessage("success")).toMatch(/porównawcze/i);
    expect(rcnStatusMessage("no_features")).toMatch(/wybrane miasta/i);
    expect(rcnStatusMessage("missing_coordinates")).toMatch(/współrzędnych/i);
  });
});
