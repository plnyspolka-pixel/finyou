import { describe, expect, it } from "vitest";
import {
  extractListingsFromText,
  extractPortalAvgPpm2,
  marketCategory,
  parseDeweloperuchTable,
  dropImplausibleTransactions,
  parseJsonLdListings,
  parseOtodomNextData,
} from "./real-estate-market.server";
import { computePortalStats } from "./portal-valuation.server";
import { extractJsonLd, extractNextData, __test } from "@/lib/web-fetch.server";

describe("marketCategory", () => {
  it("mapuje typy wniosku na kategorie portali", () => {
    expect(marketCategory("mieszkanie")).toBe("mieszkanie");
    expect(marketCategory("dom")).toBe("dom");
    expect(marketCategory("dzialka_budowlana")).toBe("dzialka");
    expect(marketCategory("grunt_rolny")).toBe("dzialka");
    expect(marketCategory("lokal_uslugowy")).toBe("lokal");
    expect(marketCategory("inna")).toBeNull();
  });
});

describe("deweloperuch — tabela transakcji (HTML)", () => {
  const html = `<table class="min-w-full"><thead><tr><th>Data</th><th>Adres</th><th>Pow.</th><th>Cena</th><th>zł/m²</th></tr></thead>
    <tbody>
      <tr><td>12.03.2026</td><td>ul. Żytnia 13</td><td>72 m²</td><td>1 483 100 zł</td><td>20 599 zł/m²</td></tr>
      <tr><td>2026-02-01</td><td>ul. Sielecka 5</td><td>39 m²</td><td>720 000 zł</td><td></td></tr>
      <tr><td>brak daty</td><td>x</td><td>10 m²</td><td>1 zł</td><td></td></tr>
    </tbody></table>`;

  it("wyciąga cenę, metraż, datę i zł/m²", () => {
    const rows = parseDeweloperuchTable(html);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: "transaction",
      pricePln: 1_483_100,
      areaM2: 72,
      pricePerM2: 20_599,
      date: "12.03.2026",
    });
    // Brak kolumny zł/m² → liczone z ceny i metrażu.
    expect(rows[1].pricePerM2).toBe(Math.round(720_000 / 39));
  });

  it("kolumna zł/m² bez jednostki nie jest brana za cenę całkowitą", () => {
    // Kraków, 25.09: „15 720" przy 36,3 m² dawało 433 zł/m² i wycenę ~13 tys. zł.
    const rows = parseDeweloperuchTable(
      `<table><tr><td>28.08.2026</td><td>Lok. 360</td><td>36,3 m²</td><td>15 720 zł</td></tr></table>`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].pricePerM2).toBe(15_720);
    expect(rows[0].pricePln).toBe(Math.round(15_720 * 36.3));
  });

  it("filtruje po ulicy", () => {
    const rows = parseDeweloperuchTable(html, "Sielecka");
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toContain("Sielecka");
  });
});

describe("morizon/gratka — JSON-LD", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Mieszkania Warszawa",
    offers: {
      "@type": "AggregateOffer",
      offerCount: 1234,
      offers: [
        {
          "@type": "Offer",
          price: "780000.00",
          priceCurrency: "PLN",
          url: "https://www.morizon.pl/oferta/1",
          itemOffered: {
            "@type": "Apartment",
            floorSize: { "@type": "QuantitativeValue", value: 61.7, unitCode: "MTK" },
            address: { addressLocality: "Bemowo" },
            numberOfRooms: 3,
          },
        },
        {
          "@type": "Offer",
          price: 450000,
          url: "https://www.morizon.pl/oferta/2",
          itemOffered: { floorSize: { value: "30" } },
        },
      ],
    },
  })}</script>
  <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Ile kosztuje m²?","acceptedAnswer":{"@type":"Answer","text":"Średnia cena mieszkania w Warszawie to 18 762 zł/m²."}}]}</script>`;

  it("parsuje oferty, liczbę ogłoszeń i średnią cenę z FAQ", () => {
    const { listings, totalListings, avgPpm2 } = parseJsonLdListings(
      extractJsonLd(html),
      "morizon.pl",
    );
    expect(totalListings).toBe(1234);
    expect(avgPpm2).toBe(18_762);
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      pricePln: 780_000,
      areaM2: 61.7,
      pricePerM2: Math.round(780_000 / 61.7),
      url: "https://www.morizon.pl/oferta/1",
      address: "Bemowo",
    });
  });
});

