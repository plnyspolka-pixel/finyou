import { describe, it, expect } from "vitest";
import {
  parseLayerNamesFromWms,
  parseHtmlFeatures,
  extractFromProps,
  point2180,
  bbox2180,
  widthForScale,
} from "./rcn-geoportal.server";

// --- Fixtures odwzorowujące realny HTML GetFeatureInfo usługi RCN GUGiK ---
const WMS_CAPS = `<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0"><Capability><Layer>
  <Layer queryable="1"><Name>lokale</Name><Title>Lokale</Title></Layer>
  <Layer queryable="1"><Name>budynki</Name><Title>Budynki</Title></Layer>
  <Layer queryable="1"><Name>dzialki</Name><Title>Działki</Title></Layer>
  <Layer queryable="0"><Name>powiaty</Name><Title>Powiaty</Title></Layer>
</Layer></Capability></WMS_Capabilities>`;

const HTML_LOKAL = `<html><body>
<div class="accordion">
  <span style="font-weight:bold;color:#333">Lokal: 12/3</span>
  <h3>Dane transakcji</h3><ul>
    <li><span class="list-item-value">Cena brutto:</span> 480000</li>
    <li><span class="list-item-value">Data:</span> 2024-06-15</li>
  </ul>
  <h3>Lokal</h3><ul>
    <li><span class="list-item-value">Pow. użytkowa:</span> 48,5</li>
  </ul>
</div>
</body></html>`;

const HTML_DZIALKA = `<html><body>
<div class="accordion">
  <span style="font-weight:bold">Działka: 123/4</span>
  <h3>Dane transakcji</h3><ul>
    <li><span class="list-item-value">Cena brutto:</span> 180000</li>
    <li><span class="list-item-value">Data:</span> 01.09.2023</li>
  </ul>
  <h3>Nieruchomość</h3><ul>
    <li><span class="list-item-value">Pow. gruntu:</span> 30000</li>
    <li><span class="list-item-value">Rodzaj:</span> R</li>
  </ul>
</div>
</body></html>`;

const HTML_EMPTY = `<html><body><p>Brak obiektów w zapytanym punkcie.</p></body></html>`;

describe("parseLayerNamesFromWms", () => {
  it("wyłuskuje warstwy RCN z GetCapabilities", () => {
    const layers = parseLayerNamesFromWms(WMS_CAPS);
    expect(layers).toContain("lokale");
    expect(layers).toContain("budynki");
    expect(layers).toContain("dzialki");
  });
});

describe("parseHtmlFeatures + extractFromProps — lokal (zł/m²)", () => {
  it("parsuje transakcję lokalu i liczy cenę za m²", () => {
    const feats = parseHtmlFeatures(HTML_LOKAL, "lokale");
    expect(feats.length).toBe(1);
    const raw = extractFromProps(feats[0], "lokale");
    expect(raw.totalPrice).toBe(480000);
    expect(raw.areaM2).toBe(48.5);
    expect(raw.date).toBe("2024-06-15");
    expect(Math.round(raw.pricePerM2!)).toBe(9897); // 480000 / 48,5
  });
});

describe("parseHtmlFeatures + extractFromProps — działka (zł/ha)", () => {
  it("parsuje transakcję działki i liczy cenę za hektar", () => {
    const feats = parseHtmlFeatures(HTML_DZIALKA, "dzialki");
    expect(feats.length).toBe(1);
    const raw = extractFromProps(feats[0], "dzialki");
    expect(raw.totalPrice).toBe(180000);
    expect(raw.areaHa).toBe(3);                 // 30000 m² = 3 ha
    expect(raw.date).toBe("2023-09-01");        // konwersja dd.mm.rrrr → ISO
    expect(raw.pricePerHa).toBe(60000);         // 180000 / 3 ha
  });
});

describe("parseHtmlFeatures — pusty wynik", () => {
  it("nie zwraca cech dla pustego HTML", () => {
    expect(parseHtmlFeatures(HTML_EMPTY, "lokale").length).toBe(0);
    expect(parseHtmlFeatures("", "lokale").length).toBe(0);
  });
});

describe("współrzędne i bbox (EPSG:2180)", () => {
  it("point2180 przelicza Warszawę do sensownego zakresu PUWG1992", () => {
    const [x, y] = point2180(52.2297, 21.0122);
    expect(x).toBeGreaterThan(620000);
    expect(x).toBeLessThan(650000);
    expect(y).toBeGreaterThan(475000);
    expect(y).toBeLessThan(495000);
  });

  it("bbox2180 tworzy kwadrat o boku 2r wokół punktu", () => {
    const [minX, minY, maxX, maxY] = bbox2180(52.2297, 21.0122, 600);
    expect(Math.round(maxX - minX)).toBe(1200);
    expect(Math.round(maxY - minY)).toBe(1200);
  });

  it("widthForScale utrzymuje scaleDenominator ≤ limitu i mieści się w 512..4096", () => {
    const w = widthForScale(1200, 2000);
    expect(w).toBeGreaterThanOrEqual(512);
    expect(w).toBeLessThanOrEqual(4096);
    const pixelSize = 1200 / w;                 // m/px
    const scaleDenom = (pixelSize * 1000) / 0.28;
    expect(scaleDenom).toBeLessThanOrEqual(2000);
  });
});
