// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetKsefApiRoot, resolveKsefApiRoot } from "./api-root";

const HOST = "https://api.ksef.test";
const certs = () =>
  new Response(JSON.stringify([{ certificate: "x", usage: ["KsefTokenEncryption"] }]));

/** Atrapa MF: odpowiada tylko pod wskazanymi ścieżkami. */
function mf(working: string[]) {
  return vi.fn(async (url: string) =>
    working.some((p) => url === `${HOST}${p}/security/public-key-certificates`)
      ? certs()
      : new Response("<html>404</html>", { status: 404 }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  forgetKsefApiRoot();
  vi.unstubAllEnvs();
});

describe("resolveKsefApiRoot", () => {
  it("wybiera ścieżkę z aktualnej specyfikacji (/v2)", async () => {
    expect(await resolveKsefApiRoot(HOST, mf(["/v2", "/api/v2"]))).toBe(`${HOST}/v2`);
  });

  it("przechodzi na dotychczasową ścieżkę, gdy /v2 nie działa", async () => {
    expect(await resolveKsefApiRoot(HOST, mf(["/api/v2"]))).toBe(`${HOST}/api/v2`);
  });

  it("zapamiętuje wynik i wykrywa od nowa po zapomnieniu (zmiana adresacji MF)", async () => {
    const f1 = mf(["/api/v2"]);
    await resolveKsefApiRoot(HOST, f1);
    await resolveKsefApiRoot(HOST, f1);
    expect(f1).toHaveBeenCalledTimes(2); // /v2 (404) + /api/v2 — tylko raz
    forgetKsefApiRoot(HOST);
    expect(await resolveKsefApiRoot(HOST, mf(["/v2"]))).toBe(`${HOST}/v2`);
  });

  it("KSEF_API_PATH wymusza nową ścieżkę bez zmian w kodzie", async () => {
    vi.stubEnv("KSEF_API_PATH", "v3");
    expect(await resolveKsefApiRoot(HOST, mf(["/v3", "/v2"]))).toBe(`${HOST}/v3`);
  });

  it("czytelny błąd, gdy żaden adres nie działa", async () => {
    await expect(resolveKsefApiRoot(HOST, mf([]))).rejects.toThrow(/KSEF_API_PATH/);
  });
});