describe("otodom — __NEXT_DATA__", () => {
  const next = {
    props: {
      pageProps: {
        data: {
          searchAds: {
            items: [
              {
                title: "3 pokoje",
                slug: "3-pokoje-ID1",
                totalPrice: { value: 600000 },
                areaInSquareMeters: 50,
                pricePerSquareMeter: { value: 12000 },
                isPrivateOwner: false,
                agency: { name: "Biuro" },
                location: { address: { city: { name: "Lublin" } } },
              },
              {
                title: "Kawalerka",
                slug: "kawalerka-ID2",
                totalPrice: { value: 300000 },
                areaInSquareMeters: 30,
                isPrivateOwner: true,
                agency: null,
              },
            ],
            pagination: { totalResults: 812 },
          },
        },
      },
    },
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script>`;

  it("parsuje oferty i wystawców", () => {
    const parsed = parseOtodomNextData(extractNextData(html));
    expect(parsed.totalListings).toBe(812);
    expect(parsed.listings).toHaveLength(2);
    expect(parsed.listings[0]).toMatchObject({
      postedBy: "agency",
      pricePerM2: 12_000,
      url: "https://www.otodom.pl/pl/oferta/3-pokoje-ID1",
      address: "Lublin",
    });
    expect(parsed.listings[1]).toMatchObject({ postedBy: "private", pricePerM2: 10_000 });
  });
});

describe("oferty z tekstu (OLX przez Jina, adresowo)", () => {
  const md = `Ogłoszenia
[Mieszkanie 2 pokoje, Czechów](https://www.olx.pl/d/oferta/mieszkanie-CID3-ID1.html)
450 000 zł
54 m² - 8333.33 zł/m²
Lublin, Czechów - Dzisiaj
[Kawalerka centrum](https://www.olx.pl/d/oferta/kawalerka-CID3-ID2.html)
299 000 zł do negocjacji
27 m²
Średnia cena mieszkań w Lublinie: 11 450 zł/m²`;

  it("paruje cenę z metrażem i linkiem", () => {
    const rows = extractListingsFromText(md, "olx.pl");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      pricePln: 450_000,
      areaM2: 54,
      pricePerM2: 8_333,
      url: "https://www.olx.pl/d/oferta/mieszkanie-CID3-ID1.html",
    });
    expect(rows[1]).toMatchObject({ pricePln: 299_000, areaM2: 27 });
  });

  it("czyta średnią cenę m² z nagłówka portalu", () => {
    expect(extractPortalAvgPpm2(md)).toBe(11_450);
  });
});

describe("dropImplausibleTransactions", () => {
  const row = (kind: "transaction" | "offer", pricePerM2: number) => ({
    source: (kind === "transaction" ? "deweloperuch.pl" : "otodom.pl") as
      | "deweloperuch.pl"
      | "otodom.pl",
    kind,
    postedBy: "unknown" as const,
    url: null,
    title: null,
    address: null,
    pricePln: null,
    areaM2: null,
    pricePerM2,
    date: null,
  });
  it("odrzuca transakcje nieprzystające do ofert z miasta", () => {
    const r = dropImplausibleTransactions([
      ...[433, 206, 183, 286].map((v) => row("transaction", v)),
      ...[17_998, 12_000, 16_140].map((v) => row("offer", v)),
    ]);
    expect(r.dropped).toBe(4);
    expect(r.listings.every((l) => l.kind === "offer")).toBe(true);
  });
  it("zostawia wiarygodne transakcje", () => {
    const r = dropImplausibleTransactions([
      ...[11_000, 12_500].map((v) => row("transaction", v)),
      ...[15_000, 14_000, 16_000].map((v) => row("offer", v)),
    ]);
    expect(r.dropped).toBe(0);
  });
});

describe("computePortalStats", () => {
  const base = {
    postedBy: "unknown" as const,
    url: null,
    title: null,
    address: null,
    pricePln: null,
    areaM2: null,
    date: null,
  };
  it("przy ≥3 transakcjach opiera się wyłącznie na transakcjach", () => {
    const stats = computePortalStats([
      ...[8000, 8200, 8400].map((v) => ({
        ...base,
        source: "deweloperuch.pl" as const,
        kind: "transaction" as const,
        pricePerM2: v,
      })),
      { ...base, source: "otodom.pl" as const, kind: "offer" as const, pricePerM2: 12_000 },
    ]);
    expect(stats.median).toBe(8200);
    expect(stats.transactions).toBe(3);
  });
  it("oferty bez transakcji korygowane o −5%", () => {
    const stats = computePortalStats(
      [10_000, 10_000, 10_000].map((v) => ({
        ...base,
        source: "otodom.pl" as const,
        kind: "offer" as const,
        pricePerM2: v,
      })),
    );
    expect(stats.median).toBe(9_500);
  });
});

describe("DuckDuckGo HTML", () => {
  it("dekoduje przekierowania uddg i wyciąga opisy", () => {
    const html = `<div class="result"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Frejestr.io%2Fkrs%2F123456%2Ffirma&amp;rut=x">Firma Sp. z o.o. - KRS 0000123456</a>
      <a class="result__snippet" href="#">Jan <b>Kowalski</b> — prezes zarządu</a></div>`;
    const res = __test.parseDuckDuckGoHtml(html, 5);
    expect(res).toEqual([
      {
        url: "https://rejestr.io/krs/123456/firma",
        title: "Firma Sp. z o.o. - KRS 0000123456",
        snippet: "Jan Kowalski — prezes zarządu",
      },
    ]);
  });
});

describe("KRS — numery z wyników wyszukiwania", async () => {
  const { extractKrsNumbers } = await import("@/lib/coowners/krs-person-search.server");
  it("czyta KRS z tekstu i z adresów rejestr.io", () => {
    expect(
      extractKrsNumbers({
        url: "https://rejestr.io/krs/123456/firma-sp-z-o-o",
        title: "FIRMA SP. Z O.O. — KRS 0000654321",
        snippet: "Jan Kowalski, prezes zarządu",
      }).sort(),
    ).toEqual(["0000123456", "0000654321"]);
  });
});
