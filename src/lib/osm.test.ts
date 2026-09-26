import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOverpassQuery,
  categorizeTags,
  nominatimMatches,
  osmGeocode,
  osmNearby,
} from "./osm.server";
import { osmEmbedUrl } from "./osm-embed";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("Nominatim — dopasowanie miejscowości", () => {
  const krakow = { address: { city: "Kraków", state: "województwo małopolskie" } };
  it("przyjmuje wynik z oczekiwanego miasta i województwa", () => {
    expect(nominatimMatches(krakow, "Kraków", "Małopolskie")).toBe(true);
    expect(nominatimMatches(krakow, "krakow", null)).toBe(true);
  });
  it("odrzuca ulicę o tej samej nazwie w innym mieście", () => {
    expect(nominatimMatches({ address: { city: "Warszawa" } }, "Kraków", null)).toBe(false);
    expect(nominatimMatches(krakow, "Kraków", "mazowieckie")).toBe(false);
  });
  it("wieś jako miejscowość", () => {
    expect(nominatimMatches({ address: { village: "Zielonki" } }, "Zielonki", null)).toBe(true);
  });
});

describe("Overpass", () => {
  it("buduje osobny zbiór i limit dla każdej kategorii", () => {
    const q = buildOverpassQuery(50.03, 19.99, 1500, ["pharmacies", "publicTransport"], 20);
    expect(q.startsWith("[out:json][timeout:25];")).toBe(true);
    expect(q).toContain(
      '(nwr(around:1500,50.030000,19.990000)["amenity"="pharmacy"];);out tags center 20;',
    );
    expect(q).toContain('["highway"="bus_stop"]');
    expect(q.match(/out tags center 20;/g)).toHaveLength(2);
  });

  it("klasyfikuje punkty po tagach", () => {
    expect(categorizeTags({ amenity: "pharmacy" })).toBe("pharmacies");
    expect(categorizeTags({ shop: "convenience" })).toBe("groceryStores");
    expect(categorizeTags({ railway: "tram_stop" })).toBe("publicTransport");
    expect(categorizeTags({ amenity: "bench" })).toBeNull();
  });

  it("grupuje wynik, liczy odległość i pomija duplikaty", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          elements: [
            {
              type: "node",
              id: 1,
              lat: 50.031,
              lon: 19.99,
              tags: { amenity: "pharmacy", name: "Apteka" },
            },
            { type: "node", id: 1, lat: 50.031, lon: 19.99, tags: { amenity: "pharmacy" } },
            {
              type: "way",
              id: 2,
              center: { lat: 50.03, lon: 19.991 },
              tags: { highway: "bus_stop" },
            },
          ],
        }),
      ),
    );
    const r = await osmNearby(50.03, 19.99, 1500, ["pharmacies", "publicTransport"]);
    expect(r?.pharmacies).toHaveLength(1);
    expect(r?.pharmacies[0]).toMatchObject({ name: "Apteka" });
    expect(r?.pharmacies[0].distance).toBeGreaterThan(100);
    expect(r?.publicTransport).toHaveLength(1);
  });

  it("przeciążony serwer Overpass — kolejna instancja", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("timeout", { status: 504 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            elements: [{ type: "node", id: 9, lat: 50, lon: 20, tags: { amenity: "pharmacy" } }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const r = await osmNearby(50, 20, 1500, ["pharmacies"]);
    expect(r?.pharmacies).toHaveLength(1);
    expect(String(fetchMock.mock.calls[1][0])).toContain("overpass.kumi.systems");
  });

  it("błąd Overpass = null (lokalizacja nieoceniona, nie „słaba”)", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("busy", { status: 429 })),
    );
    expect(await osmNearby(50, 20, 1500)).toBeNull();
  });
});

describe("geokodowanie", () => {
  it("wybiera wynik z oczekiwanego miasta", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          {
            lat: "52.2",
            lon: "21.0",
            display_name: "Komandosów, Warszawa",
            address: { city: "Warszawa" },
          },
          {
            lat: "50.0318",
            lon: "19.9912",
            display_name: "Komandosów 12, Kraków",
            addresstype: "building",
            osm_type: "way",
            osm_id: 7,
            address: { city: "Kraków", state: "województwo małopolskie" },
          },
        ]),
      ),
    );
    const g = await osmGeocode("Komandosów 12, Kraków", { expectedCity: "Kraków" });
    expect(g).toMatchObject({ lat: 50.0318, lng: 19.9912, approximate: false, osmId: "way/7" });
  });
});

describe("osmEmbedUrl", () => {
  it("osadza mapę z pinezką w punkcie", () => {
    const url = osmEmbedUrl(50.0318, 19.9912);
    expect(url).toContain("openstreetmap.org/export/embed.html");
    expect(url).toContain("marker=50.031800,19.991200");
  });
});
