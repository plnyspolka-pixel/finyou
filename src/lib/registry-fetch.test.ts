import { afterEach, describe, expect, it, vi } from "vitest";
import { isGatewayDenial, registryGet } from "./registry-fetch.server";

const CEIDG = "https://dane.biznes.gov.pl/api/ceidg/v3/firmy?nip=5260250274";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("registryGet", () => {
  it("idzie przez registry-proxy, gdy funkcja odpowiada", async () => {
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    const fetchMock = vi.fn(
      async () =>
        new Response('{"firmy":[]}', { status: 200, headers: { "x-registry-proxy": "1" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await registryGet(CEIDG, { headers: { Authorization: "Bearer t" } });
    expect(r).toMatchObject({ ok: true, viaProxy: true, text: '{"firmy":[]}' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x.supabase.co/functions/v1/registry-proxy");
    expect(JSON.parse(String(init.body))).toEqual({
      url: CEIDG,
      headers: { Authorization: "Bearer t" },
    });
  });

  it("gdy funkcja nie jest wdrożona (404 bez nagłówka) — żądanie bezpośrednie", async () => {
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("Function not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await registryGet(CEIDG);
    expect(r).toMatchObject({ ok: true, viaProxy: false });
    expect(fetchMock.mock.calls[1][0]).toBe(CEIDG);
  });

  it("prefer: direct — najpierw bezpośrednio, przy blokadzie przez proxy", async () => {
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("blocked", { status: 403 }))
      .mockResolvedValueOnce(
        new Response("[]", { status: 200, headers: { "x-registry-proxy": "1" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const r = await registryGet("https://nominatim.openstreetmap.org/search?q=x", {
      prefer: "direct",
    });
    expect(r).toMatchObject({ ok: true, viaProxy: true });
    expect(fetchMock.mock.calls[0][0]).toBe("https://nominatim.openstreetmap.org/search?q=x");
    expect(fetchMock.mock.calls[1][0]).toBe("https://x.supabase.co/functions/v1/registry-proxy");
  });

  it("prefer: direct — udane zapytanie bezpośrednie nie idzie przez proxy", async () => {
    vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await registryGet("https://nominatim.openstreetmap.org/search?q=x", {
      prefer: "direct",
    });
    expect(r).toMatchObject({ ok: true, viaProxy: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rozpoznaje stronę odmowy bramy Akamai", () => {
    expect(isGatewayDenial(403, "<HTML><TITLE>Access Denied</TITLE>")).toBe(true);
    expect(isGatewayDenial(403, '{"message":"Forbidden"}')).toBe(false);
    expect(isGatewayDenial(401, "Access Denied")).toBe(false);
  });
});
